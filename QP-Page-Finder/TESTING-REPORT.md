# QP Page Finder — testing report & limitations

**Date:** 2026-11-03 · **Packaged for:** Windows (macOS/Linux launchers included)

This report states what was *actually* run and checked. Nothing here is claimed on
the basis of inspection alone.

## 1. Test environment

* Sandbox: Linux, Python 3.11.2, Node 22.22.3.
* Headless Chromium (via `playwright-core` + a self-contained Chromium binary) was
  used to drive the app as a real browser. Those are **development-only** tools;
  they are **not** bundled in the app and are **not** needed to run it.
* Test PDFs were **synthetic files written for testing** (`tests/make_fixtures.py`),
  containing invented sentences. No Cambridge question paper was downloaded,
  opened, copied or bundled. Fixtures are generated into a temporary folder and
  are deliberately **not** shipped in the ZIP.
* The live preview of the app in this session uses `--host 0.0.0.0` (required by
  the preview proxy) and a temporary folder of synthetic fixtures. The shipped
  launchers use the default `--host 127.0.0.1`, i.e. **localhost only**.

## 2. What was tested and the results

| Test | Command | Result |
| --- | --- | --- |
| JS / Python syntax | `node --check` on every `.js`; `python3 -m py_compile` on every `.py` | Pass |
| Analysis engine (classification, filename/component parsing, question-number detection, printed-page sequence, cross-page ranges, OCR flagging) | `node tests/test_analyze.js` | **25/25 passed** |
| Both servers (Python + Node), every endpoint, CSP/privacy headers, path-traversal blocking, bundled asset delivery, read-only guarantee | `python3 tests/test_server.py /tmp/qp-fixtures` | **40/40 checks passed** (19 Python + 19 Node + 2 shared) |
| Real-browser end-to-end (from source) | `node tests/test_e2e.js` | **27/27 passed** |
| **The packaged ZIP itself** | extracted `qp-page-finder-windows.zip` into a temp folder, placed synthetic PDFs alongside it (exactly as a user would), started `START-HERE`'s server with **no `--folder` argument**, then re-ran the browser test | **default folder auto-detected (5 PDFs); 27/27 passed** |

### What the end-to-end browser test actually exercised

* The folder is auto-scanned on page load and all synthetic PDFs are listed.
* Clicking **Scan** runs **real pdf.js text extraction** on multi-page PDFs.
* The **image-only PDF** was rasterised and read by the **bundled offline
  Tesseract WebAssembly engine** with the bundled `eng.traineddata.gz`; the
  OCR engine reported "ready (offline)" and the result was flagged uncertain.
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

### Read-only guarantee (tested)

`test_server.py` hashes every fixture PDF before and after all requests and asserts
the hashes are identical. The server opens PDFs with `open(..., "rb")` /
`fs.readFileSync` only; there is no write path anywhere in the app.

### Offline guarantee (tested)

* All runtime assets resolve to the localhost server: `pdf.min.js`,
  `pdf.worker.min.js`, `tesseract.min.js`, `worker.min.js`, the WASM cores,
  `eng.traineddata.gz` and the standard fonts are bundled in `web/vendor/`.
* A `Content-Security-Policy` with `connect-src 'self'` / `default-src 'self'` is
  served on every response and was asserted in the server tests.
* The E2E test recorded **0 external requests** during a full scan including OCR.

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
   blocks all external connections), and moved the preview's demo PDFs from
   `/tmp` into a persisted folder inside the workspace.

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
  **Needs review** filter and the **Show excluded** toggle. This is why uncertain
  matches are labelled and manually reviewable.
* **Question numbers.** Detected from line-start numbering with a monotonic
  guard. Multi-column layouts, unusual fonts, or numbers printed as graphics may
  yield "Not identifiable". Cross-page continuation is inferred and always
  flagged uncertain.
* **Printed page numbers.** Only shown when a consistent sequence
  (printed number − physical page = constant) is detected across at least 3
  pages. Otherwise the column shows `—`. Always rely on the **PDF page** column.
* **OCR.** English only, LSTM-only Tesseract model, ~1750 px rasterisation.
  Handwriting, tiny diagrams, heavy scan noise, or non-English text may not be
  recognised. OCR rasterises a page **in memory only** for recognition; no image
  is saved, exported or displayed as a screenshot. OCR results are always flagged
  uncertain.
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
* The app is a **locator/viewer only**. It does not screenshot, export, create or
  combine PDFs, reproduce question text, or generate answers or mark schemes.

## 6. Files

* `tests/make_fixtures.py` — generates the synthetic PDFs (dev only; needs
  `reportlab` + `pillow`).
* `tests/test_analyze.js` — 25 unit tests, no dependencies.
* `tests/test_server.py` — integration tests for both servers, no dependencies.
* `tests/test_e2e.js` — browser end-to-end test (dev only; needs Playwright and a
  headless Chromium).
