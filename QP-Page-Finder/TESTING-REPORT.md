# QP Page Finder v2 — testing report & limitations

**Date:** 2026-11-03 · **Packaged for:** Windows (macOS/Linux launchers included)

This report states what was *actually* run and checked. Nothing here is claimed on
the basis of inspection alone. All tests used **synthetic PDFs with invented
text**; no Cambridge question paper was downloaded, opened, copied, bundled,
summarised or screenshotted during this work.

## 1. Test environment

* Sandbox: Linux, Python 3.11.2, Node 22.22.3.
* Headless Chromium (via `playwright-core` + a self-contained Chromium binary) was
  used to drive the app as a real browser. Those are **development-only** tools;
  they are **not** bundled in the app and are **not** needed to run it.
* Test PDFs were **synthetic files written for testing** (`tests/make_fixtures.py`),
  containing invented sentences. Fixtures are generated into a temporary folder
  and are deliberately **not** shipped in the ZIP.
* The live preview of the app in this session uses `--host 0.0.0.0` (required by
  the preview proxy) and a persisted folder of synthetic fixtures. The shipped
  launchers use the default `--host 127.0.0.1`, i.e. **localhost only**.

## 2. What was tested and the exact results

| Test | Command / setup | Result |
| --- | --- | --- |
| JS / Python syntax | `node --check web/app.js`, `node --check web/analyze.js`, `python3 -m py_compile server.py` | Pass |
| Analysis engine (35 assertion groups: classification incl. multi-line phrases and term families, filename/component parsing, question-number detection with positional left-margin guard, positional footer printed-page detection, printed-page sequence, question-number-reuse regression, cross-page ranges, OCR flagging, crop hints) | `node tests/test_analyze.js` | **35/35 passed** |
| Both servers (Python + Node): every endpoint, CSP/privacy headers, path-traversal blocking, bundled asset delivery **including jsPDF and its licence**, read-only guarantee | `python3 tests/test_server.py /home/user/qp-preview-pdfs` | **41 checks passed** (20 Python + 20 Node + 1 shared hash check) |
| Real-browser end-to-end, Python server, from source on port 8777 | `LD_LIBRARY_PATH=… NODE_PATH=… QP_BASE_URL=http://127.0.0.1:8777 node tests/test_e2e.js` | **51/51 passed**, 0 external requests, 0 uncaught errors |
| Real-browser end-to-end, **Node.js server**, from source on port 8898 | `QP_BASE_URL=http://127.0.0.1:8898 node tests/test_e2e.js` | **51/51 passed**, 0 external requests, 0 uncaught errors |
| **The packaged ZIP itself**: extracted `qp-page-finder-windows.zip` into a temp folder, placed synthetic PDFs beside it (exactly as a user would), started `server.py` with **no `--folder` argument** on port 8899, then re-ran the browser test from the extracted `tests/` folder | `QP_BASE_URL=http://127.0.0.1:8899 node tests/test_e2e.js` | default folder auto-detected (**5 PDFs**), **51/51 passed**, 0 external requests |
| ZIP integrity | `zipfile.testzip()` | `None`; **48 entries** (~7.1 MB) |
| Downloaded A4 PDF byte check | parsed the approved download in the E2E test | starts `%PDF-`; `/MediaBox [0 0 595.28 841.89]` (A4); at least 1 `/Type /Page` |

### What the end-to-end browser test actually exercised

Original v1 behaviours (all still present):

* The folder is auto-scanned on page load and all synthetic PDFs are listed.
* Clicking **Scan** runs **real pdf.js text extraction** on multi-page PDFs.
* The **image-only PDF** was rasterised and read by the **bundled offline
  Tesseract WebAssembly engine** with the bundled `eng.traineddata.gz`; the OCR
  engine reported "ready (offline)" and the result was flagged uncertain.
* Results show filename, component (`0625/41`, `0625/42`), question number,
  exact physical PDF page, page **range** for a question continuing across pages
  (`2-3`), and the **printed page number** when a consistent sequence was found.
* Only keyword labels are displayed — the test asserts that question text is not
  shown.
* Motor / transformer / induction-only questions were **excluded** by default and
  could be revealed with the transparency toggle.
* A **password-protected PDF was skipped** with an explicit warning; no bypass was
  attempted.
