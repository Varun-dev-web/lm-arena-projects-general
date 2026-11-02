#!/usr/bin/env python3
"""
Self-test for assemble_0625_octnov.py.

Builds SYNTHETIC PDFs that carry only a Cambridge-style document header
(syllabus code, subject, component, session, document type) plus filler body
text. It contains NO real exam content -- it exists purely to prove that the
verifier and the merge/bookmark/contents-page logic work.

Run:  python3 selftest.py
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "assemble_0625_octnov.py"

YEARS = [2021, 2022, 2023, 2024, 2025]
COMPS = ["41", "42", "43"]


def make_synthetic(out_dir: Path, year: int, comp: str, kind: str,
                   pages: int = 3, corrupt: bool = False) -> Path:
    """Header-only stand-in for a real Cambridge document."""
    styles = getSampleStyleSheet()
    ctr = ParagraphStyle("ctr", parent=styles["Normal"], alignment=TA_CENTER)
    path = out_dir / f"0625_w{str(year)[2:]}_{kind}_{comp}.pdf"

    if corrupt:
        path.write_bytes(b"this is not a pdf at all")
        return path

    story = [
        Paragraph("Cambridge IGCSE&trade;", ctr),
        Paragraph(f"PHYSICS&nbsp;&nbsp;&nbsp;0625/{comp}", ctr),
        Paragraph("Paper 4 Extended Theory", ctr),
        Paragraph(f"October/November {year}", ctr),
        Paragraph("1 hour 15 minutes", ctr),
    ]
    if kind == "ms":
        story.append(Paragraph("MARK SCHEME", ctr))
        story.append(Paragraph("Maximum Mark: 80", ctr))
        story.append(Paragraph("PUBLISHED", ctr))
    story.append(Paragraph(
        "&copy; Cambridge University Press &amp; Assessment "
        f"{year}&nbsp;&nbsp;&nbsp;0625/{comp}/{kind.upper()}/O/N/{str(year)[2:]}",
        styles["Normal"]))
    story.append(PageBreak())
    for p in range(1, pages):
        story.append(Paragraph(
            f"[synthetic filler page {p} &mdash; self-test only, "
            "not real examination content]", styles["Normal"]))
        if p < pages - 1:
            story.append(PageBreak())

    SimpleDocTemplate(str(path), pagesize=A4,
                      title=f"0625/{comp} {kind.upper()} {year}").build(story)
    return path


def run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), *args],
                          capture_output=True, text=True)


def main() -> int:
    ok = True
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        src = tmp / "papers"
        src.mkdir()

        # --- case 1: all 30 present and correct --------------------------
        for y in YEARS:
            for c in COMPS:
                for k in ("qp", "ms"):
                    make_synthetic(src, y, c, k, pages=3)
        from pypdf import PdfReader

        # 1a: without a contents page the merge must be exactly 30 x 3 = 90.
        r = run(["--from-dir", str(src), "--outdir", str(tmp / "out_nc"),
                 "--no-contents"])
        print("== case 1a: complete set, no contents page ==")
        print(r.stdout.strip() or r.stderr.strip())
        if r.returncode != 0:
            ok = False
            print("!! case 1a FAILED")
        nc = (tmp / "out_nc" /
              "0625_Physics_OctNov_2021-2025_QP41-43_with_MS.pdf")
        if nc.is_file():
            got = len(PdfReader(str(nc)).pages)
            print(f"   pages={got} expected=90")
            if got != 90:
                ok = False
                print("!! case 1a page count mismatch")

        # 1b: with a contents page, page count must be 90 + (contents pages).
        r = run(["--from-dir", str(src), "--outdir", str(tmp / "out")])
        print("\n== case 1b: complete set, with contents page ==")
        print(r.stdout.strip() or r.stderr.strip())
        if r.returncode != 0:
            ok = False
            print("!! case 1b FAILED")
        final = (tmp / "out" /
                 "0625_Physics_OctNov_2021-2025_QP41-43_with_MS.pdf")
        if not final.is_file():
            ok = False
            print("!! output PDF not created")
        else:
            rd = PdfReader(str(final))
            got = len(rd.pages)
            contents_pages = got - 90
            print(f"   pages={got} (90 source + {contents_pages} contents)")
            if contents_pages < 1:
                ok = False
                print("!! contents page missing")
            # the script's own counter must agree with the real page count
            if f"({got} pages)" not in r.stdout:
                ok = False
                print("!! script page counter disagrees with actual page count")
            outlines = rd.outline
            print(f"   bookmarks={len(outlines)} expected=31")
            if len(outlines) != 31:
                ok = False
                print("!! bookmark count mismatch")

        # --- case 2: a May/June paper must be rejected --------------------
        src2 = tmp / "papers2"
        shutil.copytree(src, src2)
        bad = src2 / "0625_w23_qp_42.pdf"
        make_synthetic(src2, 2023, "42", "qp", pages=3)
        # overwrite header with the wrong series
        from pypdf import PdfWriter
        w = PdfWriter()
        w.append(str(bad))
        (src2 / "_tmp.pdf").unlink(missing_ok=True)
        # simplest: rebuild it as a May/June file under the same name
        from reportlab.lib.pagesizes import A4 as _A4
        from reportlab.lib.styles import getSampleStyleSheet as _ss
        from reportlab.platypus import SimpleDocTemplate as _SD, Paragraph as _P
        st = _ss()
        _SD(str(bad), pagesize=_A4).build([_P("PHYSICS 0625/42", st["Normal"]),
                                           _P("Paper 4 Extended Theory",
                                              st["Normal"]),
                                           _P("May/June 2023", st["Normal"])])
        r2 = run(["--from-dir", str(src2), "--outdir", str(tmp / "out2")])
        print("\n== case 2: May/June paper injected as w23 QP 42 ==")
        print(r2.stdout.strip() or r2.stderr.strip())
        if r2.returncode == 0:
            ok = False
            print("!! case 2 FAILED: wrong-series paper was accepted")
        if "FAILED" not in (r2.stdout + r2.stderr):
            ok = False
            print("!! case 2 FAILED: no failure reported")

        # --- case 3: missing document + corrupt file ----------------------
        src3 = tmp / "papers3"
        shutil.copytree(src, src3)
        (src3 / "0625_w25_ms_43.pdf").unlink()
        make_synthetic(src3, 2024, "41", "qp", pages=2, corrupt=True)
        r3 = run(["--from-dir", str(src3), "--outdir", str(tmp / "out3")])
        print("\n== case 3: one missing + one corrupt ==")
        print(r3.stdout.strip() or r3.stderr.strip())
        if r3.returncode == 0:
            ok = False
            print("!! case 3 FAILED: incomplete set was assembled")

        # --- case 4: mirror download is gated -----------------------------
        r4 = run(["--download"])
        print("\n== case 4: mirror download without opt-in ==")
        print((r4.stderr.strip() or r4.stdout.strip())[:200])
        if r4.returncode == 0:
            ok = False
            print("!! case 4 FAILED: mirror download was not gated")

        # --- case 5: oddly-named files must still be matched by header ----
        src5 = tmp / "papers5"
        src5.mkdir()
        for y in YEARS:
            for c in COMPS:
                for k in ("qp", "ms"):
                    p = make_synthetic(src5, y, c, k, pages=3)
                    p.rename(src5 / f"physics {y} paper {c} {k} download.pdf")
        r5 = run(["--from-dir", str(src5), "--outdir", str(tmp / "out5"),
                  "--no-contents"])
        print("\n== case 5: every file renamed to an arbitrary name ==")
        print(r5.stdout.strip() or r5.stderr.strip())
        if r5.returncode != 0 or "Verified 30/30" not in r5.stdout:
            ok = False
            print("!! case 5 FAILED: header-based matching did not work")
        got5 = len(PdfReader(str(tmp / "out5" /
                 "0625_Physics_OctNov_2021-2025_QP41-43_with_MS.pdf")).pages)
        print(f"   pages={got5} expected=90")
        if got5 != 90:
            ok = False
            print("!! case 5 page count mismatch")

    print("\n" + ("SELF-TEST PASSED" if ok else "SELF-TEST FAILED"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
