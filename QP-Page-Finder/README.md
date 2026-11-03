# QP Page Finder — basic magnetism pages in Cambridge IGCSE Physics 0625 QPs

A small, **portable, offline** local web app that scans the folder of question-paper
PDFs you downloaded and tells you which **physical PDF page** contains questions
about *simple phenomena of magnetism* (magnetic materials, poles, attraction and
repulsion, induced/permanent magnetism, magnetic fields and field patterns,
compass behaviour). It then opens the original PDF at that page in a built-in viewer.

It does **not** download, reproduce, summarise, screenshot, export, combine or
modify any paper. It does not produce answers or mark schemes. It does not upload
anything anywhere. It does not bypass PDF passwords or access restrictions.

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
the OCR engine, the OCR language data and all fonts — is already bundled in
`web/vendor/`.

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
| Printed page | The number printed on the page, **only when** a consistent printed-page sequence can be identified; `—` otherwise |
| Matched topics | Keyword *labels* only — question text is never shown |
| Status / review | Confidence, uncertainty reasons, and **✓ Relevant / ✕ Not relevant** buttons |
| Open | **Open at page** (built-in viewer), **Open PDF at page** (original file in your browser at `#page=N`), **Copy page reference** |

**Uncertain matches** are clearly marked in amber with a reason (OCR-derived text,
no identifiable question number, possible cross-page continuation, only one
magnetism keyword, or mixed electromagnetism wording). Use the review buttons to
accept or reject them; the choice is stored only in this browser's local storage.
Use the **Show** filter to list only matches that need review.

### Opening a page

* **Open at page N (in-app)** opens the built-in viewer at exactly that physical
  PDF page. Use ← / → or the arrow keys to move around. It is view-only: there is
  no download, screenshot or export button.
* **Open PDF at page N ↗** is the reliable fallback: it opens the original PDF in
  your browser's own PDF viewer with `#page=N`. Most browsers honour that fragment.
  The exact page number is always printed in the row, so you can also jump manually.

### Behaviour you should know about

* **Encrypted / password-protected PDFs** are skipped with an explicit warning.
  The app never tries to bypass PDF security.
* **Scanned pages** are detected and OCR'd locally; OCR results are always flagged
  "uncertain" so you can confirm them in the viewer.
* **Questions continuing across pages** are merged into a page range and flagged
  for review.
* PDFs are opened **read-only**. The server never writes a file. Verify with the
  file timestamps/hashes — see `TESTING-REPORT.md` for the tests we ran.

---

## 3. Privacy / offline guarantee

* The server binds to **127.0.0.1 only** and serves files from your own disk.
* A Content-Security-Policy restricts connections to `'self'` (the localhost
  server) and blocks any external network request. All scripts, workers, WASM,
  fonts and OCR language data are loaded from `web/vendor/` inside this folder.
* No analytics, telemetry, CDN, fonts from Google, or remote APIs.
* No caching of PDF content, no writing to disk, no logging of PDF text.

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
│   ├── analyze.js          <- topic classification, question/printed-page detection
│   ├── app.js              <- PDF extraction, OCR, results, viewer
│   └── vendor/             <- ALL offline dependencies (pdf.js, Tesseract.js,
│                              WASM cores, English traineddata, fonts, licences)
└── tests/                  <- synthetic test PDFs generator + test scripts
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
| Opened `web/index.html` directly by double-click | Use the launcher instead — browsers block PDF workers on `file://` pages |

---

## 6. Source code

All of the app's own source is right here in this folder (plain Python, plain
JavaScript, HTML and CSS — no build step, no obfuscation). Third-party libraries
are unmodified upstream distributions; see `THIRD-PARTY-NOTICES.md`.
