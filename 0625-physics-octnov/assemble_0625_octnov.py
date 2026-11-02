#!/usr/bin/env python3
"""
Assemble Cambridge IGCSE Physics (0625) October/November question papers and
mark schemes for components 41, 42 and 43 into one combined PDF.

WHAT THIS SCRIPT DOES
  1. Collects one source PDF per (year, component, type) pair.
  2. Verifies each PDF *by reading its own printed header* -- syllabus code,
     component number, exam session (October/November) and document type
     (QP vs MS) -- so a May/June or March paper can never slip in.
  3. Merges the verified PDFs, byte-for-byte page-for-page, in the order:
       year ascending -> QP41, MS41, QP42, MS42, QP43, MS43
  4. Adds a metadata-only contents page and PDF bookmarks (outline entries).
  5. Writes a machine-readable manifest with page counts + verification status.

NO CONTENT IS RETYPED OR RECREATED. Every page in the output is the original
page from the source PDF. The only generated page is the contents page, which
contains document metadata only (year / component / type / source host).

USAGE
  # RECOMMENDED: you already downloaded the official PDFs (e.g. from the
  # Cambridge School Support Hub, which you are entitled to access).
  python3 assemble_0625_octnov.py --from-dir ./papers

  # Or let the script fetch from a mirror (see PERMISSIONS below).
  python3 assemble_0625_octnov.py --download --source pastpapers \
      --i-confirm-my-use-is-permitted

  # Verify a directory without building anything.
  python3 assemble_0625_octnov.py --from-dir ./papers --verify-only

PERMISSIONS
  Cambridge's stated position (help.cambridgeinternational.org) is that
  teachers at Cambridge schools may freely download and print past papers from
  the School Support Hub for use with their students, but the materials may not
  be published or re-sold without prior approval. Sites such as pastpapers.co /
  PapaCambridge are third-party redistributions and are NOT authorised copies.
  This script therefore refuses to pull from a mirror unless you explicitly pass
  --i-confirm-my-use-is-permitted, and it records the real host in the manifest
  so nothing third-party is ever mislabelled as an official Cambridge file.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

try:
    from pypdf import PdfReader, PdfWriter
    from pypdf.errors import PdfReadError
except ImportError:  # pragma: no cover
    sys.exit("Missing dependency: pip install pypdf reportlab")

SYLLABUS = "0625"
SUBJECT = "Physics"
SESSION = "October/November"
COMPONENTS = ["41", "42", "43"]
KINDS = ["qp", "ms"]           # qp = question paper, ms = mark scheme
KIND_LABEL = {"qp": "Question Paper", "ms": "Mark Scheme"}

# Mirrors and their URL shapes. Cambridge's own public site does NOT publish the
# Oct/Nov 0625 series, so there is no official public URL to put here.
MIRRORS = {
    "pastpapers": (
        "https://pastpapers.co/caie/igcse/physics-0625/"
        "{year}-oct-nov/0625_w{yy}_{kind}_{comp}.pdf"
    ),
}


@dataclass
class Doc:
    year: int
    comp: str
    kind: str
    path: Path | None = None
    url: str = ""
    host: str = ""
    pages: int | None = None
    status: str = "missing"
    notes: list[str] = field(default_factory=list)

    @property
    def code(self) -> str:
        return f"0625_w{str(self.year)[2:]}_{self.kind}_{self.comp}"

    @property
    def title(self) -> str:
        return (f"{self.year} {SESSION} - "
                f"{KIND_LABEL[self.kind]} {self.comp}")


def build_plan(years: list[int]) -> list[Doc]:
    return [Doc(year=y, comp=c, kind=k)
            for y in years for c in COMPONENTS for k in KINDS]


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def first_pages_text(path: Path, n: int = 2) -> str:
    try:
        reader = PdfReader(str(path))
    except (PdfReadError, OSError) as exc:
        raise ValueError(f"unreadable PDF ({exc})") from exc
    text = "".join((p.extract_text() or "") for p in reader.pages[:n])
    return _norm(text)


def verify(doc: Doc, text: str, pages: int) -> None:
    """Check the document against its own printed header. Mutates doc."""
    doc.pages = pages
    problems: list[str] = []

    # 1. Syllabus code must be 0625.
    if not re.search(r"\b0625\b", text):
        problems.append("syllabus code 0625 not found on first page(s)")

    # 2. Subject.
    if "physics" not in text.lower():
        problems.append("subject 'Physics' not found")

    # 3. Component number, e.g. "0625/42".
    if not re.search(rf"\b{SYLLABUS}\s*/\s*{doc.comp}\b", text):
        problems.append(f"component token '{SYLLABUS}/{doc.comp}' not found")

    # 4. Session must be October/November of the right year.
    if not re.search(rf"october\s*/\s*november\s*{doc.year}\b", text, re.I):
        problems.append(f"'{SESSION} {doc.year}' not found")

    # 5. Guard: reject the wrong series outright.
    for bad in (r"may\s*/\s*june", r"february\s*/\s*march",
                r"feb\s*/\s*mar", r"february\s*/\s*april"):
        if re.search(bad, text, re.I):
            problems.append(f"looks like a different series (matched '{bad}')")
            break

    # 6. Document type.
    is_ms = bool(re.search(r"mark\s*scheme", text, re.I))
    if doc.kind == "ms" and not is_ms:
        problems.append("expected a MARK SCHEME but header says otherwise")
    if doc.kind == "qp" and is_ms:
        problems.append("expected a QUESTION PAPER but found 'mark scheme'")
    if not re.search(r"paper\s*4", text, re.I):
        problems.append("'Paper 4' not found (component 41/42/43 = Paper 4)")

    # 7. A mark scheme is not confidential instructions / an insert.
    if doc.kind == "qp" and re.search(r"confidential\s*instructions", text, re.I):
        problems.append("this is the Confidential Instructions, not the QP")

    doc.notes.extend(problems)
    doc.status = "verified" if not problems else "FAILED"


def probe(path: Path) -> dict:
    """Detect a document's identity from its own printed header text."""
    try:
        text = first_pages_text(path)
    except ValueError as exc:
        return {"error": str(exc)}
    if not text.strip():
        return {"error": "no text layer (scanned image?) - rename manually"}
    m_code = re.search(rf"\b({SYLLABUS})\s*/\s*(\d{{2}})\b", text)
    m_sess = re.search(r"october\s*/\s*november\s*(\d{4})", text, re.I)
    return {
        "syllabus": m_code.group(1) if m_code else None,
        "component": m_code.group(2) if m_code else None,
        "session": "October/November" if m_sess else None,
        "year": int(m_sess.group(1)) if m_sess else None,
        "kind": "ms" if re.search(r"mark\s*scheme", text, re.I) else "qp",
        "error": None,
    }


