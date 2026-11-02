# Completion report — 0625 Physics, Oct/Nov QP 41–43 with mark schemes

**Date of work:** 2 November 2026
**Branch:** `arena/1c0ba012-lm-arena-projects-general`

---

## 1. Feasibility answer: **NO** (with a usable partial delivery)

The combined PDF **cannot be produced in this environment**. Two independent
blockers, either one of which is fatal on its own:

**Blocker A — the source is not lawfully reachable here.**
Cambridge's own public past-paper page for 0625
(<https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-physics-0625/past-papers/>)
publishes **only a June-2024 selection** (papers 11, 21, 31, 41, 51, 61) plus
specimen papers. It carries the notice *"This is only a selection of our papers"*
and points everything else at the **School Support Hub, which is login-restricted
to registered Cambridge schools**. There is therefore **no open official
Cambridge URL** for any October/November 0625 component 41/42/43 document.
Circumventing that login is out of scope, and the brief forbids it.

The only openly readable copies sit on third-party mirrors — pastpapers.co,
PapaCambridge, dynamicpapers.com, gamatrain.com, papersdaddy.com,
educateachange.com, shefosquad.com. Cambridge states that teachers may download
and print past papers for classroom use but that the materials **"cannot be used
for publication or re-sale without our prior approval"**
[1](https://help.cambridgeinternational.org/hc/en-gb/articles/115004333125-Can-I-reproduce-Cambridge-past-examination-papers-for-use-in-the-classroom-with-my-students).
Those mirrors are not shown to hold any such approval, so they are unauthorised
redistributions — exactly the category the brief says not to use, and which I am
not going to pass off as official Cambridge downloads.

**Blocker B — this sandbox cannot fetch binary files at all.**
Outbound network access is restricted to `github.com`, `registry.npmjs.org`,
`pypi.org` and `files.pythonhosted.org`. Verified directly:

| Host | Result |
|---|---|
| `cambridgeinternational.org` | `SSL_ERROR_SYSCALL` — blocked |
| `papacambridge.com`, `pastpapers.co` | `SSL_ERROR_SYSCALL` — blocked |
| `pypi.org` | `200` |

My only open-web tools (`web_search`, `fetch_page`) return **parsed text**, never
file bytes. So even with perfect permissions I could not obtain a single PDF.
Rebuilding the papers from parsed text was explicitly ruled out by the brief
("no retyping or recreating") and would in any case yield a lossy, altered
document with the diagrams destroyed. I did not do it.

---

## 2. Year range selected

**2021, 2022, 2023, 2024, 2025** — the five most recent October/November series
that have been released. Rationale:

- Today is 2 November 2026. The **Oct/Nov 2026** series has not been sat or
  marked yet, so no papers or mark schemes exist for it.
- **Oct/Nov 2025** is released: pastpapers.co lists 40 files for that session
  (18 question papers, 18 mark schemes, 1 grade threshold), including all three
  Paper 4 variants.
- Going back five sessions gives 2021–2025. No session was substituted, and no
  May/June or March document was used anywhere.

---

## 3. Were all 30 documents included? **No — zero were included.**

| Item | Result |
|---|---|
| Documents required | 30 (5 years × 3 components × QP + MS) |
| Documents located and URL-confirmed | **30 / 30** |
| Documents downloaded | **0** |
| Documents included in the combined PDF | **0** |
| `0625_Physics_OctNov_2021-2025_QP41-43_with_MS.pdf` | **NOT PRODUCED** |

Every one of the 30 exists on the mirror and is individually identified in
`SOURCE_MANIFEST.md` / `SOURCE_MANIFEST.csv`. Confirmation was done by reading
the mirror's own session index pages for `0625 → {year} → October-November`, not
by guessing at filenames:

| Year | QP 41/42/43 | MS 41/42/43 | Where confirmed |
|---|---|---|---|
| 2021 | ✅ all three | ✅ all three | pastpapers.co 2021 Oct/Nov index |
| 2022 | ✅ all three | ✅ all three | pastpapers.co 2022 Oct/Nov index |
| 2023 | ✅ all three | ✅ all three | pastpapers.co 2023 Oct/Nov index |
| 2024 | ✅ all three | ✅ all three | pastpapers.co 2024 Oct/Nov index |
| 2025 | ✅ all three | ✅ all three | pastpapers.co index (QP) + PapaCambridge & educateachange (MS) |

**Nothing missing, nothing guessed.** The gap is between "located" and
"downloaded", not between "wanted" and "found".

---

## 4. Limitations and caveats

1. **No file was opened.** Syllabus, session and component are confirmed from
   index listings and Cambridge's standard filename convention
   (`0625_w<yy>_qp|ms_<component>`). The documents' *contents* — page count,
   legibility, page order, whether the "PUBLISHED" mark scheme is the final
   version — are **unverified**.
2. **No official source exists for this set.** Any file fetched from the URLs in
   the manifest is a third-party copy. Do not describe it as an official
   Cambridge download.
3. **2025 files look anomalous.** On pastpapers.co the 2025 Oct/Nov question
   papers are listed at 121–144 KB, against ~870 KB–1.2 MB for the equivalent
   2021–2023 files. That is a red flag for truncated or placeholder uploads.
   Verify before relying on them.
4. **Page counts are absent** from the manifest for the reason given in
   Blocker B. `assemble_0625_octnov.py` fills the column in automatically when
   it runs on an unfiltered connection.
5. **Copyright.** Compiling these for personal or classroom revision sits within
   Cambridge's stated classroom-use permission; publishing or selling the result
   does not. Keep the compilation private to the school.
6. **Screenshots were not used.** The brief permits full-page screenshots only
   where the source's terms allow it and only where they are not a workaround
   for a download restriction. Here they would have been a workaround for both
   the copyright position and the network block, so no capture was attempted.

---

## 5. What was delivered instead

| File | What it is |
|---|---|
| `COMPLETION_REPORT.md` | This report |
| `SOURCE_MANIFEST.md` | Human-readable manifest — all 30 documents, host, URL, size, verification status |
| `SOURCE_MANIFEST.csv` | Same data, machine-readable |
| `assemble_0625_octnov.py` | Download/verify/merge tool that produces the exact PDF you asked for |
| `selftest.py` | Self-test proving the verifier and merge logic work |

### The script does the whole job, in one command

```bash
pip install pypdf reportlab

# 1. Download the 30 official PDFs from the Cambridge School Support Hub
#    (login required, authorised for classroom use) into ./papers
# 2. Build the combined PDF:
python3 assemble_0625_octnov.py --from-dir ./papers
```

It writes `0625_Physics_OctNov_2021-2025_QP41-43_with_MS.pdf`, arranged
chronologically and within each year as QP41 → MS41 → QP42 → MS42 → QP43 → MS43,
with a metadata-only contents page and PDF bookmarks.

**It refuses to guess.** Every PDF is checked against its own printed header
before it is merged:

- syllabus code `0625` present
- subject "Physics" present
- component token `0625/41`, `0625/42` or `0625/43` present
- the string `October/November <year>` present and matching the expected year
- **hard rejection** if the text contains `May/June`, `February/March` or
  `February/April` — so the wrong series cannot slip in
- a mark scheme must say "MARK SCHEME"; a question paper must not
- "Paper 4" must appear (41/42/43 are all Paper 4)
- Confidential Instructions are rejected as a question paper

If any document fails or is missing, the build aborts rather than emitting a
silently incomplete file (`--allow-partial` overrides).

`selftest.py` exercises all of this with synthetic, header-only PDFs and passes:
30/30 verified and merged to the exact expected page count; an injected
May/June paper rejected; a missing and a corrupt file both caught; and the
mirror-download path correctly gated behind an explicit opt-in.

---

## 6. Recommended next step

The single thing that unblocks this is **the 30 PDFs themselves**. If you can
drop them into a folder — ideally downloaded from the Cambridge School Support
Hub, which is the authorised source — I will run the assembler over them
immediately and hand you the verified combined PDF with a complete manifest
including page counts. If you would rather I pull from the mirror instead, say
so explicitly and I will do it, while labelling the output as third-party-sourced.
