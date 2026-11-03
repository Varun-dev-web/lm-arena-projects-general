# QP Page Finder v2 — basic magnetism pages in Cambridge IGCSE Physics 0625 QPs

A small, **portable, offline** local web app that scans the folder of question-paper
PDFs you downloaded and tells you which **physical PDF page** contains questions
about *simple phenomena of magnetism* (magnetic materials, poles, attraction and
repulsion, induced/permanent magnetism, magnetic fields and field patterns,
compass behaviour). It opens the original PDF at that page in a built-in viewer.

**New in v2:** when you confirm a question, the app automatically renders a
capture of that PDF page, lets you **manually align the crop**, and adds each
approved capture as an **A4-sized page** to one new PDF. You review the whole A4
PDF in a preview, and it downloads **only after you click "Approve & download"**.

It does **not** produce answers or mark schemes, does not upload anything, does
not bypass PDF passwords/access restrictions, and does **not modify your original
PDFs** (the A4 file is a brand-new PDF created from the regions you selected).

---

## 1. Setup (Windows — your OS)

1. **Download and unzip** `qp-page-finder-windows.zip`.
   You get one folder named `QP-Page-Finder` (plus a copy of
   `QUESTION-PAPER-LINKS.md` with the paper links).
2. **Move that folder into the folder where your QP PDFs live.** For example:

   ```
   C:\Users\You\Documents\IGCSE Physics\
       0625_w25_qp_41.pdf
       0625_w25_qp_42.pdf
       0625_w25_qp_43.pdf
       ...
       QP-Page-Finder\          <-- put the whole folder here
           START-HERE.bat
           server.py
           web\
           ...
   ```

3. **Double-click `START-HERE.bat`.** A black console window opens and your default
   browser opens `http://127.0.0.1:8777/`. (If the browser does not open, type
   that address yourself.)
4. **Keep the console window open** while you use the app. When finished, press
   `Ctrl+C` in the console (or close the window) to stop the local server.

That's it. No `npm install`, no `pip install`, no internet connection needed.

### Runtime requirement

The launcher needs **either Python 3.8+ or Node.js 16+** already installed — both
are free and very common. It tries Python 3 (`py -3`, then `python`), then Node.js.
If neither is found, it prints instructions. Everything else — the PDF engine,
the OCR engine, the OCR language data, the PDF-writing library and all fonts — is
already bundled in `web/vendor/`.

* No Python? Install from <https://www.python.org/downloads/> (tick **Add Python
  to PATH** during setup) and double-click `START-HERE.bat` again.
* Prefer Node? Run `node server.js` from this folder.
* Manual start: `python server.py --no-browser` or `node server.js --no-browser`.
* Change port / starting folder:
  `python server.py --port 9000 --folder "C:\IGCSE Physics\Papers"`.

### macOS / Linux (included for completeness)

Double-click `START-HERE.command` (macOS) or run `./START-HERE.sh` (Linux), or run
`python3 server.py`. The app itself is identical on every OS.

---

## 2. Short user guide

**Step 1 — Folder.** On startup the app lists PDFs in the *parent* of
`QP-Page-Finder` (i.e. the folder you put it in). You can:

* press **List PDFs** to re-scan the folder path shown,
* **Use parent folder (default)** / **Use this app folder** to switch,
* type any path and press **List PDFs** ("option to select a different folder"),
* or click **Choose a different folder…** to pick a folder with the browser's
  folder picker (this reads the files directly in your browser),
* tick **Include subfolders** for a recursive scan,
* tick/untick individual PDFs, or **Select all / Select none**.

**Step 2 — Scan.** Press **Scan selected PDFs**.

* **Use bundled offline OCR on scanned / image-only pages** is on by default.
  Pages with almost no extractable text are rasterised *in memory only* and read
  by the bundled Tesseract WebAssembly engine. Nothing is saved or sent.
* **Show excluded electromagnetism questions** reveals the questions that were
  filtered out because they were only about motors / transformers / induction /
  coils. It is off by default.
* A progress bar and a status line show what is happening. **Stop** ends the scan
  after the current page.

