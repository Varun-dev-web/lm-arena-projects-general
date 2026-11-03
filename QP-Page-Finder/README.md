# QP Page Finder v3 — basic magnetism pages in Physics 0625 QPs **and their mark schemes**

A small, **portable, 100% offline** local web app. It scans the question-paper (QP)
PDFs you downloaded, tells you which **physical PDF page** contains each question
about *simple phenomena of magnetism*, and — for every question you confirm —
finds the **exact physical page of the matching mark scheme (MS)** and puts it in
a **separate A4 PDF**.

**New in v3:**

* **Two independent folder/file bars** — one for QP PDFs, one for MS PDFs. Each has
  its own path box, folder picker, recursive toggle, file list and select all/none.
* PapaCambridge MS names such as `0625_w21_ms_41.pdf` are parsed into syllabus,
  **year**, **series**, doc type and component, and matched to
  `0625_w21_qp_41.pdf`. The results table gains an **MS PDF page(s)** column with
  the exact page where that question number is marked.
* Every **✓ Relevant** question requires **both** a QP capture and an MS capture.
  Both use **the same manual alignment editor** (drag the box, drag a corner, type
  percentages, auto-select, full page) — the MS editor opens automatically after
  the QP one is saved.
* **Two separate A4 PDFs** are compiled in the same selected order:
  `QP-Magnetism-A4.pdf` and `MS-Magnetism-A4.pdf`. They are **never combined**.
* You can switch the preview between the two PDFs, **open the current one for
  printing**, and approve **each download separately**. Nothing downloads before
  your approval.

Everything from v1/v2 is preserved: read-only originals, bundled offline OCR,
position-verified printed page numbers, cross-page ranges, uncertainty flags,
encrypted-PDF skipping, and review persistence.

It does **not** generate answers or mark-scheme text — it only handles **your own
local MS PDFs**. It does not upload anything, does not bypass PDF passwords/access
restrictions, and does **not modify your original PDFs**.

---

## 1. Setup (Windows — your OS)

1. **Download and unzip** `qp-page-finder-windows.zip`.
   You get one folder named `QP-Page-Finder`, plus
   `QUESTION-PAPER-LINKS.md` (the original 15 Oct/Nov QP links) and
   `QUESTION-PAPER-LINKS-ALL-SERIES.md` (all series, QP + MS, 5 years).
2. **Put the QP and MS PDFs wherever you like.** Two folders is tidy, but one
   folder also works — the two bars pre-select QP files and MS files respectively.

   ```
   C:\Users\You\Documents\IGCSE Physics\
       0625_w21_qp_41.pdf
       0625_w21_qp_42.pdf
       Mark Schemes\
           0625_w21_ms_41.pdf
           0625_w21_ms_42.pdf
       QP-Page-Finder\          <-- put the whole folder here
           START-HERE.bat
           server.py
           web\
           ...
   ```

3. **Double-click `START-HERE.bat`.** Your default browser opens
   `http://127.0.0.1:8777/`. Keep the console window open; press `Ctrl+C` to stop.
4. In the app, set **1a QP folder** to your question papers and **1b MS folder**
   to your mark schemes (type a path + **List … PDFs**, or use the folder picker).

No `npm install`, no `pip install`, no internet connection needed.

### Runtime requirement

The launcher needs **either Python 3.8+ or Node.js 16+**. Everything else —
pdf.js, Tesseract.js, WASM cores, English OCR data, jsPDF and fonts — is bundled
in `web/vendor/`.

* No Python? Install from <https://www.python.org/downloads/> (tick **Add Python
  to PATH**) and double-click `START-HERE.bat` again.
* Prefer Node? Run `node server.js` from this folder.
* Manual start / different port or folder:
  `python server.py --no-browser --port 9000 --folder "C:\IGCSE Physics\Papers"`.
* macOS / Linux: `START-HERE.command`, `START-HERE.sh`, or `python3 server.py`.

---

## 2. Short user guide

