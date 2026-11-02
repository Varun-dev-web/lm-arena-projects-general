# 0625 Physics — Oct/Nov 2021–2025, QP 41–43 with mark schemes

Tooling and research for assembling Cambridge IGCSE Physics (0625)
October/November question papers and mark schemes for components **41, 42 and
43** (Paper 4, Extended Theory) into a single PDF.

> **The combined PDF is not in this folder and was not produced.**
> Read [`COMPLETION_REPORT.md`](COMPLETION_REPORT.md) for why: Cambridge does
> not publish the Oct/Nov 0625 series openly (it is behind the School Support
> Hub login), and the sandbox this was built in cannot fetch binary files from
> any non-allowlisted host.

## Contents

| File | Purpose |
|---|---|
| `COMPLETION_REPORT.md` | Feasibility verdict, year range, limitations |
| `SOURCE_MANIFEST.md` | All 30 documents: year, component, type, host, URL, verification status |
| `SOURCE_MANIFEST.csv` | Same data, machine-readable |
| `assemble_0625_octnov.py` | Downloads/verifies/merges the papers into the combined PDF |
| `selftest.py` | Proves the verifier and merge logic work (synthetic PDFs only) |
| `requirements.txt` | `pypdf`, `reportlab` |

## Quick start

```bash
pip install -r requirements.txt

# Put the 30 source PDFs in ./papers, named with the standard Cambridge
# convention: 0625_w21_qp_41.pdf, 0625_w21_ms_41.pdf, ...
#   (2021-2025 x components 41/42/43 x qp/ms = 30 files)
# Official, authorised source: the Cambridge School Support Hub.

python3 assemble_0625_octnov.py --from-dir ./papers
```

Output: `0625_Physics_OctNov_2021-2025_QP41-43_with_MS.pdf`, ordered by year and
within each year QP41 → MS41 → QP42 → MS42 → QP43 → MS43, with a metadata-only
contents page and PDF bookmarks. A refreshed `SOURCE_MANIFEST.csv` with real
page counts is written alongside it.

## Verification built into the script

Each PDF is checked against its own printed header before merging — syllabus
code, subject, component token (`0625/41` etc.), the exact
`October/November <year>` session string, and document type (QP vs MS). It
**hard-rejects** `May/June`, `February/March` and `February/April` papers, so
the wrong series cannot be included by mistake. Missing or corrupt files abort
the build unless `--allow-partial` is given.

## Self-test

```bash
python3 selftest.py
```

Uses synthetic, header-only PDFs (no real exam content) to confirm: 30/30
verified and merged to the exact page count; an injected May/June paper
rejected; a missing and a corrupt file caught; mirror downloads gated.

## Copyright

Past papers remain the copyright of Cambridge University Press & Assessment.
Cambridge permits teachers at registered Cambridge schools to download and print
them for use with their students, but not to publish or re-sell them
([source](https://help.cambridgeinternational.org/hc/en-gb/articles/115004333125-Can-I-reproduce-Cambridge-past-examination-papers-for-use-in-the-classroom-with-my-students)).
Keep any compilation within that scope. Files obtained from pastpapers.co or
similar mirrors are third-party copies and must not be described as official
Cambridge downloads.