**Step 3 — Results.** Each row shows:

| Column | Meaning |
| --- | --- |
| PDF filename | The original file (never altered) |
| Component | e.g. `0625/41 (Paper 4, variant 1)`, read from the filename or the printed header |
| Question | Question number when it can be identified; otherwise "Not identifiable" |
| PDF page(s) | **Exact physical page number** in the PDF; a range such as `4-5` means the question continues across pages |
| Printed page | The number printed on the page. In v2 this is read from the **position** of a bottom-centred footer number; a plain question number is never reused as a printed page. `—` when not verifiable |
| Matched topics | Keyword *labels* only — question text is never shown in the table |
| Status / review | Confidence, uncertainty reasons, capture progress, and **✓ Relevant / ✕ Not relevant** buttons |
| Open / capture | **Open at page** (built-in viewer), **Open PDF at page** (original file at `#page=N`), **Capture / align** |

**Uncertain matches** are clearly marked in amber with a reason (OCR-derived text,
no identifiable question number, possible cross-page continuation, only one
magnetism keyword family, or mixed electromagnetism wording). Use the review
buttons to accept or reject them; the choice is stored only in this browser's
local storage.

### Opening a page

* **Open at page N (in-app)** opens the built-in viewer at exactly that physical
  PDF page. Use ← / → or the arrow keys to move around. It is view-only.
* **Open PDF at page N ↗** is the reliable fallback: it opens the original PDF in
  your browser's own PDF viewer with `#page=N`. Most browsers honour that fragment.

### Step 4 — Build your A4 PDF

1. Mark a question **✓ Relevant**. The app immediately renders that PDF page (or
   each page of a cross-page range) as an automatic capture and opens the
   **alignment editor**.
2. **Align the crop manually.** Drag the red box to move it, drag a corner handle
   to resize it, drag on the page to draw a new box, or type Left/Top/Right/Bottom
   percentages. **Auto-select question region** uses the detected line positions
   to suggest a box around the question; **Full page** selects everything. For a
   question spanning several pages, switch pages with the **PDF page** dropdown —
   each page has its own crop box.
3. Press **Save capture(s)** (or **Use full page (skip aligning)**). Each saved
   capture becomes one A4 sheet. The row shows how many captures it has.
4. Check **every question that needs checking**. The compile panel counts
   confirmed questions, captures, questions still to check, and A4 sheets ready.
   **Mark remaining unchecked as "not relevant"** is available as a shortcut, but
   it is your decision — the app never decides for you.
5. Press **Build A4 PDF (preview)**. Nothing downloads at this point. The new PDF
   is built locally with the bundled jsPDF library; each capture is fitted onto a
   portrait A4 page. Optionally tick **Add a small page reference footer**.
6. **Review the preview** in the built-in viewer (use Previous / Next for every
   sheet). The header says *not downloaded yet*.
7. Press **✓ Approve & download A4 PDF**. Only now does the browser download
   `QP-Magnetism-A4.pdf`. A **Download approved A4 PDF again** button appears.

**Nothing is downloaded automatically at any other point.** The A4 PDF is a new
file; original question-paper PDFs are never modified, split or combined. If you
change a review, a crop or the footer setting, the previous preview is discarded
and you must build and approve again.

> Captures are held in the browser tab's memory. If you **reload or close the tab**,
> re-scan the PDFs and re-save the captures (review marks persist in local storage,
> but the page images do not).

### Accuracy improvements in v2

* Phrases split across extracted lines (e.g. `magnetic field` / `pattern`) are
  joined before matching, so a line break no longer hides a topic.
* Keyword **families** deduplicate overlapping phrases (e.g. "compass",
  "plotting compass", "compass needle" count as one concept), with a weighted
  confidence score and richer uncertainty reasons.
* Question numbers are required to be in the **left margin**, using pdf.js item
  coordinates, so centred figure numbers are not mistaken for questions.
* **Printed page numbers** come only from **bottom-centred footer** items. A text
  fallback passes the detected question numbers as a banned list, and a final
  guard suppresses any unconfirmed printed number that equals the question
  number. This fixes the v1 bug where the printed-page column could show the
  question number.