**Step 1 — two folder bars.** Both list PDFs in the parent of `QP-Page-Finder` by
default, independently. Each bar can type a different path, pick a different folder,
tick **Include subfolders**, tick/untick individual PDFs, or **Select all / none**.
The MS bar also shows what each filename decoded into (year, session, component,
doc type) so you can tell at a glance whether matching will work.

> Matching rule: `0625_w21_ms_41.pdf` matches `0625_w21_qp_41.pdf` only when
> **syllabus + year/session code + component** are all equal. A wrong year, wrong
> series (`m`/`s`/`w`) or wrong variant is reported as **no matching MS**, never
> guessed. Both documents must be in the two selected folders.

**Step 2 — Scan.** Press **Scan selected PDFs**. Bundled offline OCR handles
image-only QP pages. **Show excluded electromagnetism questions** reveals filtered
questions. The MS PDFs are indexed by their own question-number rows at the same
time. A status line reports how many MS PDFs were indexed.

**Step 3 — Results.** Each row shows:

| Column | Meaning |
| --- | --- |
| PDF filename | The original QP file (never altered) |
| Component | e.g. `0625/41 (Paper 4, variant 1)` |
| Question | Question number, or "Not identifiable" |
| QP PDF page(s) | Exact physical page in the QP; `2-3` = continuation across pages |
| Printed page | Position-verified bottom-centred footer number, or `—` |
| **MS PDF page(s)** | **Exact physical page in the matched MS** where that question number is marked. `—` = no matching MS PDF in the MS folder; `page ? (align)` = the number was not found in the MS text, so align its page manually |
| Matched topics | Keyword *labels* only — no question text in the table |
| Status / review | Confidence, uncertainty, **QP** and **MS** capture progress, ✓ Relevant / ✕ Not relevant |
| Open / capture | **Open at page** (built-in viewer), **Open PDF at page** (`#page=N`), **Capture / align QP**, **Capture / align MS**, **Open MS at page ↗** |

**Step 4 — capture, align, build, preview, print, approve.**

1. Mark a question **✓ Relevant**. The QP alignment editor opens automatically.
2. Align the QP crop (drag / corner handles / percentages / **Auto-select question
   region** / **Full page**). Cross-page questions have one box per page.
3. Press **Save capture(s)** or **Use full page (skip aligning)**. The **same
   editor immediately opens for the matched MS page(s)** — identical controls,
   with a clear `MS` badge and the MS filename in the title. Align and save it too.
4. Check **every question that needs checking**. The compile panel shows confirmed
   questions, complete QP+MS capture pairs, questions still to check, and
   `QP sheets + MS sheets`. **Build A4 PDFs (preview)** stays disabled until all
   confirmed questions have both captures.
5. Press **Build A4 PDFs (preview)**. **Two** A4 PDFs are built locally with the
   bundled jsPDF, in the **same order for both files** (the confirmed-question
   list: filename → PDF page → question number). Nothing
   downloads at this point. Optionally tick **Add a small page reference footer**.
