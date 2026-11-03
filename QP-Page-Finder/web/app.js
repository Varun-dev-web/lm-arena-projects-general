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
    entries: [],                 // [{name, rel, size, selected, getBytes(), pdfUrl}]
    hits: [],                    // all hits, including 'excluded' ones (filtered in renderResults)
    errors: [],
    docs: {},                    // filename -> {pdf, bytes, pageMeta}
    reviews: {},                 // hit.id -> 'relevant' | 'notrelevant'
    captures: {},                // hit.id -> {pageNo -> {dataUrl,w,h}}
    cropRects: {},               // hit.id -> {pageNo -> rect}
    crop: null,                  // active alignment editor
    compiled: null,              // {blob, pageCount, sheetCount, approved}
    compiledPdf: null,
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
        name: f.name, rel: f.rel, size: f.size, selected: true,
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
        name: f.name, rel: f.webkitRelativePath || f.name, size: f.size, selected: true,
        getBytes: function () { return f.arrayBuffer(); },
        pdfUrl: null, blobUrl: null, file: f
      };
    });
    $('folderStatus').textContent = 'Using folder chosen in the browser (' + state.entries.length +
      ' PDFs). These files are read directly in your browser; nothing is uploaded.';
    renderFileList();
    $('btnScan').disabled = state.entries.length === 0;
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

  async function runScan() {
    if (state.scanning) return;
    var selected = state.entries.filter(function (e) { return e.selected; });
    if (!selected.length) { setStatus('Select at least one PDF first.'); return; }
    state.abort = false; state.scanning = true;
    state.hits = []; state.errors = []; state.docs = {};
    state.captures = {}; state.cropRects = {};
    invalidateCompiled();
    $('btnScan').disabled = true; $('btnStop').disabled = false;
    setProgress(0);
    var useOcr = $('useOcr').checked;
    var done = 0;
    for (var i = 0; i < selected.length; i++) {
      if (state.abort) break;
      var entry = selected[i];
      setStatus('Scanning ' + entry.name + ' … (' + (done + 1) + '/' + selected.length + ')');
      try {
        var res = await scanOne(entry, useOcr, function (pageNo, total) {
          setProgress((done / selected.length) + (1 / selected.length) * (pageNo / Math.max(1, total)) * 0.95);
        });
        var analysis = A.analyzeDocument(res.pages, { filename: entry.name });
        analysis.hits.forEach(function (h) { state.hits.push(h); });
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
      ' candidate match(es) across ' + done + ' PDF(s).';
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
  function captureComplete(h) { return captureState(h).all; }
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
      var cap = captureState(hit);
      var capTag = el('div', 'capture-line');
      if (state.reviews[hit.id] === 'relevant') {
        capTag.appendChild(el('span', 'tag ' + (cap.all ? 'cap-ok' : 'cap-missing'),
          cap.all ? '✓ ' + cap.done + ' capture' + (cap.done > 1 ? 's' : '') : '⚠ ' + cap.done + '/' + cap.total + ' captured'));
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
    if (hit.review === 'relevant') openCropEditor(hit);
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
      var capBtn = el('button', null, 'Capture / align');
      capBtn.addEventListener('click', function () { openCropEditor(hit); });
      wrap.appendChild(capBtn);
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
  function activeViewerPdf() { return state.viewerMode === 'compiled' ? state.compiledPdf : state.viewer.pdf; }
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
    if (!state.compiledPdf) return;
    state.viewerMode = 'compiled';
    state.viewer.pdf = state.compiledPdf;
    state.viewer.page = 1;
    state.viewer.numPages = state.compiledPdf.numPages;
    $('approveBar').hidden = false;
    $('viewerTitle').textContent = 'A4 PDF preview';
    $('viewerSub').textContent = state.compiled.sheetCount + ' A4 sheet(s) · ' +
      (state.compiled.blob.size / 1024 / 1024).toFixed(2) + ' MB · not downloaded yet';
    $('approveSub').textContent = 'Check every sheet with ‹ Previous / Next ›. The download starts only after you approve.';
    $('viewerNote').textContent = 'Preview only — nothing downloads until you approve.';
    $('viewer').hidden = false;
    renderViewerPage();
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
  function defaultRect(hit, pageNo) {
    var saved = state.cropRects[hit.id] && state.cropRects[hit.id][pageNo];
    if (saved) return Object.assign({}, saved);
    var full = { l: 0.02, t: 0.02, r: 0.98, b: 0.98 };
    if (!hit.cropHint || hit.pages.indexOf(pageNo) !== 0) return full;
    var doc = state.docs[hit.filename];
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
  async function openCropEditor(hit) {
    if (state.crop) return;
    var doc = state.docs[hit.filename];
    if (!doc || !doc.pdf) { setStatus('Re-scan ' + hit.filename + ' in this tab to enable captures.'); return; }
    var pagesList = hit.pages.slice();
    state.crop = { hit: hit, pages: pagesList, page: pagesList[0], rects: {}, images: {}, displayW: 690, drag: null };
    pagesList.forEach(function (p) { state.crop.rects[p] = defaultRect(hit, p); });
    $('cropTitle').textContent = 'Align capture · ' + hit.filename + ' · Q' + hit.questionLabel;
    $('cropSub').textContent = 'Rendering ' + pagesList.length + ' page(s)…';
    $('cropPageSelect').innerHTML = pagesList.map(function (p) {
      return '<option value="' + p + '">PDF page ' + p + '</option>';
    }).join('');
    $('cropPageSelect').value = String(pagesList[0]);
    $('cropModal').hidden = false;
    try {
      for (var i = 0; i < pagesList.length; i++) {
        var p = pagesList[i];
        $('cropSub').textContent = 'Rendering PDF page ' + p + ' of ' + hit.pages[hit.pages.length - 1] + '…';
        var pm = doc.pageMeta[p];
        var scale = Math.min(2.4, 1900 / ((pm && pm.pageWidth) || 595));
        state.crop.images[p] = await renderPdfPageToCanvas(doc.pdf, p, scale);
        if (!state.crop) return;                    // cancelled while rendering
      }
    } catch (e) {
      $('cropSub').textContent = 'Could not render this page: ' + e.message;
      return;
    }
    if (!state.crop) return;
    $('cropSub').textContent = 'Drag the box, drag a corner handle, or type percentages. Then save the capture(s).';
    renderCropPage();
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
    var c = state.crop, hit = c.hit;
    if (c.pages.some(function (p) { return !c.images[p]; })) {
      $('cropSub').textContent = 'Still rendering; please wait.'; return;
    }
    var caps = {}, saved = {};
    c.pages.forEach(function (p) {
      var r = normaliseRect(c.rects[p]);
      caps[p] = makeCapture(c.images[p], r);
      saved[p] = Object.assign({}, r);
    });
    state.captures[hit.id] = caps;
    state.cropRects[hit.id] = saved;
    invalidateCompiled();
    closeCropEditor();
    setStatus('Capture saved for ' + hit.filename + ' · Q' + hit.questionLabel + ' · PDF page ' + hit.pageLabel + '.');
    renderResults();
  }
  function closeCropEditor() {
    state.crop = null;
    $('cropModal').hidden = true;
  }

  /* ------------------------------------------------------------------ *
   * v2: A4 PDF compilation, preview, approval, download
   * ------------------------------------------------------------------ */
  function invalidateCompiled() {
    state.compiled = null; state.compiledPdf = null;
    $('btnDownloadApproved').hidden = true;
    $('btnDownloadApproved').disabled = true;
  }
  function updateCompilePanel() {
    var conf = confirmedHits();
    var pend = pendingHits();
    var cap = conf.filter(captureComplete);
    var sheets = cap.reduce(function (n, h) { return n + h.pages.length; }, 0);
    $('cntConfirmed').textContent = conf.length;
    $('cntCaptured').textContent = cap.length;
    $('cntPending').textContent = pend.length;
    $('cntSheets').textContent = sheets;
    $('cntCaptured').className = 'cnum ' + (conf.length && cap.length === conf.length ? 'ready' : '');
    $('cntPending').className = 'cnum ' + (pend.length ? 'pending' : 'ready');
    var ready = conf.length > 0 && pend.length === 0 && cap.length === conf.length;
    $('btnBuild').disabled = !ready;
    $('btnMarkRest').disabled = pend.length === 0;
    $('btnDownloadApproved').hidden = !state.compiled;
    $('btnDownloadApproved').disabled = !state.compiled;
    var msg;
    if (!state.hits.length) msg = 'Scan some PDFs and confirm a question to begin.';
    else if (state.compiled) msg = 'Preview ready: ' + state.compiled.sheetCount + ' A4 sheet(s). Review it in the viewer, then approve the download.';
    else if (!conf.length) msg = 'Mark at least one question ✓ Relevant. Its capture is rendered automatically.';
    else if (pend.length) msg = pend.length + ' question(s) still need to be checked before building.';
    else if (cap.length < conf.length) msg = (conf.length - cap.length) + ' confirmed question(s) have no capture. Re-scan the PDF if you reloaded this tab.';
    else msg = 'Ready: ' + sheets + ' A4 sheet(s) from ' + cap.length + ' confirmed question(s). Press "Build A4 PDF (preview)".';
    $('compileStatus').textContent = msg;
  }
  async function buildA4Pdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) { setStatus('jsPDF is missing from the offline bundle.'); return; }
    var hits = confirmedHits().filter(captureComplete);
    if (!hits.length) return;
    $('btnBuild').disabled = true;
    $('compileStatus').textContent = 'Building A4 PDF locally…';
    try {
      var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
      var PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
      var M = 20, foot = $('includeFooter').checked;
      var sheets = 0;
      for (var i = 0; i < hits.length; i++) {
        var h = hits[i];
        for (var j = 0; j < h.pages.length; j++) {
          var pg = h.pages[j], capd = state.captures[h.id][pg];
          if (!capd) continue;
          if (sheets > 0) doc.addPage();
          var availW = PW - 2 * M, availH = PH - 2 * M - (foot ? 18 : 0);
          var s = Math.min(availW / capd.w, availH / capd.h);
          var w = capd.w * s, hh = capd.h * s;
          doc.addImage(capd.dataUrl, 'PNG', (PW - w) / 2, M + (availH - hh) / 2, w, hh, undefined, 'FAST');
          if (foot) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100);
            doc.text(h.filename + '  |  Q' + h.questionLabel + '  |  PDF page ' + pg, M, PH - 10);
          }
          sheets++;
        }
      }
      if (!sheets) throw new Error('No captures were available.');
      var blob = doc.output('blob');
      var bytes = new Uint8Array(await blob.arrayBuffer());
      var previewPdf = await pdfjsLib.getDocument({
        data: bytes.slice(),
        standardFontDataUrl: './vendor/standard_fonts/',
        disableRange: true, disableStream: true,
        isEvalSupported: false, useWorkerFetch: false
      }).promise;
      state.compiled = { blob: blob, pageCount: previewPdf.numPages, sheetCount: sheets, approved: false };
      state.compiledPdf = previewPdf;
      updateCompilePanel();
      openCompiledPreview();
    } catch (e) {
      $('compileStatus').textContent = 'Could not build the A4 PDF: ' + e.message;
      invalidateCompiled();
      updateCompilePanel();
    }
  }
  function downloadA4() {
    if (!state.compiled) return;
    var url = URL.createObjectURL(state.compiled.blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'QP-Magnetism-A4.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }
  function approveAndDownload() {
    if (!state.compiled) return;
    state.compiled.approved = true;
    downloadA4();
    $('compileStatus').textContent = 'Approved. Downloaded QP-Magnetism-A4.pdf (' + state.compiled.pageCount + ' A4 sheet(s)).';
    $('btnDownloadApproved').hidden = false;
    $('btnDownloadApproved').disabled = false;
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
        refreshList();
      }).catch(function () {
        $('folderStatus').textContent = 'Local server not reachable - use "Choose a different folder".';
        refreshList();
      });
    } else {
      $('folderStatus').textContent = 'Opened as a local file. Choose a folder to continue.';
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
    $('btnApproveDownload').addEventListener('click', approveAndDownload);

    // Compile panel
    $('btnBuild').addEventListener('click', buildA4Pdf);
    $('btnMarkRest').addEventListener('click', function () {
      pendingHits().forEach(function (h) { state.reviews[h.id] = 'notrelevant'; });
      saveReviews(); invalidateCompiled(); renderResults();
    });
    $('btnDownloadApproved').addEventListener('click', function () {
      if (state.compiled && state.compiled.approved) downloadA4();
    });

    // Crop editor
    $('cropPageSelect').addEventListener('change', function () {
      if (!state.crop) return;
      state.crop.page = parseInt($('cropPageSelect').value, 10);
      renderCropPage();
    });
    $('btnAutoCrop').addEventListener('click', function () {
      if (!state.crop) return;
      state.crop.rects[state.crop.page] = defaultRect(state.crop.hit, state.crop.page);
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
    renderResults();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
