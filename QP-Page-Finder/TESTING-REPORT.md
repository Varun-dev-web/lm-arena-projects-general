# QP Page Finder v3 — testing report & limitations

**Date:** 2026-11-03 · **Packaged for:** Windows (macOS/Linux launchers included)

This report states what was *actually* run and checked. Nothing here is claimed on
the basis of inspection alone. All tests used **synthetic PDFs with invented
text**; no Cambridge question paper or mark scheme was downloaded, opened,
copied, bundled, summarised or screenshotted during this work. The direct paper
links in `../QUESTION-PAPER-LINKS*.md` were verified only as **live landing-page
labels and hrefs** — no PDF bytes or HTTP response headers were fetched.

## 1. Test environment

* Sandbox: Linux, Python 3.11.2, Node 22.22.3.
* Headless Chromium (via `playwright-core` + a self-contained Chromium binary)
  drove the app as a real browser. Those are **development-only** tools; they are
  **not** bundled in the app and are **not** needed to run it.
* Test PDFs are **synthetic files written for testing** (`tests/make_fixtures.py`),
  containing invented sentences. v3 adds three synthetic MS fixtures
  (`0625_w25_ms_41.pdf`, `0625_w24_ms_42.pdf`, `0625_w21_ms_43.pdf`) — the last
  one deliberately has no matching QP. Fixtures are generated into a temporary
  folder and are **not** shipped in the ZIP.
* The session's live preview uses `--host 0.0.0.0` (required by the preview proxy)
  and a persisted folder of synthetic fixtures. The shipped launchers default to
  `--host 127.0.0.1`, i.e. **localhost only**.

## 2. What was tested and the exact results

| Test | Command / setup | Result |
| --- | --- | --- |
| JS / Python syntax | `node --check web/app.js`, `node --check web/analyze.js`, `node --check tests/test_analyze.js`, `node --check tests/test_e2e.js`, `python3 -m py_compile server.py` | Pass |
| Analysis engine (40 assertion groups: v2 classification/term families, positional footer printed pages, crop hints, **plus v3 MS filename parsing, year/session/component matching, MS row-marker detection, exact MS page index, centred-number guard**) | `node tests/test_analyze.js` | **40/40 passed** |
| Both servers (Python + Node): every endpoint, CSP/privacy headers, path traversal, bundled asset delivery (pdf.js, OCR WASM/data, **jsPDF + licence**), **synthetic MS fixtures in the scan**, **dual folder bars / dual approve buttons / v3 engine served**, read-only guarantee | `python3 tests/test_server.py /home/user/qp-preview-pdfs` | **52 checks passed** (1 static + 25 Python + 25 Node + 1 shared hash) |
| Real-browser E2E, **Python server, from source**, port 8777 | `LD_LIBRARY_PATH=… NODE_PATH=… QP_BASE_URL=http://127.0.0.1:8777 node tests/test_e2e.js` | **83/83 passed**, 0 external requests, 0 uncaught errors |
| Real-browser E2E, **Node.js server, from source**, port 8898 | `QP_BASE_URL=http://127.0.0.1:8898 node tests/test_e2e.js` | **83/83 passed**, 0 external requests, 0 uncaught errors |
| **The packaged ZIP itself**: extracted `qp-page-finder-windows.zip` into a temp folder, placed the 8 synthetic PDFs beside it (exactly as a user would), started `server.py` with **no `--folder` argument** on port 8897, then re-ran the browser test from the extracted `tests/` folder | `QP_BASE_URL=http://127.0.0.1:8897 node tests/test_e2e.js` | health `{"ok": true, ...}`, default folder auto-detected (**8 PDFs**), **83/83 passed**, 0 external requests |
| ZIP integrity | `zipfile.testzip()` | `None`; **49 entries** (~7.06 MB) |
| Downloaded PDF byte checks | parsed **both** approved downloads in the E2E test | each starts `%PDF-`, `/MediaBox [0 0 595.28 841.89]` (A4), ≥1 `/Type /Page`; the two byte buffers are **not equal** |

### What the end-to-end browser test actually exercised

**v3 (new):**

* Two independent folder bars are both auto-populated; the QP bar does **not**
  pre-select MS PDFs and the MS bar **does** pre-select them (and vice versa).
* The MS bar decodes a PapaCambridge-style name into year / session / component.
* Changing **only** the MS folder path leaves the QP listing untouched, and the MS
  bar can be restored independently.
* The scan reports the number of indexed MS PDFs.
* Results have both **QP PDF page(s)** and **MS PDF page(s)** columns. On the
  synthetic `0625_w25_qp_41.pdf`, **Q2 → MS page 1** and **Q5 → MS page 2**
  (two different physical MS pages); on the second paper, **Q3 → MS page 2**.