6. Use the **Preview** dropdown in the approval bar to switch between
   *Question paper PDF* and *Mark scheme PDF*, and Previous / Next to inspect every
   sheet. **Print / open for printing** opens the currently previewed PDF in a new
   tab (use your browser's print dialog). It never downloads or uploads anything.
7. Press **✓ Approve & download QP PDF** and **✓ Approve & download MS PDF**
   separately. Only now does the browser download `QP-Magnetism-A4.pdf` and
   `MS-Magnetism-A4.pdf` — **two separate files**. Re-download buttons appear.

**Nothing downloads automatically at any other point.** Both PDFs are new files;
your originals are never modified, split or combined. Changing a review, a crop
or the footer setting discards the preview and requires a new build + approval.

> Captures live in the tab's memory. If you reload or close the tab, re-scan and
> re-save the captures (review marks persist in local storage, page images do not).

### Accuracy and behaviour notes

* Phrases split across extracted lines are joined; keyword **families** deduplicate
  overlapping phrases with a weighted confidence score and uncertainty reasons.
* QP question numbers must be in the **left margin** (pdf.js item coordinates).
* Printed page numbers come only from **bottom-centred footer** items; a bare
  question number is never reused as a printed page.
* MS question markers (`2 (a) …`, `Question 5`, bare margin numbers) are indexed
  per MS page using the same left-margin and footer guards. If the number cannot be
  found, the app says so and asks you to align the MS page manually rather than
  pretending to know it.
* **Encrypted / password-protected PDFs** are skipped with an explicit warning;
  the app never bypasses PDF security. Scanned QP pages are OCR'd locally and
  flagged uncertain.
* PDFs are opened **read-only**. The server never writes a file.

---

## 3. Privacy / offline guarantee

* The server binds to **127.0.0.1 only** (the session's live preview uses
  `0.0.0.0` only because the preview proxy requires it).
* CSP restricts connections to `'self'`. All scripts, workers, WASM, fonts, the
  PDF-writing library and OCR data load from `web/vendor/`.
* No analytics, telemetry, CDN, remote fonts or remote APIs. **Zero external
  requests** are asserted by the browser test.
* No caching of PDF content, no disk writes, no logging of PDF text.
* Both A4 PDFs are generated **in your browser** from canvas images of pages you
  selected; downloads are browser `Blob` URLs. Nothing is uploaded.

Disconnect from the internet and the app still works.

---

## 4. Folder contents

```
QP-Page-Finder/
├── START-HERE.bat / .command / .sh   <- launchers
├── server.py / server.js             <- local read-only servers
├── README.md, TESTING-REPORT.md, THIRD-PARTY-NOTICES.md
├── web/
│   ├── index.html, style.css
│   ├── analyze.js          <- positional analysis, term families, crop hints,
│   │                          MS filename matching + MS question/page index
│   ├── app.js              <- dual folder bars, PDF extraction, OCR, results,
│   │                          QP+MS alignment, two A4 builds, preview/print,
│   │                          separate approvals and downloads
│   └── vendor/             <- ALL offline dependencies (licences included)
└── tests/                  <- synthetic PDF generator + unit/server/E2E tests
```

See also `../QUESTION-PAPER-LINKS.md` and
`../QUESTION-PAPER-LINKS-ALL-SERIES.md`. Those are **third-party PapaCambridge**
links, not official Cambridge URLs, and no real PDFs are bundled here.

---

## 5. Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Neither Python 3 nor Node.js was found" | Install Python 3 (tick "Add Python to PATH") or Node.js |
| "Could not list folder" | Type the correct absolute path and press **List … PDFs**, or use the folder picker |
| "0 PDFs" | Point each bar at the folder that actually holds its PDFs |
| MS column shows `—` | No MS in the MS folder matches that year / session / component. Add `0625_<series><yy>_ms_<component>.pdf`, or use **Capture / align QP** only |
| MS column shows `page ? (align)` | The question number was not detected in the MS text; use the editor's page dropdown / full page and align manually |
| **Build A4 PDFs (preview)** stays disabled | Check every uncertain question and save **both** a QP and an MS capture for each confirmed question |
| Only one approve button enabled | No confirmed question had a matching MS; only the QP PDF exists. Add the MS PDF and re-scan |
| A PDF is skipped | Password-protected / encrypted or corrupt. The app does not bypass PDF security |
| OCR engine unavailable | Check `web/vendor/core/`, `web/vendor/lang/eng.traineddata.gz`, `web/vendor/worker.min.js` |
| Capture editor says "Re-scan …" | You reloaded the tab; page images are memory-only |
| Opened `web/index.html` directly | Use `START-HERE.bat` instead — browsers block PDF workers on `file://` |

---

## 6. Source code

Plain Python, plain JavaScript, HTML and CSS — no build step, no obfuscation.
Third-party libraries are unmodified upstream distributions; see
`THIRD-PARTY-NOTICES.md`.