def build_index(src: Path) -> list[tuple[Path, dict]]:
    """Probe every PDF in the folder so files can be matched by content,
    not just by filename."""
    return [(p, probe(p)) for p in sorted(src.rglob("*.pdf"))]


def locate_by_name(doc: Doc, src: Path) -> bool:
    for pattern in (f"{doc.code}.pdf", f"{doc.code.upper()}.pdf"):
        cand = src / pattern
        if cand.is_file():
            doc.path = cand
            doc.host = "local folder (user-supplied)"
            return True
    for pattern in (f"*{doc.code}*.pdf", f"*{doc.code.upper()}*.pdf"):
        hits = sorted(src.glob(pattern))
        if hits:
            doc.path = hits[0]
            doc.host = "local folder (user-supplied)"
            return True
    return False


def locate_by_header(doc: Doc, index: list[tuple[Path, dict]]) -> bool:
    for path, meta in index:
        if meta.get("error"):
            continue
        if (meta.get("syllabus") == SYLLABUS
                and meta.get("component") == doc.comp
                and meta.get("year") == doc.year
                and meta.get("kind") == doc.kind
                and meta.get("session") == SESSION):
            doc.path = path
            doc.host = "local folder (matched by header, not filename)"
            doc.notes.append(f"filename '{path.name}' differs from "
                             f"expected '{doc.code}.pdf'")
            return True
    return False