* **Open at page** opened the built-in viewer at the exact page; the test verified
  that the canvas actually rendered non-blank page content, and that page
  navigation works.
* **Open PDF at page** produced a URL with `#page=N`.
* Review marking persisted in `localStorage` and the filter worked.
* **Zero requests left the local machine** (every request was checked); zero
  uncaught browser errors.

New v2 behaviours:

* `window.jspdf.jsPDF` is present from the **bundled** UMD file (no CDN).
* **Printed-page regression:** for every result row where the printed number
  equals the question number, the cell's tooltip must say *position verified*.
  Asserted across all rows.
* Marking a question **✓ Relevant** automatically opened the capture editor and
  rendered a non-blank canvas of the real PDF page.
* The **auto-selected crop** was a partial region (not the whole page) derived
  from pdf.js line positions; **Auto-select question region** re-applied it.
* **Manual alignment** worked both by typing a percentage and by dragging the
  crop rectangle; the computed `style.left` changed in both cases.
* Saving captures closed the editor, showed a capture badge on the row, and
  updated the compile counters.
* The **build button was disabled** until every uncertain question was checked
  and every confirmed question had a capture; **Mark remaining unchecked as not
  relevant** cleared the pending count.
* Building opened an **A4 preview** with a visible approval bar, labelled *not
  downloaded yet*; the rendered canvas had a portrait A4 aspect ratio.
* **No download event occurred before approval** (asserted explicitly).
* Clicking **Approve & download** produced exactly one download named
  `QP-Magnetism-A4.pdf`, whose bytes were a real PDF with A4 MediaBox and at
  least one page. The re-download button appeared only afterwards.
* **Zero requests left the local machine** during the whole workflow including
  PDF generation; zero uncaught browser errors.

### Read-only guarantee (tested)

`test_server.py` hashes every fixture PDF before and after all requests and asserts
the hashes are identical. The server opens PDFs with `open(..., "rb")` /
`fs.readFileSync` only; there is no write path anywhere in the app. The A4 PDF is
created **in browser memory** and offered as a Blob download; it never writes to
the PDF folder and never modifies an original.

### Offline guarantee (tested)

* All runtime assets resolve to the localhost server: `pdf.min.js`,
  `pdf.worker.min.js`, `tesseract.min.js`, `worker.min.js`, the WASM cores,
  `eng.traineddata.gz`, `jspdf.umd.min.js`, its licence and the standard fonts
  are bundled in `web/vendor/`; the server tests now assert jsPDF delivery for
  **both** servers.
* A `Content-Security-Policy` with `connect-src 'self'` / `default-src 'self'` is
  served on every response and was asserted in the server tests.
* The E2E test recorded **0 external requests** during a full scan including OCR,
  capture rendering, A4 generation and download, on both servers and from the
  extracted ZIP.

## 3. Bugs found and fixed during testing

1. A unit-name regex (`1 A ...`) was swallowing genuine question numbers → fixed.
2. Bare footer page numbers were being mistaken for question numbers → fixed.
3. `server.js` set HTTP headers after `writeHead` (Node throws) → fixed.
4. `server.js` ignored `--port 9000` style arguments → fixed; both `--port=X` and
   `--port X` now work.
5. The app was not passing `printedCandidate` into the analysis engine, so printed
   page numbers were always blank in the real app (unit tests passed because they
   supplied it manually) → fixed and re-verified in the browser.
6. On restart, the port-probe socket lacked `SO_REUSEADDR`, so leftover TIME_WAIT
   connections made the server silently fall back to a random port instead of the
   requested one → fixed; `--port 8777` is now honoured on restart. Also removed
   the `Cross-Origin-Opener-Policy` response header because it can interfere with
   iframe embedding in local preview proxies (the `connect-src 'self'` CSP still
   blocks all external connections).
7. **v2 — printed page number shown equal to the question number.** In v1 the
   printed-page column was inferred from bare numbers near the end of extracted
   lines, which could pick up the question number itself. v2 keeps pdf.js item
   coordinates, accepts a printed number only from the **bottom-centred footer
   band**, rejects centred numbers as question numbers, passes detected question
   numbers as a **banned list** to the text-only fallback, and applies a final
   guard that suppresses any unconfirmed printed value equal to the question
   number. Covered by unit tests and a browser regression assertion.
