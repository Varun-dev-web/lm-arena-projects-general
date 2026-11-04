/* global pdfjsLib, Tesseract, jspdf, QPAnalyze */
/*
 * QP Page Finder v2 - browser application.
 *
 * Everything runs locally. The tiny localhost server (or file:// in fallback
 * mode) only serves the app and reads PDFs read-only; PDF bytes, text and
 * captures are never uploaded or transmitted anywhere.
 *
 * v2 additions:
 *   - pdf.js text-item POSITIONS are kept, so printed page numbers come from
 *     bottom-centred footers instead of being confused with question numbers.
 *   - confirming a question automatically renders a capture of its PDF page(s);
 *     the user manually aligns a crop rectangle;
 *   - captures are compiled into a NEW A4-sized PDF, shown in a preview, and
 *     downloaded ONLY after the user clicks "Approve & download".
 * The user's original question-paper PDFs are never modified.
 */
(function () {
  'use strict';

  var A = window.QPAnalyze;
  var pdfjsLib = window.pdfjsLib;
  var Tesseract = window.Tesseract;
  var REVIEW_KEY = 'qp-page-finder:reviews:v1';   // v1 key retained: hit ids are unchanged

  var state = {
    serverMode: location.protocol !== 'file:',
    config: null,
    entries: [],                 // QP: [{name, rel, size, selected, getBytes(), pdfUrl}]
    msEntries: [],               // MS: same shape, INDEPENDENT folder/file bar
    hits: [],                    // all hits, including 'excluded' ones (filtered in renderResults)
    errors: [],
    docs: {},                    // QP filename -> {pdf, bytes, pageMeta}
    msDocs: {},                  // MS filename -> {pdf, pageMeta, parsed, index, pages}
    reviews: {},                 // hit.id -> 'relevant' | 'notrelevant'
    captures: {},                // QP hit.id -> {pageNo -> {dataUrl,w,h}}
    msCaptures: {},              // MS hit.id -> {pageNo -> {dataUrl,w,h}}
    cropRects: {},               // QP hit.id -> {pageNo -> rect}
    msCropRects: {},             // MS hit.id -> {pageNo -> rect}
    crop: null,                  // active alignment editor {hit, source:'qp'|'ms', ...}
    compiled: null,              // {qp: {...}, ms: {...}|null} - TWO separate PDFs
    previewSource: 'qp',         // 'qp' | 'ms' - which compiled PDF is in the viewer
    viewerMode: 'source',        // 'source' | 'compiled'
    viewer: { filename: null, pdf: null, page: 1, numPages: 1 },
    worker: null, workerReady: false, workerError: null,
    abort: false, scanning: false,
    objectUrls: []
  };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function fmtSize(n) {
    if (!n && n !== 0) return '';
    return n < 1024 ? n + ' B' : (n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function setStatus(msg) { $('scanStatus').textContent = msg; }
  function setProgress(frac) { $('progressBar').style.width = clamp(frac * 100, 0, 100) + '%'; }

  try { state.reviews = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}') || {}; } catch (e) { state.reviews = {}; }
  function saveReviews() {
    try { localStorage.setItem(REVIEW_KEY, JSON.stringify(state.reviews)); } catch (e) { /* storage blocked */ }
  }

  /* ------------------------------------------------------------------ *
   * Folder listing (read-only; identical API to the shipped server)
   * ------------------------------------------------------------------ */
  function renderFileList() {
    var box = $('fileList');
    box.innerHTML = '';
    $('fileCount').textContent = state.entries.length + ' PDF' + (state.entries.length === 1 ? '' : 's');
    if (!state.entries.length) {
      box.appendChild(el('div', 'fileitem muted', 'No PDF files found in this folder. Put your downloaded QP PDFs next to the QP-Page-Finder folder, or choose a different folder.'));
      return;
    }
    state.entries.forEach(function (entry, idx) {
      var row = el('label', 'fileitem');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = entry.selected; cb.id = 'f' + idx;
      cb.addEventListener('change', function () { entry.selected = cb.checked; });
      row.appendChild(cb);
      row.appendChild(el('span', 'fname', entry.name));
      row.appendChild(el('span', 'fsize', fmtSize(entry.size)));
      box.appendChild(row);
    });
  }
  function setEntriesFromServer(data) {
    var dir = data.dir;
    state.entries = (data.files || []).map(function (f) {
      return {
        name: f.name, rel: f.rel, size: f.size, selected: !A.isMarkSchemeName(f.name),
        getBytes: function () {
          return fetch('/api/pdf?dir=' + encodeURIComponent(dir) + '&file=' + encodeURIComponent(f.rel))
            .then(function (r) {
              if (!r.ok) throw new Error('HTTP ' + r.status + ' while reading ' + f.name);
              return r.arrayBuffer();
            });
        },
        pdfUrl: '/api/pdf?dir=' + encodeURIComponent(dir) + '&file=' + encodeURIComponent(f.rel)
      };
    });
    $('folderStatus').textContent = 'Scanning folder: ' + dir + (data.truncated ? ' (list truncated)' : '');
    $('folderPath').value = dir;
    renderFileList();
    $('btnScan').disabled = state.entries.length === 0;
  }
  function refreshList() {
    if (!state.serverMode) {
      $('folderStatus').textContent = 'Opened as a local file - use "Choose a different folder" below.';
      return;
    }
    var dir = $('folderPath').value.trim();
    $('folderStatus').textContent = 'Listing PDFs in ' + dir + ' …';
    fetch('/api/scan?dir=' + encodeURIComponent(dir) + '&recursive=' + ($('recursive').checked ? '1' : '0'))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) {
          $('folderStatus').textContent = data.error;
          state.entries = []; renderFileList(); $('btnScan').disabled = true; return;
        }
        setEntriesFromServer(data);
      })
      .catch(function (e) {
        $('folderStatus').textContent = 'Could not list folder: ' + e.message;
        state.entries = []; renderFileList(); $('btnScan').disabled = true;
      });
  }
  function useFolderPicker(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) { return /\.pdf$/i.test(f.name); });
    state.entries = files.map(function (f) {
      return {
        name: f.name, rel: f.webkitRelativePath || f.name, size: f.size,
        selected: !A.isMarkSchemeName(f.name),
        getBytes: function () { return f.arrayBuffer(); },
        pdfUrl: null, blobUrl: null, file: f
      };
    });
    $('folderStatus').textContent = 'Using folder chosen in the browser (' + state.entries.length +
      ' PDFs). These files are read directly in your browser; nothing is uploaded.';
    renderFileList();
    $('btnScan').disabled = state.entries.length === 0;
  }
  /* ---- v3: the SECOND, independent folder bar for mark schemes ---- */
  function renderMsFileList() {
    var box = $('msFileList');
    box.innerHTML = '';
    $('msFileCount').textContent = state.msEntries.length + ' PDF' + (state.msEntries.length === 1 ? '' : 's');
    if (!state.msEntries.length) {
      box.appendChild(el('div', 'fileitem muted', 'No PDF files found in this folder. Put your downloaded MS PDFs here, or choose a different folder.'));
      return;
    }
    state.msEntries.forEach(function (entry, idx) {
      var row = el('label', 'fileitem');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = entry.selected; cb.id = 'msf' + idx;
      cb.addEventListener('change', function () { entry.selected = cb.checked; });
      row.appendChild(cb);
      row.appendChild(el('span', 'fname', entry.name));
      // Show what the PapaCambridge-style name was decoded into.
      var p = A.parseFilename(entry.name);
      var tag = p.seriesCode && p.component
        ? ('0625 · ' + (p.session || p.seriesCode) + ' ' + p.year + ' · paper ' + p.component +
           (p.docType === 'ms' ? ' · MS' : ' · ' + p.docType.toUpperCase()))
        : (p.docType === 'ms' ? 'MS · year/session/component not in filename' : 'not an MS filename');
      var lab = el('span', 'fsize', tag);
      lab.title = entry.name;
      row.appendChild(lab);
      row.appendChild(el('span', 'fsize', fmtSize(entry.size)));
      box.appendChild(row);
    });
  }
  function setMsEntriesFromServer(data) {
    var dir = data.dir;
    state.msEntries = (data.files || []).map(function (f) {
      return {
        name: f.name, rel: f.rel, size: f.size, selected: A.isMarkSchemeName(f.name),
        getBytes: function () {
          return fetch('/api/pdf?dir=' + encodeURIComponent(dir) + '&file=' + encodeURIComponent(f.rel))
            .then(function (r) {
              if (!r.ok) throw new Error('HTTP ' + r.status + ' while reading ' + f.name);
              return r.arrayBuffer();
            });
        },
        pdfUrl: '/api/pdf?dir=' + encodeURIComponent(dir) + '&file=' + encodeURIComponent(f.rel)
      };
    });
    $('msFolderStatus').textContent = 'MS folder: ' + dir + (data.truncated ? ' (list truncated)' : '');
    $('msFolderPath').value = dir;
    renderMsFileList();
  }
  function refreshMsList() {
    if (!state.serverMode) {
      $('msFolderStatus').textContent = 'Opened as a local file - use "Choose a different MS folder" below.';
      return;
    }
    var dir = $('msFolderPath').value.trim();
    $('msFolderStatus').textContent = 'Listing MS PDFs in ' + dir + ' …';
    fetch('/api/scan?dir=' + encodeURIComponent(dir) + '&recursive=' + ($('msRecursive').checked ? '1' : '0'))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) {
          $('msFolderStatus').textContent = data.error;
          state.msEntries = []; renderMsFileList(); return;
        }
        setMsEntriesFromServer(data);
      })
      .catch(function (e) {
        $('msFolderStatus').textContent = 'Could not list MS folder: ' + e.message;
        state.msEntries = []; renderMsFileList();
      });
  }
  function useMsFolderPicker(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) { return /\.pdf$/i.test(f.name); });
    state.msEntries = files.map(function (f) {
      return {
        name: f.name, rel: f.webkitRelativePath || f.name, size: f.size,
        selected: A.isMarkSchemeName(f.name),
        getBytes: function () { return f.arrayBuffer(); },
        pdfUrl: null, blobUrl: null, file: f
      };
    });
    $('msFolderStatus').textContent = 'Using MS folder chosen in the browser (' + state.msEntries.length +
      ' PDFs). These files are read directly in your browser; nothing is uploaded.';
    renderMsFileList();
  }

  function findEntry(name) {
    for (var i = 0; i < state.entries.length; i++) if (state.entries[i].name === name) return state.entries[i];
    return null;
  }
  function ensureBlobUrl(entry) {
    if (!entry) return Promise.resolve(null);
    if (entry.pdfUrl) return Promise.resolve(entry.pdfUrl);
    if (entry.blobUrl) return Promise.resolve(entry.blobUrl);
    return entry.getBytes().then(function (buf) {
      var u = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
      state.objectUrls.push(u);
      entry.blobUrl = u;
      return u;
    });
  }

  /* ------------------------------------------------------------------ *
   * PDF text extraction - v2 keeps item coordinates
   * ------------------------------------------------------------------ */
  function itemsToLines(tc, pageHeight) {
    var rows = [];
    var items = [];
    (tc.items || []).forEach(function (it) {
      var s = it.str || '';
      if (!s.trim()) return;
      var tr = it.transform || [0, 0, 0, 0, 0, 0];
      var yBottom = tr[5], x = tr[4];
      var yTop = pageHeight - yBottom;
      var w = Math.abs(it.width || 0), h = Math.abs(it.height || 10) || 10;
      // printedPageFromItems() expects BOTTOM-origin y.
      items.push({ text: s, x: x, y: yBottom, w: w, h: h });
      var row = null;
      for (var i = 0; i < rows.length; i++) {
        if (Math.abs(rows[i].yTop - yTop) <= 3) { row = rows[i]; break; }
      }
      if (!row) { row = { yTop: yTop, yBottom: yBottom, parts: [], minX: x, maxX: x + w, maxH: h }; rows.push(row); }
      row.parts.push({ x: x, s: s });
      row.yTop = Math.min(row.yTop, yTop);
      row.yBottom = Math.max(row.yBottom, yBottom);
      row.minX = Math.min(row.minX, x);
      row.maxX = Math.max(row.maxX, x + w);
      row.maxH = Math.max(row.maxH, h);
    });
    rows.sort(function (a, b) { return a.yTop - b.yTop; });
    var lines = [], lineMeta = [];
    rows.forEach(function (r) {
      r.parts.sort(function (a, b) { return a.x - b.x; });
      var line = '';
      r.parts.forEach(function (p) {
        if (line && /[A-Za-z0-9]$/.test(line) && /^[A-Za-z0-9]/.test(p.s)) line += ' ';
        line += p.s;
      });
      lines.push(line.replace(/\s+/g, ' ').trim());
      lineMeta.push({ x: r.minX, yTop: r.yTop, yBottom: r.yBottom, w: Math.max(1, r.maxX - r.minX), h: r.maxH });
    });
    return { lines: lines, lineMeta: lineMeta, items: items };
  }

  function getWorker() {
    if (state.workerError) return Promise.reject(state.workerError);
    if (state.workerReady) return Promise.resolve(state.worker);
    $('ocrBadge').textContent = 'OCR engine: loading (offline)…';
    return Tesseract.createWorker('eng', 1, {
      workerPath: './vendor/worker.min.js',
      corePath: './vendor/core',
      langPath: './vendor/lang',
      gzip: true,
      workerBlobURL: false,
      logger: function () { /* never log PDF content */ }
    }).then(function (w) {
      state.worker = w; state.workerReady = true;
      $('ocrBadge').textContent = 'OCR engine: ready (offline)';
      $('ocrBadge').className = 'badge ok';
      return w;
    }).catch(function (e) {
      state.workerError = e;
      $('ocrBadge').textContent = 'OCR engine unavailable: ' + e.message;
      throw e;
    });
  }
  function ocrPage(page, worker) {
    var base = page.getViewport({ scale: 1 });
    var scale = Math.min(2, Math.max(1, 1750 / base.width));
    var viewport = page.getViewport({ scale: scale });
    var canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    return page.render({ canvasContext: ctx, viewport: viewport, background: '#ffffff' }).promise
      .then(function () { return worker.recognize(canvas); })
      .catch(function () { return worker.recognize(canvas.toDataURL('image/png')); })
      .then(function (res) {
        var text = (res && res.data && res.data.text) || '';
        return text.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      });
  }
  async function renderPdfPageToCanvas(pdf, pageNo, scale) {
    var page = await pdf.getPage(pageNo);
    var vp = page.getViewport({ scale: scale });
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(vp.width));
    cv.height = Math.max(1, Math.round(vp.height));
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise;
    return { canvas: cv, w: cv.width, h: cv.height };
  }

  function describeSecurityError(e) {
    var name = e && e.name ? e.name : '';
    var msg = e && e.message ? e.message : String(e);
    if (/password|encrypt|No password given/i.test(name + ' ' + msg)) {
      return 'password-protected / encrypted - skipped (this app never bypasses PDF security)';
    }
    return 'could not be opened: ' + msg;
  }

  async function scanOne(entry, useOcr, onPage) {
    var buf = await entry.getBytes();
    var bytes = new Uint8Array(buf);
    var copy = bytes.slice();
    var pdf = await pdfjsLib.getDocument({
      data: bytes,
      standardFontDataUrl: './vendor/standard_fonts/',
      disableRange: true, disableStream: true,
      isEvalSupported: false, useWorkerFetch: false
    }).promise;
    if (/password|encrypt/i.test((pdf && pdf._password ? 'password' : ''))) { /* handled by getDocument */ }

    var pages = [], pageMeta = {};
    for (var n = 1; n <= pdf.numPages; n++) {
      if (state.abort) break;
      onPage(n, pdf.numPages);
      var page = await pdf.getPage(n);
      var vp1 = page.getViewport({ scale: 1 });
      var H = vp1.height, W = vp1.width;
      var tc = await page.getTextContent();
      var ext = itemsToLines(tc, H);
      var lines = ext.lines, ocr = false, ocrFailed = false;

      if (lines.join('').replace(/\s/g, '').length < 60 && useOcr) {
        try {
          var w = await getWorker();
          var ocrLines = await ocrPage(page, w);
          lines = ocrLines;
          ocr = ocrLines.join('').length > 0;
        } catch (e) { ocrFailed = true; }
      }
      // Only a bottom-centred footer number is trusted as the printed page.
      var positional = ocr ? null : A.printedPageFromItems(ext.items, W, H);
      pages.push({
        pdfPage: n, lines: lines, text: lines.join('\n'), ocr: ocr, ocrFailed: ocrFailed,
        printedCandidate: positional, printedPositional: positional !== null,
        lineMeta: ocr ? null : ext.lineMeta,
        pageWidth: W, pageHeight: H
      });
      pageMeta[n] = { lineMeta: ocr ? null : ext.lineMeta, pageWidth: W, pageHeight: H };
    }
    state.docs[entry.name] = { pdf: pdf, bytes: copy, pageMeta: pageMeta };
    return { pages: pages, numPages: pdf.numPages };
  }

  /* ---- v3: index each MS PDF by year/session/component + question number ---- */
  async function loadMarkSchemes() {
    state.msDocs = {};
    var chosen = state.msEntries.filter(function (e) {
      return e.selected && A.isMarkSchemeName(e.name);
    });
    for (var i = 0; i < chosen.length; i++) {
      var entry = chosen[i];
      setStatus('Indexing mark scheme ' + entry.name + ' … (' + (i + 1) + '/' + chosen.length + ')');
      try {
        var buf = await entry.getBytes();
        var bytes = new Uint8Array(buf);
        var pdf = await pdfjsLib.getDocument({
          data: bytes,
          standardFontDataUrl: './vendor/standard_fonts/',
          disableRange: true, disableStream: true,
          isEvalSupported: false, useWorkerFetch: false
        }).promise;
        var pages = [], pageMeta = {};
        for (var n = 1; n <= pdf.numPages; n++) {
          var page = await pdf.getPage(n);
          var vp1 = page.getViewport({ scale: 1 });
          var tc = await page.getTextContent();
          var ext = itemsToLines(tc, vp1.height);
          pages.push({
            pdfPage: n, lines: ext.lines, lineMeta: ext.lineMeta,
            pageWidth: vp1.width, pageHeight: vp1.height
          });
          pageMeta[n] = { lineMeta: ext.lineMeta, pageWidth: vp1.width, pageHeight: vp1.height };
        }
        state.msDocs[entry.name] = {
          pdf: pdf, pageMeta: pageMeta, pageCount: pdf.numPages,
          parsed: A.parseFilename(entry.name),
          index: A.indexMarkSchemePages(pages)
        };
      } catch (e) {
        state.errors.push(entry.name + ' (MS): ' + describeSecurityError(e) + ' - no MS pages for its questions.');
      }
    }
  }
  function msDocForHit(h) {
    var qp = { syllabus: h.syllabus, seriesCode: h.seriesCode, component: h.component };
    var names = Object.keys(state.msDocs);
    for (var i = 0; i < names.length; i++) {
      var d = state.msDocs[names[i]];
      if (A.matchesQuestionPaper(qp, d.parsed)) return { name: names[i], doc: d };
    }
    return null;
  }
  function attachMarkSchemes() {
    state.hits.forEach(function (h) {
      var m = msDocForHit(h);
      h.msAvailable = !!m;
      h.msFilename = m ? m.name : null;
      h.msPages = [1];
      h.msCropHint = null;
      h.msUncertain = true;
      h.msLabel = '—';
      if (!m) { h.msStatus = 'No matching MS PDF in the MS folder'; return; }
      var found = A.markSchemePagesForQuestion(m.doc.index, h.question);
      if (!found || !found.pages.length) {
        h.msStatus = 'Q' + h.questionLabel + ' not found in MS - align its page manually';
        h.msLabel = 'page ? (align)';
        return;
      }
      h.msPages = found.pages.slice();
      h.msLabel = h.msPages.length > 1
        ? h.msPages[0] + '–' + h.msPages[h.msPages.length - 1]
        : String(h.msPages[0]);
      h.msUncertain = false;
      h.msStatus = '';
      var e = found.entries[0];
      h.msCropHint = { startLine: e.startLine, endLine: e.endLine };
    });
  }

  async function runScan() {
    if (state.scanning) return;
    var selected = state.entries.filter(function (e) { return e.selected; });
    if (!selected.length) { setStatus('Select at least one PDF first.'); return; }
    state.abort = false; state.scanning = true;
    state.hits = []; state.errors = []; state.docs = {}; state.msDocs = {};
    state.captures = {}; state.msCaptures = {};
    state.cropRects = {}; state.msCropRects = {};
    invalidateCompiled();
    $('btnScan').disabled = true; $('btnStop').disabled = false;
    setProgress(0);
    var useOcr = $('useOcr').checked;
    var done = 0;
    // The MS folder is read independently; only its pages are used for MS captures.
    try { await loadMarkSchemes(); } catch (e) {
      state.errors.push('MS folder: ' + e.message + ' - question-paper scan continues.');
    }
    for (var i = 0; i < selected.length; i++) {
      if (state.abort) break;
      var entry = selected[i];
      setStatus('Scanning ' + entry.name + ' … (' + (done + 1) + '/' + selected.length + ')');
      try {
        var res = await scanOne(entry, useOcr, function (pageNo, total) {
          setProgress((done / selected.length) + (1 / selected.length) * (pageNo / Math.max(1, total)) * 0.95);
        });
        var analysis = A.analyzeDocument(res.pages, { filename: entry.name });
        analysis.hits.forEach(function (h) { state.hits.push(h); attachMarkSchemes(); });
        var noText = res.pages.filter(function (p) { return p.lines.length === 0; }).length;
        if (noText) state.errors.push(entry.name + ': ' + noText + ' page(s) had no extractable text' +
          (useOcr ? ' and OCR did not produce text' : ' (OCR was off)') + ' - review those pages manually.');
        renderResults();
      } catch (e) { state.errors.push(entry.name + ': ' + describeSecurityError(e)); }
      done += 1;
      setProgress(done / selected.length);
    }
    state.scanning = false;
    $('btnScan').disabled = false; $('btnStop').disabled = true;
    setProgress(1);
    renderResults();
    var msg = (state.abort ? 'Stopped. ' : 'Finished. ') +
      state.hits.filter(function (h) { return h.bucket !== 'excluded'; }).length +
      ' candidate match(es) across ' + done + ' QP PDF(s) and ' +
      Object.keys(state.msDocs).length + ' indexed MS PDF(s).';
    if (state.errors.length) msg += ' ' + state.errors.length + ' file/page warning(s) - see below.';
    setStatus(msg);
    showScanErrors(state.errors);
  }
  function showScanErrors(errors) {
    var old = $('scanErrors'); if (old) old.remove();
    if (!errors.length) return;
    var pre = el('pre', 'hint small');
    pre.id = 'scanErrors';
    pre.textContent = 'Notes / limitations:\n' + errors.map(function (x) { return '• ' + x; }).join('\n');
    $('scanCard').appendChild(pre);
  }

  /* ------------------------------------------------------------------ *
   * Results table
   * ------------------------------------------------------------------ */
  function captureState(h) {
    var c = state.captures[h.id] || {};
    var done = h.pages.filter(function (p) { return !!c[p]; }).length;
    return { done: done, total: h.pages.length, all: done === h.pages.length && done > 0 };
  }
  function msCaptureState(h) {
    var c = state.msCaptures[h.id] || {};
    var pages = h.msAvailable ? (h.msPages || [1]) : [];
    var done = pages.filter(function (p) { return !!c[p]; }).length;
    return { done: done, total: pages.length, all: done === pages.length && done > 0 };
  }
  function msCaptureComplete(h) { return !h.msAvailable || msCaptureState(h).all; }
  function captureComplete(h) { return captureState(h).all && msCaptureComplete(h); }
  function liveHits() { return state.hits.filter(function (h) { return h.bucket !== 'excluded'; }); }
  function pendingHits() {
    return liveHits().filter(function (h) { return h.uncertain && (state.reviews[h.id] || 'unreviewed') === 'unreviewed'; });
  }
  function confirmedHits() {
    return liveHits().filter(function (h) { return state.reviews[h.id] === 'relevant'; })
      .sort(function (a, b) {
        return a.filename.localeCompare(b.filename) || a.pages[0] - b.pages[0] || (a.question || 0) - (b.question || 0);
      });
  }
  function termsCell(hit) {
    var wrap = el('div', 'terms');
    (hit.terms || []).slice(0, 8).forEach(function (t) { wrap.appendChild(el('span', 'term', t)); });
    if ((hit.terms || []).length > 8) wrap.appendChild(el('span', 'term', '+' + (hit.terms.length - 8) + ' more'));
    return wrap;
  }
  function statusCell(hit) {
    var cell = el('td');
    cell.appendChild(el('div', 'conf ' + hit.confidence, hit.bucket === 'excluded' ? 'Excluded' : (hit.confidence + ' confidence')));
    if (hit.uncertainReasons && hit.uncertainReasons.length) {
      var box = el('div', 'uncertain-box');
      box.appendChild(el('strong', null, hit.bucket === 'excluded' ? 'Why excluded: ' : '⚠ Uncertain - review: '));
      box.appendChild(document.createTextNode(hit.uncertainReasons.join(' · ')));
      cell.appendChild(box);
    }
    if (hit.bucket !== 'excluded') {
      var cap = captureState(hit), msCap = msCaptureState(hit);
      var capTag = el('div', 'capture-line');
      if (state.reviews[hit.id] === 'relevant') {
        capTag.appendChild(el('span', 'tag ' + (cap.all ? 'cap-ok' : 'cap-missing'),
          cap.all ? '✓ QP ' + cap.done + '/' + cap.total + ' captured' : '⚠ QP ' + cap.done + '/' + cap.total + ' captured'));
        if (hit.msAvailable) {
          capTag.appendChild(el('span', 'tag ' + (msCap.all ? 'cap-ok' : 'cap-missing'),
            msCap.all ? '✓ MS ' + msCap.done + '/' + msCap.total + ' captured'
                      : '⚠ MS ' + msCap.done + '/' + msCap.total + ' captured'));
        } else {
          capTag.appendChild(el('span', 'tag', 'No matching MS PDF'));
        }
      } else {
        capTag.appendChild(el('span', 'tag', cap.done ? cap.done + ' capture(s) (not confirmed)' : 'No capture'));
      }
      cell.appendChild(capTag);
      var btns = el('div', 'reviewbtns');
      var b1 = el('button', state.reviews[hit.id] === 'relevant' ? 'active' : '', '✓ Relevant');
      var b2 = el('button', state.reviews[hit.id] === 'notrelevant' ? 'active no' : '', '✕ Not relevant');
      b1.addEventListener('click', function () { setReview(hit, 'relevant'); });
      b2.addEventListener('click', function () { setReview(hit, 'notrelevant'); });
      btns.appendChild(b1); btns.appendChild(b2);
      cell.appendChild(btns);
    }
    return cell;
  }
  function setReview(hit, value) {
    if (state.reviews[hit.id] === value) delete state.reviews[hit.id];
    else state.reviews[hit.id] = value;
    hit.review = state.reviews[hit.id] || 'unreviewed';
    saveReviews();
    invalidateCompiled();
    renderResults();
    // Confirmed -> render its capture automatically, then let the user align it.
    if (hit.review === 'relevant') openCropEditor(hit, 'qp');
  }
  function actionsCell(hit) {
    var cell = el('td');
    var wrap = el('div', 'actions');
    var openBtn = el('button', null, 'Open at page ' + hit.pages[0] + ' (in-app)');
    openBtn.addEventListener('click', function () { openViewer(hit); });
    wrap.appendChild(openBtn);

    var link = el('a', null, 'Open PDF at page ' + hit.pages[0] + ' ↗');
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    link.href = '#';
    link.addEventListener('click', function (ev) {
      ev.preventDefault();
      var entry = findEntry(hit.filename);
      ensureBlobUrl(entry).then(function (u) {
        if (u) window.open(u + '#page=' + hit.pages[0], '_blank', 'noopener');
      });
    });
    wrap.appendChild(link);

    if (hit.bucket !== 'excluded') {
      var capBtn = el('button', null, 'Capture / align QP');
      capBtn.addEventListener('click', function () { openCropEditor(hit, 'qp'); });
      wrap.appendChild(capBtn);
      if (hit.msAvailable) {
        var msBtn = el('button', null, 'Capture / align MS');
        msBtn.addEventListener('click', function () { openCropEditor(hit, 'ms'); });
        wrap.appendChild(msBtn);
        var msOpen = el('a', null, 'Open MS at page ' + (hit.msPages[0] || 1) + ' ↗');
        msOpen.setAttribute('target', '_blank');
        msOpen.setAttribute('rel', 'noopener noreferrer');
        msOpen.href = '#';
        msOpen.addEventListener('click', function (ev) {
          ev.preventDefault();
          var d = state.msDocs[hit.msFilename];
          if (!d) return;
          var mentry = null;
          for (var i = 0; i < state.msEntries.length; i++) {
            if (state.msEntries[i].name === hit.msFilename) { mentry = state.msEntries[i]; break; }
          }
          ensureBlobUrl(mentry).then(function (u) {
            if (u) window.open(u + '#page=' + (hit.msPages[0] || 1), '_blank', 'noopener');
          });
        });
        wrap.appendChild(msOpen);
      }
    }
    cell.appendChild(wrap);
    return cell;
  }
  function renderResults() {
    var body = $('resultsBody');
    body.innerHTML = '';
    var showExcluded = $('showExcluded').checked;
    var filter = $('filter').value;
    var visible = state.hits.filter(function (h) {
      h.review = state.reviews[h.id] || 'unreviewed';
      if (h.bucket === 'excluded' && !showExcluded) return false;
      if (filter === 'review' && !h.uncertain) return false;
      if (filter === 'unreviewed' && h.review !== 'unreviewed') return false;
      if (filter === 'relevant' && h.review !== 'relevant') return false;
      if (filter === 'notrelevant' && h.review !== 'notrelevant') return false;
      return true;
    });
    $('resultCount').textContent = visible.length + ' row' + (visible.length === 1 ? '' : 's') + ' shown / ' +
      liveHits().length + ' matches';
    $('excludedCount').textContent = state.hits.filter(function (h) { return h.bucket === 'excluded'; }).length +
      ' electromagnetism-only excluded';
    $('emptyState').hidden = visible.length > 0;

    visible.forEach(function (hit) {
      var tr = el('tr', hit.bucket === 'excluded' ? 'excluded-row' : '');
      tr.dataset.hitId = hit.id;
      tr.appendChild(el('td', 'fname', hit.filename));
      tr.appendChild(el('td', null, hit.componentLabel));
      tr.appendChild(el('td', null, 'Q' + hit.questionLabel));
      tr.appendChild(el('td', 'page-num', hit.pageLabel));
      var printed = el('td', 'printed-num', hit.printedLabel || '—');
      if (hit.printedLabel) printed.title = 'Detected from the bottom-centred footer' +
        (hit.printedPositional ? ' (position verified)' : ' (text fallback)');
      tr.appendChild(printed);
      var msCell = el('td', hit.msAvailable ? 'ms-pages' : 'ms-missing',
        hit.msAvailable ? hit.msLabel : '—');
      if (hit.msAvailable) {
        msCell.title = hit.msFilename + ' · PDF page ' + hit.msLabel +
          (hit.msStatus ? ' · ' + hit.msStatus : '');
      } else {
        msCell.title = 'No MS PDF in the MS folder matches this year / session / component.';
      }
      tr.appendChild(msCell);
      var tc = el('td'); tc.appendChild(termsCell(hit)); tr.appendChild(tc);
      tr.appendChild(statusCell(hit));
      tr.appendChild(actionsCell(hit));
      body.appendChild(tr);
    });
    updateCompilePanel();
  }

  /* ------------------------------------------------------------------ *
   * Built-in viewer (source PDF, or the compiled A4 preview)
   * ------------------------------------------------------------------ */
  function compiledPart(src) {
    return state.compiled ? state.compiled[src || state.previewSource] : null;
  }
  function activeViewerPdf() {
    if (state.viewerMode !== 'compiled') return state.viewer.pdf;
    var part = compiledPart();
    return part ? part.pdf : null;
  }
  async function renderViewerPage() {
    var pdf = activeViewerPdf();
    if (!pdf) return;
    $('viewerLoading').hidden = false;
    $('viewerPage').textContent = 'Page ' + state.viewer.page + ' of ' + state.viewer.numPages;
    try {
      var page = await pdf.getPage(state.viewer.page);
      var base = page.getViewport({ scale: 1 });
      var scale = Math.max(0.6, Math.min(1.7, 1500 / base.width));
      var vp = page.getViewport({ scale: scale });
      var cv = $('viewerCanvas');
      cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp, background: '#ffffff' }).promise;
    } catch (e) {
      $('viewerSub').textContent = 'Could not render this page: ' + e.message;
    } finally { $('viewerLoading').hidden = true; }
  }
  function openViewer(hit) {
    var doc = state.docs[hit.filename];
    if (!doc || !doc.pdf) { setStatus('The PDF for this result is no longer loaded. Re-scan to view it.'); return; }
    state.viewerMode = 'source';
    state.viewer.filename = hit.filename;
    state.viewer.pdf = doc.pdf;
    state.viewer.page = clamp(hit.pages[0], 1, doc.pdf.numPages);
    state.viewer.numPages = doc.pdf.numPages;
    $('approveBar').hidden = true;
    $('viewerTitle').textContent = hit.filename + '  ·  ' + hit.componentLabel + '  ·  Q' + hit.questionLabel;
    $('viewerSub').textContent = 'PDF pages ' + hit.pageLabel +
      (hit.printedLabel ? '  ·  printed page ' + hit.printedLabel : '') +
      '  ·  ' + (hit.uncertain ? 'uncertain match - please review' : 'basic-magnetism match');
    $('viewerNote').textContent = 'Read-only view. Your original PDF is never modified.';
    $('viewer').hidden = false;
    renderViewerPage();
  }
  function closeViewer() {
    $('viewer').hidden = true;
    $('approveBar').hidden = true;
    state.viewerMode = 'source';
    var cv = $('viewerCanvas');
    cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  }
  function openCompiledPreview() {
    var part = compiledPart(state.previewSource);
    if (!part || !part.pdf) {
      state.previewSource = 'qp';
      part = compiledPart('qp');
    }
    if (!part || !part.pdf) return;
    state.viewerMode = 'compiled';
    state.viewer.pdf = part.pdf;
    state.viewer.page = 1;
    state.viewer.numPages = part.pdf.numPages;
    $('previewSource').value = state.previewSource;
    $('previewSource').disabled = !compiledPart('ms');
    $('btnApproveMsDownload').disabled = !compiledPart('ms');
    $('approveBar').hidden = false;
    $('viewerTitle').textContent = state.previewSource === 'ms'
      ? 'A4 MARK SCHEME PDF preview' : 'A4 QUESTION PAPER PDF preview';
    $('viewerSub').textContent = part.sheetCount + ' A4 sheet(s) · ' +
      (part.blob.size / 1024 / 1024).toFixed(2) + ' MB · not downloaded yet';
    $('approveSub').textContent = 'Check every sheet with ‹ Previous / Next ›. QP and MS download as two separate files, only after you approve each.';
    $('viewerNote').textContent = 'Preview only — nothing downloads until you approve.';
    $('viewer').hidden = false;
    renderViewerPage();
  }
  function switchPreviewSource(src) {
    if (!state.compiled || !compiledPart(src)) return;
    state.previewSource = src;
    $('previewSource').value = src;
    openCompiledPreview();
  }
  function printPreview() {
    if (state.viewerMode !== 'compiled') return;
    var part = compiledPart();
    if (!part) return;
    var url = URL.createObjectURL(part.blob);
    state.objectUrls.push(url);
    window.open(url, '_blank', 'noopener');
    $('compileStatus').textContent = 'Opened the ' + (state.previewSource === 'ms' ? 'MS' : 'QP') +
      ' A4 PDF in a new tab for printing. Nothing was downloaded or uploaded.';
  }

  /* ------------------------------------------------------------------ *
   * v2: crop / alignment editor
   * ------------------------------------------------------------------ */
  function currentRect() { return state.crop.rects[state.crop.page] || { l: 0.02, t: 0.02, r: 0.98, b: 0.98 }; }
  function storeRect(r) { state.crop.rects[state.crop.page] = r; }
  function normaliseRect(r) {
    var l = clamp(Math.min(r.l, r.r), 0, 0.99), rr = clamp(Math.max(r.l, r.r), 0.01, 1);
    var t = clamp(Math.min(r.t, r.b), 0, 0.99), b = clamp(Math.max(r.t, r.b), 0.01, 1);
    if (rr - l < 0.02) rr = Math.min(1, l + 0.02);
    if (b - t < 0.02) b = Math.min(1, t + 0.02);
    return { l: l, t: t, r: rr, b: b };
  }
  function syncRectUI() {
    var r = normaliseRect(currentRect());
    storeRect(r);
    $('cropRect').style.left = (r.l * 100) + '%';
    $('cropRect').style.top = (r.t * 100) + '%';
    $('cropRect').style.width = ((r.r - r.l) * 100) + '%';
    $('cropRect').style.height = ((r.b - r.t) * 100) + '%';
    $('cropL').value = Math.round(r.l * 100);
    $('cropT').value = Math.round(r.t * 100);
    $('cropR').value = Math.round(r.r * 100);
    $('cropB').value = Math.round(r.b * 100);
    $('cropHintText').textContent = 'Selected: ' + Math.round((r.r - r.l) * 100) + '% wide × ' +
      Math.round((r.b - r.t) * 100) + '% tall of PDF page ' + state.crop.page + '.';
  }
  function cropStore(source) { return source === 'ms' ? state.msCropRects : state.cropRects; }
  function cropDoc(hit, source) {
    return source === 'ms' ? state.msDocs[hit.msFilename] : state.docs[hit.filename];
  }
  function cropPages(hit, source) {
    return source === 'ms' ? (hit.msPages || [1]).slice() : hit.pages.slice();
  }
  function defaultRect(hit, source, pageNo, pagesList) {
    var store = cropStore(source);
    var saved = store[hit.id] && store[hit.id][pageNo];
    if (saved) return Object.assign({}, saved);
    var full = { l: 0.02, t: 0.02, r: 0.98, b: 0.98 };
    var hint = source === 'ms' ? hit.msCropHint : hit.cropHint;
    if (!hint || pagesList.indexOf(pageNo) !== 0) return full;
    var doc = cropDoc(hit, source);
    var pm = doc && doc.pageMeta && doc.pageMeta[pageNo];
    if (!pm || !pm.lineMeta) return full;
    var from = Math.max(0, hit.cropHint.startLine - 1);
    var to = Math.min(pm.lineMeta.length - 1, hit.cropHint.endLine + 1);
    var ls = pm.lineMeta.slice(from, to + 1).filter(Boolean);
    if (!ls.length) return full;
    var minX = Math.min.apply(null, ls.map(function (l) { return l.x; }));
    var maxX = Math.max.apply(null, ls.map(function (l) { return l.x + l.w; }));
    var minY = Math.min.apply(null, ls.map(function (l) { return l.yBottom; }));
    var maxY = Math.max.apply(null, ls.map(function (l) { return l.yBottom; }));
    var r = normaliseRect({
      l: (minX - 22) / pm.pageWidth,
      r: (maxX + 22) / pm.pageWidth,
      t: 1 - (maxY + 26) / pm.pageHeight,
      b: 1 - (minY - 22) / pm.pageHeight
    });
    return (r.r - r.l > 0.25 && r.b - r.t > 0.06) ? r : full;
  }
  async function openCropEditor(hit, source) {
    if (state.crop) return;
    source = source === 'ms' ? 'ms' : 'qp';
    if (source === 'ms' && (!hit.msAvailable || !state.msDocs[hit.msFilename])) {
      setStatus('No matching MS PDF is loaded for ' + hit.filename + '. Add it to the MS folder and re-scan.');
      return;
    }
    var doc = cropDoc(hit, source);
    if (!doc || !doc.pdf) {
      setStatus('Re-scan the ' + (source === 'ms' ? 'MS' : 'QP') + ' PDFs in this tab to enable captures.');
      return;
    }
    var pagesList = cropPages(hit, source);
    state.crop = {
      hit: hit, source: source, pages: pagesList, page: pagesList[0],
      rects: {}, images: {}, displayW: 690, drag: null
    };
    pagesList.forEach(function (p) { state.crop.rects[p] = defaultRect(hit, source, p, pagesList); });
    var srcName = source === 'ms' ? hit.msFilename : hit.filename;
    $('cropTitle').textContent = (source === 'ms' ? 'MARK SCHEME · ' : 'QUESTION PAPER · ') +
      srcName + ' · Q' + hit.questionLabel;
    $('cropSourceBadge').textContent = source === 'ms' ? 'MS' : 'QP';
    $('cropSourceBadge').className = source === 'ms' ? 'badge msbadge' : 'badge ok';
    $('cropSub').textContent = 'Rendering ' + pagesList.length + ' page(s)…';
    $('cropPageSelect').innerHTML = pagesList.map(function (p) {
      return '<option value="' + p + '">PDF page ' + p + '</option>';
    }).join('');
    $('cropPageSelect').value = String(pagesList[0]);
    populateMsPageTools(hit, source, doc, pagesList);
    $('cropModal').hidden = false;
    var session = state.crop;
    try {
      for (var i = 0; i < pagesList.length; i++) {
        var p = pagesList[i];
        $('cropSub').textContent = 'Rendering ' + (source === 'ms' ? 'MS' : 'QP') +
          ' PDF page ' + p + ' of ' + pagesList[pagesList.length - 1] + '…';
        var pm = doc.pageMeta[p];
        var scale = Math.min(2.4, 1900 / ((pm && pm.pageWidth) || 595));
        var rendered = await renderPdfPageToCanvas(doc.pdf, p, scale);
        // A manual MS page change can re-open the editor while this render was
        // in flight. Never write into the newer editor's state.
        if (state.crop !== session) return;
        session.images[p] = rendered;
      }
    } catch (e) {
      if (state.crop !== session) return;
      $('cropSub').textContent = 'Could not render this page: ' + e.message;
      return;
    }
    if (state.crop !== session) return;
    $('cropSub').textContent = (source === 'ms'
      ? 'Pick the exact MS PDF page above, then align its crop. Drag the box, drag a corner handle, or type percentages.'
      : 'Drag the box, drag a corner handle, or type percentages. Then save the capture(s).');
    renderCropPage();
  }

  /* v3.1: the user can MANUALLY align which MS PDF page is captured. Every page
   * of the matched MS document is offered, not just the auto-detected page(s). */
  function populateMsPageTools(hit, source, doc, pagesList) {
    var box = $('msPageTools');
    if (source !== 'ms') { box.hidden = true; return; }
    box.hidden = false;
    var total = (doc.pdf && doc.pdf.numPages) || doc.pageCount || 1;
    var detected = (pagesList || []).slice();
    var opts = [];
    for (var n = 1; n <= total; n++) {
      opts.push('<option value="' + n + '">PDF page ' + n +
        (detected.indexOf(n) !== -1 ? ' (auto-detected)' : '') + '</option>');
    }
    $('msPageSelect').innerHTML = opts.join('');
    $('msPageSelect').value = String(pagesList[0]);
    $('msPageNote').textContent = hit.msFilename + ' has ' + total + ' physical page(s). ' +
      'Auto-detected: ' + (hit.msLabel || '—') + '. Pick any page, then "Use this page (manual)" ' +
      'replaces the current MS page(s), or "+ Add this page" keeps both in order.';
  }
  function applyMsPages(hit, pages, note) {
    hit.msPages = pages.slice();
    hit.msLabel = pages.length > 1 ? pages[0] + '–' + pages[pages.length - 1] : String(pages[0]);
    hit.msCropHint = null;
    hit.msUncertain = false;
    hit.msStatus = '';
    delete state.msCaptures[hit.id];
    delete state.msCropRects[hit.id];
    invalidateCompiled();
    closeCropEditor();
    renderResults();
    setStatus('MS page aligned manually: ' + hit.msFilename + ' · Q' + hit.questionLabel +
      ' · PDF page ' + hit.msLabel + (note ? ' (' + note + ')' : '') + '.');
    openCropEditor(hit, 'ms');
  }
  function setMsPage() {
    var c = state.crop;
    if (!c || c.source !== 'ms') return;
    var hit = c.hit, doc = state.msDocs[hit.msFilename];
    var total = (doc && doc.pdf && doc.pdf.numPages) || 1;
    var n = clamp(Math.round(parseInt($('msPageSelect').value, 10) || 1), 1, total);
    applyMsPages(hit, [n], 'manual page override');
  }
  function addMsPage() {
    var c = state.crop;
    if (!c || c.source !== 'ms') return;
    var hit = c.hit, doc = state.msDocs[hit.msFilename];
    var total = (doc && doc.pdf && doc.pdf.numPages) || 1;
    var n = clamp(Math.round(parseInt($('msPageSelect').value, 10) || 1), 1, total);
    var pages = (hit.msPages || [1]).slice();
    if (pages.indexOf(n) === -1) pages.push(n);
    pages.sort(function (a, b) { return a - b; });
    applyMsPages(hit, pages, 'extra MS page added');
  }
  function renderCropPage() {
    if (!state.crop) return;
    var img = state.crop.images[state.crop.page];
    if (!img) return;
    var dw = state.crop.displayW, dh = Math.round(dw * img.h / img.w);
    var stage = $('cropStage');
    stage.style.width = dw + 'px'; stage.style.height = dh + 'px';
    var cv = $('cropCanvas');
    cv.width = dw; cv.height = dh;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dw, dh);
    ctx.drawImage(img.canvas, 0, 0, dw, dh);
    $('cropPageInfo').textContent = 'Page ' + state.crop.page;
    syncRectUI();
  }
  function cropPointer(ev) {
    var box = $('cropStage').getBoundingClientRect();
    return {
      x: clamp((ev.clientX - box.left) / (box.width || 1), 0, 1),
      y: clamp((ev.clientY - box.top) / (box.height || 1), 0, 1)
    };
  }
  function onCropDown(ev) {
    if (!state.crop || !state.crop.images[state.crop.page]) return;
    ev.preventDefault();
    var pos = cropPointer(ev);
    var r = Object.assign({}, currentRect());
    var handle = ev.target && ev.target.dataset ? ev.target.dataset.h : null;
    var mode;
    if (handle) mode = 'resize:' + handle;
    else if (pos.x >= r.l && pos.x <= r.r && pos.y >= r.t && pos.y <= r.b) mode = 'move';
    else { mode = 'new'; r.l = pos.x; r.t = pos.y; r.r = Math.min(1, pos.x + 0.02); r.b = Math.min(1, pos.y + 0.02); }
    state.crop.drag = { mode: mode, start: pos, orig: r };
    storeRect(normaliseRect(r)); syncRectUI();
  }
  function onCropMove(ev) {
    var c = state.crop, d = c && c.drag;
    if (!d) return;
    var pos = cropPointer(ev), o = d.orig, r;
    if (d.mode === 'move') {
      var dx = clamp(pos.x - d.start.x, -o.l, 1 - o.r);
      var dy = clamp(pos.y - d.start.y, -o.t, 1 - o.b);
      r = { l: o.l + dx, t: o.t + dy, r: o.r + dx, b: o.b + dy };
    } else if (d.mode === 'new') {
      r = { l: o.l, t: o.t, r: pos.x, b: pos.y };
    } else {
      var h = d.mode.split(':')[1];
      r = Object.assign({}, o);
      if (h.indexOf('w') !== -1) r.l = pos.x;
      if (h.indexOf('e') !== -1) r.r = pos.x;
      if (h.indexOf('n') !== -1) r.t = pos.y;
      if (h.indexOf('s') !== -1) r.b = pos.y;
    }
    storeRect(normaliseRect(r)); syncRectUI();
  }
  function onCropUp() { if (state.crop) state.crop.drag = null; }
  function onCropInputs() {
    if (!state.crop) return;
    function num(elem, dflt) { var v = parseFloat(elem.value); return isNaN(v) ? dflt : clamp(v, 0, 100) / 100; }
    storeRect(normaliseRect({
      l: num($('cropL'), 2), t: num($('cropT'), 2),
      r: num($('cropR'), 98), b: num($('cropB'), 98)
    }));
    syncRectUI();
  }
  function makeCapture(img, r) {
    var sx = Math.max(0, Math.floor(r.l * img.w));
    var sy = Math.max(0, Math.floor(r.t * img.h));
    var sw = Math.max(1, Math.min(img.w - sx, Math.floor((r.r - r.l) * img.w)));
    var sh = Math.max(1, Math.min(img.h - sy, Math.floor((r.b - r.t) * img.h)));
    var cv = document.createElement('canvas');
    cv.width = sw; cv.height = sh;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(img.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return { dataUrl: cv.toDataURL('image/png'), w: sw, h: sh };
  }
  function saveCrops() {
    if (!state.crop) return;
    var c = state.crop, hit = c.hit, source = c.source;
    if (c.pages.some(function (p) { return !c.images[p]; })) {
      $('cropSub').textContent = 'Still rendering; please wait.'; return;
    }
    var caps = {}, saved = {};
    c.pages.forEach(function (p) {
      var r = normaliseRect(c.rects[p]);
      caps[p] = makeCapture(c.images[p], r);
      saved[p] = Object.assign({}, r);
    });
    (source === 'ms' ? state.msCaptures : state.captures)[hit.id] = caps;
    cropStore(source)[hit.id] = saved;
    invalidateCompiled();
    closeCropEditor();
    var label = (source === 'ms' ? 'MS ' + hit.msFilename : 'QP ' + hit.filename);
    setStatus('Capture saved: ' + label + ' · Q' + hit.questionLabel + ' · PDF page ' +
      (source === 'ms' ? (hit.msLabel || '1') : hit.pageLabel) + '.');
    renderResults();
    // Same editor, same manual adjustment, for the matched MS page(s).
    if (source === 'qp' && hit.msAvailable && state.reviews[hit.id] === 'relevant' &&
        !msCaptureComplete(hit)) {
      openCropEditor(hit, 'ms');
    }
  }
  function closeCropEditor() {
    state.crop = null;
    $('cropModal').hidden = true;
  }

  /* ------------------------------------------------------------------ *
   * v2: A4 PDF compilation, preview, approval, download
   * ------------------------------------------------------------------ */
  function invalidateCompiled() {
    state.compiled = null;
    ['btnDownloadApproved', 'btnDownloadMsApproved'].forEach(function (id) {
      $(id).hidden = true; $(id).disabled = true;
    });
    $('btnApproveMsDownload').disabled = true;
  }
  function updateCompilePanel() {
    var conf = confirmedHits();
    var pend = pendingHits();
    var cap = conf.filter(captureComplete);
    var qpSheets = cap.reduce(function (n, h) { return n + h.pages.length; }, 0);
    var msSheets = cap.reduce(function (n, h) {
      return n + (h.msAvailable ? (h.msPages || [1]).length : 0);
    }, 0);
    var sheets = qpSheets + msSheets;
    $('cntConfirmed').textContent = conf.length;
    $('cntCaptured').textContent = cap.length;
    $('cntPending').textContent = pend.length;
    $('cntSheets').textContent = qpSheets + ' + ' + msSheets;
    $('cntCaptured').className = 'cnum ' + (conf.length && cap.length === conf.length ? 'ready' : '');
    $('cntPending').className = 'cnum ' + (pend.length ? 'pending' : 'ready');
    var ready = conf.length > 0 && pend.length === 0 && cap.length === conf.length;
    $('btnBuild').disabled = !ready;
    $('btnMarkRest').disabled = pend.length === 0;
    $('btnDownloadApproved').hidden = !(state.compiled && state.compiled.qp.approved);
    $('btnDownloadApproved').disabled = !(state.compiled && state.compiled.qp.approved);
    $('btnDownloadMsApproved').hidden = !(state.compiled && state.compiled.ms && state.compiled.ms.approved);
    $('btnDownloadMsApproved').disabled = !(state.compiled && state.compiled.ms && state.compiled.ms.approved);
    var msg;
    if (!state.hits.length) msg = 'Scan some PDFs and confirm a question to begin.';
    else if (state.compiled) {
      msg = 'Preview ready: ' + state.compiled.qp.sheetCount + ' QP A4 sheet(s)' +
        (state.compiled.ms ? ' + ' + state.compiled.ms.sheetCount + ' MS A4 sheet(s)' : '') +
        '. Review both in the viewer, then approve each download.';
    }
    else if (!conf.length) msg = 'Mark at least one question ✓ Relevant. Its QP and MS captures are rendered automatically.';
    else if (pend.length) msg = pend.length + ' question(s) still need to be checked before building.';
    else if (cap.length < conf.length) msg = (conf.length - cap.length) + ' confirmed question(s) are missing a QP or MS capture. Use "Capture / align" for that source.';
    else msg = 'Ready: ' + qpSheets + ' QP + ' + msSheets + ' MS A4 sheet(s) from ' + cap.length +
      ' confirmed question(s), in the same order. Press "Build A4 PDFs (preview)".';
    $('compileStatus').textContent = msg;
  }
  // Build ONE A4 PDF from one kind of capture. Called twice: once for QP, once
  // for MS. The two results are never merged into a single file.
  async function makeA4Pdf(store, hits, pagesOf, kind) {
    var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    var PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    var M = 20, foot = $('includeFooter').checked;
    var sheets = 0;
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i], pages = pagesOf(h);
      for (var j = 0; j < pages.length; j++) {
        var pg = pages[j], capd = store[h.id] && store[h.id][pg];
        if (!capd) continue;
        if (sheets > 0) doc.addPage();
        var availW = PW - 2 * M, availH = PH - 2 * M - (foot ? 18 : 0);
        var sc = Math.min(availW / capd.w, availH / capd.h);
        var w = capd.w * sc, hh = capd.h * sc;
        doc.addImage(capd.dataUrl, 'PNG', (PW - w) / 2, M + (availH - hh) / 2, w, hh, undefined, 'FAST');
        if (foot) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100);
          doc.text((kind === 'ms' ? h.msFilename : h.filename) + '  |  Q' + h.questionLabel +
                   '  |  ' + (kind === 'ms' ? 'MS' : 'QP') + ' PDF page ' + pg, M, PH - 10);
        }
        sheets++;
      }
    }
    if (!sheets) throw new Error('No ' + kind.toUpperCase() + ' captures were available.');
    var blob = doc.output('blob');
    var bytes = new Uint8Array(await blob.arrayBuffer());
    var pdf = await pdfjsLib.getDocument({
      data: bytes.slice(),
      standardFontDataUrl: './vendor/standard_fonts/',
      disableRange: true, disableStream: true,
      isEvalSupported: false, useWorkerFetch: false
    }).promise;
    return {
      blob: blob, pdf: pdf, pageCount: pdf.numPages, sheetCount: sheets,
      approved: false,
      filename: (kind === 'ms' ? 'MS-Magnetism-A4.pdf' : 'QP-Magnetism-A4.pdf')
    };
  }
  async function buildA4Pdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) { setStatus('jsPDF is missing from the offline bundle.'); return; }
    var hits = confirmedHits().filter(captureComplete);
    if (!hits.length) return;
    $('btnBuild').disabled = true;
    $('compileStatus').textContent = 'Building the QP and MS A4 PDFs locally…';
    try {
      // Both lists use the SAME confirmed-hit order, so the MS PDF follows the
      // exact order in which the questions were selected.
      var qpPart = await makeA4Pdf(state.captures, hits, function (h) { return h.pages; }, 'qp');
      var msHits = hits.filter(function (h) { return h.msAvailable && msCaptureComplete(h); });
      var msPart = msHits.length
        ? await makeA4Pdf(state.msCaptures, msHits, function (h) { return h.msPages || [1]; }, 'ms')
        : null;
      state.compiled = { qp: qpPart, ms: msPart };
      state.previewSource = 'qp';
      updateCompilePanel();
      openCompiledPreview();
    } catch (e) {
      $('compileStatus').textContent = 'Could not build the A4 PDFs: ' + e.message;
      invalidateCompiled();
      updateCompilePanel();
    }
  }
  function downloadCompiled(src) {
    var part = compiledPart(src);
    if (!part) return;
    var url = URL.createObjectURL(part.blob);
    var a = document.createElement('a');
    a.href = url; a.download = part.filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
    return part.filename;
  }
  function approveAndDownload(src) {
    var part = compiledPart(src);
    if (!part) return;
    part.approved = true;
    var name = downloadCompiled(src);
    $('compileStatus').textContent = 'Approved. Downloaded ' + name + ' (' + part.pageCount +
      ' A4 sheet(s)). QP and MS are separate PDFs.';
    updateCompilePanel();
  }

  /* ------------------------------------------------------------------ *
   * Wiring
   * ------------------------------------------------------------------ */
  function init() {
    if (pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
    else setStatus('ERROR: pdf.js did not load. Check that the vendor folder is complete.');
    if (!state.serverMode) {
      $('fileModeWarning').hidden = false;
      $('offlineBadge').textContent = '● Opened as local file';
      $('btnRefresh').disabled = true;
    }
    if (state.serverMode) {
      fetch('/api/config').then(function (r) { return r.json(); }).then(function (cfg) {
        state.config = cfg;
        $('folderPath').value = cfg.defaultDir;
        $('msFolderPath').value = cfg.defaultDir;
        refreshList();
        refreshMsList();
      }).catch(function () {
        $('folderStatus').textContent = 'Local server not reachable - use "Choose a different folder".';
        $('msFolderStatus').textContent = 'Local server not reachable - use "Choose a different MS folder".';
        refreshList();
        refreshMsList();
      });
    } else {
      $('folderStatus').textContent = 'Opened as a local file. Choose a folder to continue.';
      $('msFolderStatus').textContent = 'Opened as a local file. Choose an MS folder to continue.';
    }

    $('btnRefresh').addEventListener('click', refreshList);
    $('folderPath').addEventListener('keydown', function (e) { if (e.key === 'Enter') refreshList(); });
    $('btnParent').addEventListener('click', function () {
      if (state.config) { $('folderPath').value = state.config.parentDir; refreshList(); }
    });
    $('btnAppFolder').addEventListener('click', function () {
      if (state.config) { $('folderPath').value = state.config.appDir; refreshList(); }
    });
    $('recursive').addEventListener('change', refreshList);
    $('folderPicker').addEventListener('change', function (e) { useFolderPicker(e.target.files); });
    $('btnAll').addEventListener('click', function () {
      state.entries.forEach(function (e) { e.selected = true; }); renderFileList();
    });
    $('btnNone').addEventListener('click', function () {
      state.entries.forEach(function (e) { e.selected = false; }); renderFileList();
    });

    // SECOND, independent folder bar for mark schemes.
    $('btnMsRefresh').addEventListener('click', refreshMsList);
    $('msFolderPath').addEventListener('keydown', function (e) { if (e.key === 'Enter') refreshMsList(); });
    $('btnMsParent').addEventListener('click', function () {
      if (state.config) { $('msFolderPath').value = state.config.parentDir; refreshMsList(); }
    });
    $('btnMsAppFolder').addEventListener('click', function () {
      if (state.config) { $('msFolderPath').value = state.config.appDir; refreshMsList(); }
    });
    $('msRecursive').addEventListener('change', refreshMsList);
    $('msFolderPicker').addEventListener('change', function (e) { useMsFolderPicker(e.target.files); });
    $('btnMsAll').addEventListener('click', function () {
      state.msEntries.forEach(function (e) { e.selected = true; }); renderMsFileList();
    });
    $('btnMsNone').addEventListener('click', function () {
      state.msEntries.forEach(function (e) { e.selected = false; }); renderMsFileList();
    });

    $('btnScan').addEventListener('click', runScan);
    $('btnStop').addEventListener('click', function () { state.abort = true; setStatus('Stopping after the current page…'); });
    $('filter').addEventListener('change', renderResults);
    $('showExcluded').addEventListener('change', renderResults);

    // Viewer
    $('btnCloseViewer').addEventListener('click', closeViewer);
    $('btnBackToEdit').addEventListener('click', closeViewer);
    $('btnPrev').addEventListener('click', function () {
      if (state.viewer.page > 1) { state.viewer.page--; renderViewerPage(); }
    });
    $('btnNext').addEventListener('click', function () {
      if (state.viewer.page < state.viewer.numPages) { state.viewer.page++; renderViewerPage(); }
    });
    $('viewer').addEventListener('click', function (e) { if (e.target === $('viewer')) closeViewer(); });
    document.addEventListener('keydown', function (e) {
      if ($('viewer').hidden) return;
      if (e.key === 'Escape') closeViewer();
      if (e.key === 'ArrowLeft' && state.viewer.page > 1) { state.viewer.page--; renderViewerPage(); }
      if (e.key === 'ArrowRight' && state.viewer.page < state.viewer.numPages) { state.viewer.page++; renderViewerPage(); }
    });
    $('btnApproveDownload').addEventListener('click', function () { approveAndDownload('qp'); });
    $('btnApproveMsDownload').addEventListener('click', function () { approveAndDownload('ms'); });
    $('previewSource').addEventListener('change', function (e) { switchPreviewSource(e.target.value); });
    $('btnPrint').addEventListener('click', printPreview);

    // Compile panel
    $('btnBuild').addEventListener('click', buildA4Pdf);
    $('btnMarkRest').addEventListener('click', function () {
      pendingHits().forEach(function (h) { state.reviews[h.id] = 'notrelevant'; });
      saveReviews(); invalidateCompiled(); renderResults();
    });
    $('btnDownloadApproved').addEventListener('click', function () {
      if (state.compiled && state.compiled.qp.approved) downloadCompiled('qp');
    });
    $('btnDownloadMsApproved').addEventListener('click', function () {
      if (state.compiled && state.compiled.ms && state.compiled.ms.approved) downloadCompiled('ms');
    });

    // Crop editor
    $('cropPageSelect').addEventListener('change', function () {
      if (!state.crop) return;
      state.crop.page = parseInt($('cropPageSelect').value, 10);
      renderCropPage();
    });
    // v3.1: manual MS page alignment. Choosing a page in the dropdown does NOT
    // change anything by itself; the two explicit buttons do, so "add" can pick a
    // page different from the one currently captured.
    $('btnMsUsePage').addEventListener('click', setMsPage);
    $('btnMsAddPage').addEventListener('click', addMsPage);
    $('btnAutoCrop').addEventListener('click', function () {
      if (!state.crop) return;
      state.crop.rects[state.crop.page] = defaultRect(
        state.crop.hit, state.crop.source, state.crop.page, state.crop.pages);
      syncRectUI();
    });
    $('btnFullPage').addEventListener('click', function () {
      if (!state.crop) return;
      state.crop.rects[state.crop.page] = { l: 0, t: 0, r: 1, b: 1 };
      syncRectUI();
    });
    $('btnSaveCrops').addEventListener('click', saveCrops);
    $('btnUseFullPage').addEventListener('click', function () {
      if (!state.crop) return;
      state.crop.pages.forEach(function (p) { state.crop.rects[p] = { l: 0, t: 0, r: 1, b: 1 }; });
      saveCrops();
    });
    $('btnCancelCrop').addEventListener('click', closeCropEditor);
    $('btnCancelCropTop').addEventListener('click', closeCropEditor);
    ['cropL', 'cropT', 'cropR', 'cropB'].forEach(function (id) {
      $(id).addEventListener('change', onCropInputs);
    });
    $('cropStage').addEventListener('pointerdown', onCropDown);
    window.addEventListener('pointermove', onCropMove);
    window.addEventListener('pointerup', onCropUp);

    renderFileList();
    renderMsFileList();
    renderResults();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