def download(doc: Doc, url: str, dest: Path, delay: float) -> bool:
    import urllib.request
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        url, headers={"User-Agent": "0625-paper-assembler/1.0 (educational)"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
    except Exception as exc:  # noqa: BLE001
        doc.notes.append(f"download failed: {exc}")
        return False
    if not data.startswith(b"%PDF"):
        doc.notes.append("download did not return a PDF")
        return False
    dest.write_bytes(data)
    doc.path = dest
    return True


def make_contents_page(docs: list[Doc], out: Path) -> Path:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table

    styles = getSampleStyleSheet()
    story = [
        Paragraph("Cambridge IGCSE Physics (0625)", styles["Title"]),
        Paragraph("October/November Question Papers &amp; Mark Schemes",
                  styles["Title"]),
        Paragraph("Components 41, 42 and 43", styles["Heading2"]),
        Spacer(1, 18),
    ]
    years = sorted({d.year for d in docs})
    story.append(Paragraph(
        f"Contents &mdash; {years[0]}&ndash;{years[-1]}. "
        "This page lists document metadata only; it contains no question or "
        "mark-scheme content.", styles["Normal"]))
    story.append(Spacer(1, 14))

    rows = [["Year", "Component", "Document", "Pages", "Source host"]]
    for d in docs:
        rows.append([str(d.year), d.comp, KIND_LABEL[d.kind],
                     str(d.pages if d.pages is not None else "-"),
                     d.host or "-"])
    story.append(Table(rows, colWidths=[50, 70, 110, 45, 205]))
    story.append(Spacer(1, 14))
    story.append(Paragraph(
        "Each document is reproduced exactly as published. "
        "Past papers remain the copyright of Cambridge University Press &amp; "
        "Assessment; this compilation is for personal or classroom use.",
        styles["Italic"]))
    SimpleDocTemplate(str(out), pagesize=A4,
                      title="Contents - 0625 Oct/Nov QP41-43 with MS").build(story)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--years", default="2021-2025",
                    help="e.g. 2021-2025 or 2023,2024,2025")
    ap.add_argument("--components", default="41,42,43")
    ap.add_argument("--from-dir", type=Path,
                    help="folder already containing the source PDFs")
    ap.add_argument("--download", action="store_true",
                    help="fetch PDFs from a mirror instead")
    ap.add_argument("--source", choices=sorted(MIRRORS), default="pastpapers")
    ap.add_argument("--url-template", default=None,
                    help="custom URL with {year} {yy} {comp} {kind} placeholders")
    ap.add_argument("--i-confirm-my-use-is-permitted", action="store_true",
                    help="required to download from a third-party mirror")
    ap.add_argument("--outdir", type=Path, default=Path("."))
    ap.add_argument("--raw-dir", type=Path, default=Path("papers"))
    ap.add_argument("--no-contents", action="store_true",
                    help="skip the generated contents page")
    ap.add_argument("--verify-only", action="store_true")
    ap.add_argument("--allow-partial", action="store_true",
                    help="build even if some documents are missing or failed")
    ap.add_argument("--delay", type=float, default=1.0,
                    help="seconds between mirror requests")
    args = ap.parse_args()

    if "-" in args.years:
        lo, hi = args.years.split("-")
        years = list(range(int(lo), int(hi) + 1))
    else:
        years = [int(y) for y in args.years.split(",")]
    global COMPONENTS
    COMPONENTS = [c.strip() for c in args.components.split(",")]

    if args.download and not args.i_confirm_my_use_is_permitted:
        sys.exit(
            "Refusing to download from a third-party mirror.\n"
            "Cambridge does not publish the Oct/Nov 0625 series openly; mirrors "
            "are unauthorised redistributions. Preferred route: download the "
            "official PDFs yourself (School Support Hub) into a folder and run\n"
            "    python3 assemble_0625_octnov.py --from-dir <folder>\n"
            "If you still want the mirror route and your use is permitted, add "
            "--i-confirm-my-use-is-permitted.")

    docs = build_plan(years)
    for d in docs:
        if args.from_dir:
            continue        # handled in the two-pass block below
        else:
            tmpl = args.url_template or MIRRORS[args.source]
            url = tmpl.format(year=d.year, yy=str(d.year)[2:],
                              comp=d.comp, kind=d.kind)
            d.url = url
            d.host = url.split("/")[2]
            if not download(d, url, args.raw_dir / f"{d.code}.pdf", args.delay):
                d.status = "missing"
                continue
            time.sleep(args.delay)

    # Two-pass lookup for a local folder: match by filename first, then fall
    # back to reading each PDF's own header so oddly-named downloads still work.
    if args.from_dir:
        if not args.from_dir.is_dir():
            sys.exit(f"Not a directory: {args.from_dir}")
        for d in docs:
            locate_by_name(d, args.from_dir)
        if any(d.path is None for d in docs):
            print("Some files were not named as expected. Scanning the headers "
                  "of every PDF in the folder to identify them...")
            index = build_index(args.from_dir)
            for d in docs:
                if d.path is None:
                    locate_by_header(d, index)
        for d in docs:
            if d.path is None:
                d.status = "missing"
                d.notes.append(f"no file matching {d.code}.pdf")

    # Verify every located PDF against its own printed header.
    for d in docs:
        if d.path is None:
            continue
        try:
            text = first_pages_text(d.path)
            verify(d, text, len(PdfReader(str(d.path)).pages))
        except ValueError as exc:
            d.status = "FAILED"
            d.notes.append(str(exc))

    good = [d for d in docs if d.status == "verified"]
    bad = [d for d in docs if d.status == "FAILED"]
    missing = [d for d in docs if d.path is None]

    print(f"\nVerified {len(good)}/{len(docs)}   "
          f"failed {len(bad)}   missing {len(missing)}")
    for d in bad + missing:
        print(f"  ! {d.code}: {d.status} - {'; '.join(d.notes)}")

    if args.verify_only:
        return 0 if not (bad or missing) else 1
    if not good:
        print("\nNothing to assemble.")
        return 1
    if (bad or missing) and not args.allow_partial:
        print("\nRefusing to build an incomplete compilation. "
              "Fix the items above, or pass --allow-partial to override.")
        return 1
    if bad or missing:
        print("\n--allow-partial given: building with the verified subset only.")

    # ---- merge -----------------------------------------------------------
    args.outdir.mkdir(parents=True, exist_ok=True)
    final = (args.outdir /
             f"0625_{SUBJECT}_OctNov_{years[0]}-{years[-1]}_QP41-43_with_MS.pdf")
    writer = PdfWriter()
    page_no = 0
    if not args.no_contents:
        tmp = args.outdir / "_contents.pdf"
        make_contents_page(good, tmp)
        contents_reader = PdfReader(str(tmp))
        for page in contents_reader.pages:
            writer.add_page(page)
        writer.add_outline_item("Contents", 0)
        page_no = len(contents_reader.pages)   # may be >1 for long listings
        tmp.unlink()

    for d in good:
        start = page_no
        reader = PdfReader(str(d.path))
        for page in reader.pages:
            writer.add_page(page)
        page_no += len(reader.pages)
        writer.add_outline_item(f"{d.year} - {KIND_LABEL[d.kind]} {d.comp}", start)

    writer.add_metadata({
        "/Title": (f"{SUBJECT} {SYLLABUS} {SESSION} "
                   f"{years[0]}-{years[-1]} QP 41-43 with MS"),
        "/Author": "Cambridge University Press & Assessment (source documents)",
        "/Subject": f"IGCSE {SUBJECT} {SYLLABUS} past papers",
        "/Creator": "assemble_0625_octnov.py",
    })
    with final.open("wb") as fh:
        writer.write(fh)

    # ---- manifests -------------------------------------------------------
    csv_path = args.outdir / "SOURCE_MANIFEST.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["year", "syllabus", "component", "type", "file",
                    "pages", "source_host", "url", "status", "notes"])
        for d in docs:
            w.writerow([d.year, SYLLABUS, d.comp, KIND_LABEL[d.kind],
                        d.path.name if d.path else "",
                        d.pages if d.pages is not None else "",
                        d.host, d.url, d.status, "; ".join(d.notes)])
    json_path = args.outdir / "SOURCE_MANIFEST.json"
    json_path.write_text(json.dumps(
        [{"year": d.year, "syllabus": SYLLABUS, "component": d.comp,
          "type": KIND_LABEL[d.kind], "file": d.path.name if d.path else None,
          "pages": d.pages, "source_host": d.host, "url": d.url,
          "status": d.status, "notes": d.notes} for d in docs],
        indent=2), encoding="utf-8")

    print(f"\nWrote {final}  ({page_no} pages)")
    print(f"Wrote {csv_path}\nWrote {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