8. **v2 — matching accuracy.** Hyphenated line breaks and phrases split across
   lines are normalised before matching; overlapping phrases are grouped into
   term families and scored, so one concept does not inflate confidence. Covered
   by new unit tests.

## 4. Missing papers / link limitations

* **No missing papers** in the requested 5 × 3 grid: all 15 QP entries were found
  on PapaCambridge's live year pages. See `QUESTION-PAPER-LINKS.md`.
* **No official Cambridge public download** exists for these Oct/Nov papers; the
  Cambridge site publishes only a small selection and points schools to the
  login-only School Support Hub. All 15 links are therefore hosted by
  PapaCambridge (third-party), and are labelled as such. No login or access
  control was bypassed.
* **Link verification scope:** I verified each entry's label, filename, session,
  syllabus, component and download URL on the live source pages. This sandbox's
  shell has no general outbound internet, so I could not issue HTTP HEAD requests
  to the PDF URLs, and — as requested — I did **not** download the PDFs. I
  therefore cannot confirm the byte-level contents of any linked file.
* Third-party archive URLs can change; the report documents the URL pattern and
  alternative hosts.

## 5. Limitations of the app (please read)

* **Heuristic matching.** Topic filtering is keyword-based, not semantic. A
  genuine basic-magnetism question phrased in unusual words could be missed; a
  question that merely mentions a magnet inside an electromagnetism question is
  put in the "needs review" bucket rather than silently included. Use the
  **Needs review** filter and the **Show excluded** toggle.
* **Question numbers.** Detected from line-start numbering in the **left margin**
  with a monotonic guard. Multi-column layouts, unusual fonts, or numbers printed
  as graphics may yield "Not identifiable". Cross-page continuation is inferred
  and always flagged uncertain.
* **Printed page numbers.** Require a bottom-centred footer number on at least 3
  pages with a consistent offset. Otherwise the column shows `—`. Even when a
  printed number legitimately equals a question number, it is shown only with a
  *position verified* tooltip. Always rely on the **PDF page** column.
* **OCR.** English only, LSTM-only Tesseract model, ~1750 px rasterisation.
  Handwriting, tiny diagrams, heavy scan noise, or non-English text may not be
  recognised. OCR results are always flagged uncertain. On OCR pages the auto
  crop falls back to nearly the whole page because there are no text coordinates;
  align manually.
* **Captures are page images, not vector text.** The A4 PDF is built from PNG
  crops of the rendered page at up to 2.4× scale. Very small print may be less
  crisp than the original PDF; zoom the preview to check legibility. Each page of
  a cross-page question becomes its own A4 sheet.
* **Captures live only in the open tab.** Reloading or closing the tab discards
  them (review marks persist). Re-scan and re-save to rebuild. No capture or
  generated PDF is written to disk by the app itself; only the browser download
  you approve creates a file.
* **Download gate.** Building the PDF shows a preview only. A download happens
  solely on **Approve & download** (or the post-approval re-download button).
  Changing a review, a crop or the footer option invalidates the previous build.
* **Encrypted / password-protected / corrupt PDFs** are skipped with a warning;
  the app never attempts to bypass PDF security.
* **Browser PDF `#page=N`** is honoured by most desktop PDF viewers but not all.
  The built-in viewer is the primary exact-page mechanism; the physical page
  number is always printed in the row as a fallback.
* **Duplicate filenames** in different subfolders are keyed by filename, so two
  PDFs with the same name could share a viewer entry. Keep filenames unique.
* **Runtime**. Requires Python 3.8+ or Node.js 16+ plus a modern browser
  (Chrome / Edge / Firefox / Safari). Everything else is bundled. Opening
  `web/index.html` directly via `file://` is not supported (browsers block PDF
  workers there); the app shows a clear warning and a folder-picker fallback.
* The app produces **no answers and no mark schemes**, and does not reproduce
  question text in the results table. The A4 PDF contains only the page regions
  **you** selected from **your own local PDFs**.

## 6. Files

* `tests/make_fixtures.py` — generates the synthetic PDFs (dev only; needs
  `reportlab` + `pillow`).
* `tests/test_analyze.js` — 35 assertion groups, no dependencies.
* `tests/test_server.py` — 41 integration checks for both servers, no dependencies.
* `tests/test_e2e.js` — 51 browser end-to-end checks (dev only; needs Playwright
  and a headless Chromium).
