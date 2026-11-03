# Third-party notices

All third-party code and data used by QP Page Finder are **bundled inside this
folder** so the app works offline. Nothing is downloaded at run time.

| Bundled file(s) | Package / version | Licence | Licence text |
| --- | --- | --- | --- |
| `web/vendor/pdf.min.js`, `web/vendor/pdf.worker.min.js` | [pdfjs-dist](https://github.com/mozilla/pdf.js) 3.11.174 (Mozilla Foundation) | Apache-2.0 | `web/vendor/LICENSES/LICENSE-pdfjs-dist.txt` |
| `web/vendor/standard_fonts/*` | pdfjs-dist standard font data (Liberation Sans, Foxit fonts) | SIL OFL / Foxit licence | `web/vendor/LICENSES/LICENSE-LIBERATION.txt`, `LICENSE-FOXIT.txt` |
| `web/vendor/tesseract.min.js`, `web/vendor/worker.min.js` | [tesseract.js](https://github.com/naptha/tesseract.js) 5.1.1 | Apache-2.0 | `web/vendor/LICENSES/LICENSE-tesseract.js.md` |
| `web/vendor/core/tesseract-core-lstm.wasm.js`, `tesseract-core-simd-lstm.wasm.js` | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) 5.1.1 (Tesseract OCR / Google) | Apache-2.0 | `web/vendor/LICENSES/LICENSE-tesseract.js-core.txt` |
| `web/vendor/lang/eng.traineddata.gz` | [@tesseract.js-data/eng](https://github.com/naptha/tessdata) 1.0.0, `4.0.0_best_int` English LSTM model (derived from `tessdata_fast`) | Apache-2.0 | Apache-2.0 text in `LICENSE-tesseract.js-core.txt`; upstream: <https://github.com/tesseract-ocr/tessdata_fast> |

Only the two **LSTM-only** WebAssembly cores are bundled. `.wasm.js` files are
Emscripten single-file builds (the WASM binary is embedded), so no separate
`.wasm` fetch is needed. `eng.traineddata.gz` is the smaller integer-quantised
model, matching the LSTM-only engine mode used by the app.

QP Page Finder's own source (`server.py`, `server.js`, `web/*.js`, `web/*.css`,
`web/index.html`, `tests/`) is provided for your personal local use.