### Behaviour you should know about

* **Encrypted / password-protected PDFs** are skipped with an explicit warning.
  The app never tries to bypass PDF security.
* **Scanned pages** are detected and OCR'd locally; OCR results are always flagged
  "uncertain" so you can confirm them in the viewer.
* **Questions continuing across pages** are merged into a page range and flagged
  for review; each page in the range gets its own A4 sheet.
* PDFs are opened **read-only**. The server never writes a file. Verify with the
  file timestamps/hashes — see `TESTING-REPORT.md` for the tests we ran.

---

## 3. Privacy / offline guarantee

* The server binds to **127.0.0.1 only** and serves files from your own disk.
* A Content-Security-Policy restricts connections to `'self'` (the localhost
  server) and blocks any external network request. All scripts, workers, WASM,
  fonts, the PDF-writing library and OCR language data are loaded from
  `web/vendor/` inside this folder.
* No analytics, telemetry, CDN, fonts from Google, or remote APIs.
* No caching of PDF content, no writing to disk, no logging of PDF text.
* The A4 PDF is generated **in your browser** from canvas images of pages you
  selected, and the download is a browser `Blob` URL. Nothing is uploaded. The
  only file the app ever offers to save is the A4 PDF you explicitly approved.

You can verify this yourself: disconnect from the internet and the app still works.

---

## 4. Folder contents

```
QP-Page-Finder/
├── START-HERE.bat          <- Windows: double-click this
├── START-HERE.command      <- macOS alternative
├── START-HERE.sh           <- Linux alternative
├── server.py               <- local read-only server (Python 3 stdlib only)
├── server.js               <- same server for Node.js (zero dependencies)
├── README.md               <- this file
├── THIRD-PARTY-NOTICES.md
├── TESTING-REPORT.md       <- what was actually tested and how
├── web/
│   ├── index.html, style.css
│   ├── analyze.js          <- v2 positional analysis, term families, crop hints
│   ├── app.js              <- PDF extraction, OCR, results, capture/alignment,
│   │                          A4 build, preview, approval, download
│   └── vendor/             <- ALL offline dependencies (pdf.js, Tesseract.js,
│                              WASM cores, English traineddata, jsPDF, fonts,
│                              licences)
└── tests/                  <- synthetic test PDF generator + test scripts
```

---

## 5. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Console says "Neither Python 3 nor Node.js was found" | Install Python 3 (tick "Add Python to PATH") or Node.js, then run the launcher again |
| Browser opens but says "Could not list folder" | Type the correct absolute path in the folder box and press **List PDFs**, or use **Choose a different folder…** |
| "0 PDFs" | Put your PDFs in the parent folder, or select the folder that actually holds them |
| A PDF is skipped | It is password-protected/encrypted or corrupt. This app does not bypass PDF security |
| OCR engine unavailable | Check `web/vendor/core/`, `web/vendor/lang/eng.traineddata.gz` and `web/vendor/worker.min.js` are present. The app still works with text-only PDFs |
| A relevant question is missing | Turn on **Show excluded electromagnetism questions**, check the **Needs review** filter, and see "Limitations" in `TESTING-REPORT.md` |
| Printed page shows `—` | No bottom-centred footer number could be verified. Use the **PDF page** column |
| **Build A4 PDF (preview)** stays disabled | Check every uncertain question and save a capture for every confirmed question (see the counters in step 4) |
| Capture editor says "Re-scan …" | You reloaded the tab; page images are memory-only. Re-scan and re-save |
| Alignment editor is blank | Wait for "Rendering PDF page …" to finish; very large scanned pages take longer |
| Opened `web/index.html` directly by double-click | Use the launcher instead — browsers block PDF workers on `file://` pages |

---

## 6. Source code

All of the app's own source is right here in this folder (plain Python, plain
JavaScript, HTML and CSS — no build step, no obfuscation). Third-party libraries
are unmodified upstream distributions; see `THIRD-PARTY-NOTICES.md`.