* A QP with no matching MS reports `—` rather than inventing a page.
* Confirming a question opens the **QP** alignment editor (`QP` badge). After
  saving, the **same editor** opens for the MS (`MS` badge, MS filename in title),
  renders the exact matched MS page, and supports the identical numeric manual
  adjustment; saving it closes both editors.
* The row shows `✓ QP 2/2 captured` and `✓ MS 1/1 captured`.
* The compile panel reports `QP sheets + MS sheets` separately and requires
  **both** captures before **Build A4 PDFs (preview)** is enabled.
* The preview dropdown switches between the QP A4 PDF and the MS A4 PDF, each
  rendering a portrait A4-shaped sheet.
* **Print / open for printing** opens the current PDF as a `blob:` URL in a new
  tab, with **zero downloads**.
* **No download occurs before approval.** Two separate approvals produce two
  separate downloads: `QP-Magnetism-A4.pdf` and `MS-Magnetism-A4.pdf`. Both are
  real A4 PDFs and are byte-different, i.e. **not one combined PDF**.

**v1 / v2 regressions (all still present):**

* Auto-scanned folder; real pdf.js text extraction on multi-page PDFs.
* The **image-only PDF** was rasterised and read by the **bundled offline
  Tesseract WASM engine** with bundled `eng.traineddata.gz`; the OCR engine
  reported "ready (offline)" and the result was flagged uncertain.
* Filename, component (`0625/41`, `0625/42`), question number, exact physical QP
  page and a **page range** for a cross-page question (`2-3`).
* Position-verified printed page numbers; a plain question number is never reused
  as a printed page.
* Only keyword labels are shown — the test asserts question text is absent.
* Motor / transformer / induction-only questions excluded by default, available
  via the transparency toggle.
* Password-protected synthetic PDF **skipped**, never bypassed.
* In-app viewer opens at the exact page and renders real canvas content; the
  `#page=N` fallback opens the original PDF; an **Open MS at page** link is present.
* Review marks persist in local storage.
* Auto-capture, auto-select question region, numeric percentage alignment,
  dragging the crop box, and full-page saving.
* **Zero external requests** and **zero uncaught browser errors** throughout.

## 3. What was NOT tested / known limitations

* **No real Cambridge QP or MS PDF was used.** Everything above is synthetic
  fixtures and a local headless browser. Real mark schemes are typeset as tables;
  the MS question-page index uses left-margin row markers (`2 (a) …`,
  `Question 5`, bare margin numbers) with a footer/centred-number guard. If a
  question number cannot be detected, the app says `page ? (align)` and asks you
  to align that MS page manually rather than guessing.
* **Matching is filename-based.** It requires `0625_<m|s|w><yy>_ms_<cc>.pdf` and
  `0625_<m|s|w><yy>_qp_<cc>.pdf` with identical syllabus, series code and
  component. Renamed files, combined files or a different component numbering
  will report "no matching MS". A duplicate filename in two folders is still an
  edge case.
* **Heuristic topic matching** (keyword families) can miss or over-match. Uncertain
  rows are flagged; the app never decides relevance for you.
* OCR is imperfect; OCR-derived rows are always flagged uncertain. Encrypted,
  corrupt or password-protected PDFs are skipped.
* The `Print` button opens the A4 PDF in a new browser tab for the browser's own
  print dialog. Whether that dialog appears depends on the browser's PDF viewer;
  the test only asserts a `blob:` tab was opened with no download.
* `#page=N` in an external PDF viewer is browser-dependent.
* Captures are memory-only in the tab; reloading requires re-scanning/re-saving.
* Printed-page detection requires a bottom-centred footer number; otherwise `—`.
* **Third-party links** in `../QUESTION-PAPER-LINKS.md` and
  `../QUESTION-PAPER-LINKS-ALL-SERIES.md` are PapaCambridge landing-page labels
  and hrefs, not official Cambridge URLs. No PDF was downloaded, opened or
  byte-verified; links may change. For 0625 the March series publishes only
  variant 42 for Paper 4, so March 41/43 are reported **MISSING**, not invented.
  Oct/Nov 2026 is prediction-only and excluded.
* No access control was bypassed, and no PDF text or mark-scheme content is
  reproduced anywhere in this repository.

## 4. Privacy assertions checked by the tests

* CSP `connect-src 'self'` and `default-src 'self'`; no external script source.
* `Cache-Control: no-store`; PDFs served `inline` (read-only, no attachment).
* Path traversal (`../../README.md`) blocked; missing PDF → 404; bad folder →
  JSON error.
* All synthetic fixture **sha256 hashes unchanged** after every server request.
* The browser test records every request and asserts **0 external requests**.
* Downloads occur **only** after the user clicks an approve button.
