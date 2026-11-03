/* QP Page Finder - browser application.
 * Everything runs locally. No network requests other than to the tiny
 * localhost server that shipped with this folder (127.0.0.1). PDFs are read
 * read-only and are never modified, exported, screenshotted or transmitted.
 */
(function () {
  'use strict';

  var A = window.QPAnalyze;
  var pdfjsLib = window.pdfjsLib;
  var Tesseract = window.Tesseract;
  var REVIEW_KEY = 'qp-page-finder:reviews:v1';

  var state = {
    serverMode: location.protocol !== 'file:',
    config: null,
    entries: [],            // [{name, rel, size, getBytes(), selected}]
    hits: [],
    errors: [],
    docs: {},               // filename -> { pdf, bytes }
    worker: null,
    workerReady: false,
    workerError: null,
    abort: false,
    scanning: false,
    reviews: {},
    viewer: { filename: null, pdf: null, page: 1, numPages: 1 },
    objectUrls: []
  };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function esc(s) { return String(s == null ? '' : s); }
  function fmtSize(n) {
    if (!n && n !== 0) return '';
    return n < 1024 ? n + ' B' : (n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  }
  function setStatus(msg) { $('scanStatus').textContent = msg; }
  function setProgress(frac) { $('progressBar').style.width = Math.max(0, Math.min(100, frac * 100)) + '%'; }

  /* ------------------------------------------------------------------ *
   * Review state (stored only in this browser's localStorage)
   * ------------------------------------------------------------------ */
  try { state.reviews = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}') || {}; } catch (e) { state.reviews = {}; }
  function saveReviews() {
    try { localStorage.setItem(REVIEW_KEY, JSON.stringify(state.reviews)); } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ *
   * Folder listing
   * ------------------------------------------------------------------ */
  function renderFileList() {
    var box = $('fileList');
    box.innerHTML = '';
    $('fileCount').textContent = state.entries.length + ' PDF' + (state.entries.length === 1 ? '' : 's');
    if (!state.entries.length) {
      box.appendChild(el('div', 'none', 'No PDF files found in this folder. Put your downloaded QP PDFs next to the QP-Page-Finder folder, or choose a different folder.'));
      return;
    }
    state.entries.forEach(function (entry, idx) {
      var row = el('div', 'fileitem');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = entry.selected;
      cb.id = 'f' + idx;
      cb.addEventListener('change', function () { entry.selected = cb.checked; });
      var label = el('label', null, entry.name);
      label.setAttribute('for', 'f' + idx);
      row.appendChild(cb);
      row.appendChild(label);
      row.appendChild(el('span', 'size', fmtSize(entry.size)));
      box.appendChild(row);
    });
  }

  function setEntriesFromServer(data) {
    var dir = data.dir;
    state.entries = (data.files || []).map(function (f) {
      return {
        name: f.name, rel: f.rel, size: f.size, selected: true,
        getBytes: function () {
          var url = '/api/pdf?dir=' + encodeURIComponent(dir) + '&file=' + encodeURIComponent(f.rel);
          return fetch(url).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status + ' while reading ' + f.name);
            return r.arrayBuffer();
          });
        },
        pdfUrl: '/api/pdf?dir=' + encodeURIComponent(dir) + '&file=' + encodeURIComponent(f.rel)
      };
    });
    $('folderStatus').textContent = 'Scanning folder: ' + dir + (data.truncated ? ' (list truncated at 3000 files)' : '');
    renderFileList();
    $('btnScan').disabled = state.entries.length === 0;
  }

  function refreshList() {
    if (!state.serverMode) {
      $('folderStatus').textContent = 'Opened as a local file - use "Choose a different folder" below.';
      return;
    }
    var dir = $('folderPath').value.trim();
    var recursive = $('recursive').checked ? '1' : '0';
    $('folderStatus').textContent = 'Listing PDFs in ' + dir + ' …';
    fetch('/api/scan?dir=' + encodeURIComponent(dir) + '&recursive=' + recursive)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) {
          $('folderStatus').textContent = data.error;
          state.entries = []; renderFileList(); $('btnScan').disabled = true;
          return;
        }
        setEntriesFromServer(data);
      })
      .catch(function (e) {
        $('folderStatus').textContent = 'Could not list folder: ' + e.message;
        state.entries = []; renderFileList(); $('btnScan').disabled = true;
      });
  }

  function useFolderPicker(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return f.name.toLowerCase().endsWith('.pdf');
    });
    state.entries = files.map(function (f) {
      return {
        name: f.name, rel: f.webkitRelativePath || f.name, size: f.size, selected: true,
        getBytes: function () { return f.arrayBuffer(); },
        pdfUrl: null,
        blobUrl: null,
        file: f
      };
    });
    $('folderStatus').textContent = 'Using folder chosen in the browser (' + state.entries.length + ' PDFs). These files are read directly in your browser; nothing is uploaded.';
    renderFileList();
    $('btnScan').disabled = state.entries.length === 0;
  }

  function ensureBlobUrl(entry) {
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
   * PDF text extraction
   * ------------------------------------------------------------------ */
  function itemsToLines(tc) {
    var rows = [];
    (tc.items || []).forEach(function (it) {
      var s = it.str || '';
      if (!s.trim()) return;
      var tr = it.transform || [0, 0, 0, 0, 0, 0];
      var y = tr[5], x = tr[4];
      var row = null;
      for (var i = 0; i < rows.length; i++) {
        if (Math.abs(rows[i].y - y) <= 3) { row = rows[i]; break; }
      }
      if (!row) { row = { y: y, parts: [] }; rows.push(row); }
      row.parts.push({ x: x, s: s });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      r.parts.sort(function (a, b) { return a.x - b.x; });
      var line = '';
      r.parts.forEach(function (p) {
        if (line && /[A-Za-z0-9]$/.test(line) && /^[A-Za-z0-9]/.test(p.s)) line += ' ';
        line += p.s;
      });
      return line.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
  }

  /* ------------------------------------------------------------------ *
   * Offline OCR (bundled Tesseract.js + WebAssembly + English data)
   * ------------------------------------------------------------------ */
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
      logger: function () { /* no logging of PDF content */ }
    }).then(function (w) {
      state.worker = w;
      state.workerReady = true;
      $('ocrBadge').textContent = 'OCR engine: ready (offline)';
      $('ocrBadge').className = 'badge ok';
      return w;
    }).catch(function (e) {
      state.workerError = e;
      $('ocrBadge').textContent = 'OCR engine unavailable: ' + e.message;
      $('ocrBadge').className = 'badge review';
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
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return page.render({ canvasContext: ctx, viewport: viewport, background: '#ffffff' }).promise
      .then(function () { return worker.recognize(canvas); })
      .catch(function () {
        var dataUrl = canvas.toDataURL('image/png');
        return worker.recognize(dataUrl);
      })
      .then(function (res) {
        var text = (res && res.data && res.data.text) || '';
        return text.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      });
  }

  /* ------------------------------------------------------------------ *
   * Scanning
   * ------------------------------------------------------------------ */
  function scanOne(entry, useOcr, onPage) {
    return entry.getBytes().then(function (buf) {
      var bytes = new Uint8Array(buf);
      var copy = bytes.slice();          // keep a copy for the viewer
      return pdfjsLib.getDocument({
        data: bytes,
        standardFontDataUrl: './vendor/standard_fonts/',
        disableRange: true,
        disableStream: true,
        isEvalSupported: false,
        useWorkerFetch: false
      }).promise.then(function (pdf) {
        state.docs[entry.name] = { pdf: pdf, bytes: copy };
        var pages = [];
        var chain = Promise.resolve();
        for (var n = 1; n <= pdf.numPages; n++) {
          (function (pageNo) {
            chain = chain.then(function () {
              if (state.abort) return null;
              onPage(pageNo, pdf.numPages);
              return pdf.getPage(pageNo).then(function (page) {
                return page.getTextContent().then(function (tc) {
                  var lines = itemsToLines(tc);
                  var text = lines.join('\n');
                  var ocr = false;
                  if (text.replace(/\s/g, '').length < 60 && useOcr) {
                    return getWorker().then(function (w) {
                      return ocrPage(page, w);
                    }).then(function (ocrLines) {
                      lines = ocrLines;
                      text = ocrLines.join('\n');
                      ocr = ocrLines.join('').length > 0;
                      return {
                        pdfPage: pageNo, lines: lines, text: text, ocr: ocr,
                        printedCandidate: A.printedPageCandidate(lines)
                      };
                    }).catch(function () {
                      return {
                        pdfPage: pageNo, lines: lines, text: text, ocr: false, ocrFailed: true,
                        printedCandidate: A.printedPageCandidate(lines)
                      };
                    });
                  }
                  return {
                    pdfPage: pageNo, lines: lines, text: text, ocr: false,
                    printedCandidate: A.printedPageCandidate(lines)
                  };
                });
              });
            }).then(function (pageData) {
              if (pageData) pages.push(pageData);
            });
          })(n);
        }
        return chain.then(function () {
          return { pages: pages, numPages: pdf.numPages };
        });
      });
    });
  }

  function describeSecurityError(e) {
    var name = e && e.name ? e.name : '';
    var msg = e && e.message ? e.message : String(e);
    if (/password|encrypt|No password given/i.test(name + ' ' + msg)) {
      return 'password-protected / encrypted - skipped (this app never bypasses PDF security)';
    }
    return 'could not be opened: ' + msg;
  }

  function runScan() {
    if (state.scanning) return;
    var selected = state.entries.filter(function (e) { return e.selected; });
    if (!selected.length) { setStatus('Select at least one PDF first.'); return; }
    state.abort = false;
    state.scanning = true;
    state.hits = [];
    state.errors = [];
    $('btnScan').disabled = true;
    $('btnStop').disabled = false;
    setProgress(0);
    var useOcr = $('useOcr').checked;
    var done = 0;

    var chain = Promise.resolve();
    selected.forEach(function (entry) {
      chain = chain.then(function () {
        if (state.abort) return null;
        setStatus('Scanning ' + entry.name + ' … (' + (done + 1) + '/' + selected.length + ')');
        return scanOne(entry, useOcr, function (pageNo, total) {
          var per = 1 / selected.length;
          setProgress((done / selected.length) + per * (pageNo / Math.max(1, total)) * 0.95);
        }).then(function (res) {
          if (!res) return null;
          var analysis = A.analyzeDocument(res.pages, { filename: entry.name });
          analysis.hits.forEach(function (h) { state.hits.push(h); });
          var noText = res.pages.filter(function (p) { return p.lines.length === 0; }).length;
          if (noText) {
            state.errors.push(entry.name + ': ' + noText + ' page(s) had no extractable text' +
              (useOcr ? ' and OCR did not produce text' : ' (OCR was off)') + ' - review those pages manually.');
          }
          done += 1;
          setProgress(done / selected.length);
          return ensureBlobUrl(entry).catch(function () { return null; }).then(function () { return null; });
        }).catch(function (e) {
          state.errors.push(entry.name + ': ' + describeSecurityError(e));
          done += 1;
          setProgress(done / selected.length);
        });
      });
    });

    chain.then(function () {
      state.scanning = false;
      $('btnScan').disabled = false;
      $('btnStop').disabled = true;
      setProgress(1);
      renderResults();
      var msg = (state.abort ? 'Stopped. ' : 'Finished. ') + state.hits.filter(function (h) { return h.bucket !== 'excluded'; }).length +
        ' candidate match(es) across ' + done + ' PDF(s).';
      if (state.errors.length) msg += ' ' + state.errors.length + ' file/page warning(s) - see below.';
      setStatus(msg);
      if (state.errors.length) {
        var pre = $('scanErrors');
        if (!pre) {
          pre = el('pre', 'hint small');
          pre.id = 'scanErrors';
          $('scanCard').appendChild(pre);
        }
        pre.textContent = 'Notes / limitations:\n' + state.errors.map(function (x) { return '• ' + x; }).join('\n');
      } else {
        var old = $('scanErrors'); if (old) old.remove();
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Results
   * ------------------------------------------------------------------ */
  function termsCell(hit) {
    var wrap = el('div', 'terms');
    hit.terms.slice(0, 8).forEach(function (t) { wrap.appendChild(el('span', 'term', t)); });
    if (hit.terms.length > 8) wrap.appendChild(el('span', 'term', '+' + (hit.terms.length - 8) + ' more'));
    return wrap;
  }

  function statusCell(hit) {
    var cell = el('td');
    var conf = el('div', 'conf ' + hit.confidence, hit.bucket === 'excluded' ? 'Excluded' : (hit.confidence + ' confidence'));
    cell.appendChild(conf);
    if (hit.uncertainReasons.length) {
      var box = el('div', 'uncertain-box');
      box.appendChild(el('strong', null, hit.bucket === 'excluded' ? 'Why excluded: ' : '⚠ Uncertain - review: '));
      box.appendChild(document.createTextNode(hit.uncertainReasons.join(' · ')));
      cell.appendChild(box);
    }
    if (hit.bucket !== 'excluded') {
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
    renderResults();
  }

  function copyText(text, btn) {
    function done() {
      var old = btn.textContent;
      btn.textContent = '✓ Copied';
      setTimeout(function () { btn.textContent = old; }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
    }
  }

  function actionsCell(hit) {
    var cell = el('td');
    var wrap = el('div', 'actions');
    var openBtn = el('button', null, 'Open at page ' + hit.pages[0] + ' (in-app)');
    openBtn.addEventListener('click', function () { openViewer(hit); });
    wrap.appendChild(openBtn);

    var entry = findEntry(hit.filename);
    var link = el('a', null, 'Open PDF at page ' + hit.pages[0] + ' ↗');
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    link.href = '#';
    link.addEventListener('click', function (ev) {
      ev.preventDefault();
      var url = (entry && entry.pdfUrl) ? entry.pdfUrl : (entry && entry.blobUrl);
      if (!url) {
        ensureBlobUrl(entry).then(function (u) { window.open(u + '#page=' + hit.pages[0], '_blank', 'noopener'); });
      } else {
        window.open(url + '#page=' + hit.pages[0], '_blank', 'noopener');
      }
    });
    wrap.appendChild(link);

    var ref = hit.filename + ' | ' + hit.componentLabel + ' | Q' + hit.questionLabel +
      ' | PDF page ' + hit.pageLabel + (hit.printedLabel ? ' (printed page ' + hit.printedLabel + ')' : '');
    var copyBtn = el('button', null, 'Copy page reference');
    copyBtn.addEventListener('click', function () { copyText(ref, copyBtn); });
    wrap.appendChild(copyBtn);
    cell.appendChild(wrap);
    return cell;
  }

  function findEntry(name) {
    for (var i = 0; i < state.entries.length; i++) if (state.entries[i].name === name) return state.entries[i];
    return null;
  }

  function renderResults() {
    var body = $('resultsBody');
    body.innerHTML = '';
    var showExcluded = $('showExcluded').checked;
    var filter = $('filter').value;
    var visible = state.hits.filter(function (h) {
      if (h.review === undefined) h.review = state.reviews[h.id] || 'unreviewed';
      else h.review = state.reviews[h.id] || 'unreviewed';
      if (h.bucket === 'excluded' && !showExcluded) return false;
      if (filter === 'review' && !h.uncertain) return false;
      if (filter === 'unreviewed' && h.review !== 'unreviewed') return false;
      if (filter === 'relevant' && h.review !== 'relevant') return false;
      if (filter === 'notrelevant' && h.review !== 'notrelevant') return false;
      return true;
    });

    $('resultCount').textContent = visible.length + ' row' + (visible.length === 1 ? '' : 's') + ' shown / ' +
      state.hits.filter(function (h) { return h.bucket !== 'excluded'; }).length + ' matches';
    $('excludedCount').textContent = state.hits.filter(function (h) { return h.bucket === 'excluded'; }).length +
      ' electromagnetism-only excluded';
    $('emptyState').hidden = visible.length > 0;

    visible.forEach(function (hit) {
      var tr = el('tr', hit.bucket === 'excluded' ? 'excluded-row' : '');
      tr.appendChild(el('td', 'fname', hit.filename));
      tr.appendChild(el('td', null, hit.componentLabel));
      tr.appendChild(el('td', null, 'Q' + hit.questionLabel));
      var pg = el('td', 'page-num', hit.pageLabel);
      tr.appendChild(pg);
      tr.appendChild(el('td', 'printed-num', hit.printedLabel || '—'));
      var tc = el('td'); tc.appendChild(termsCell(hit)); tr.appendChild(tc);
      tr.appendChild(statusCell(hit));
      tr.appendChild(actionsCell(hit));
      body.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------------ *
   * Built-in, view-only PDF viewer (pdf.js renders the original page)
   * ------------------------------------------------------------------ */
  function openViewer(hit) {
    var doc = state.docs[hit.filename];
    if (!doc || !doc.pdf) { setStatus('The PDF for this result is no longer loaded. Re-scan to view it.'); return; }
    state.viewer.filename = hit.filename;
    state.viewer.pdf = doc.pdf;
    state.viewer.page = Math.max(1, Math.min(hit.pages[0], doc.pdf.numPages));
    state.viewer.numPages = doc.pdf.numPages;
    $('viewerTitle').textContent = hit.filename + '  ·  ' + hit.componentLabel + '  ·  Q' + hit.questionLabel;
    $('viewerSub').textContent = 'PDF pages ' + hit.pageLabel + (hit.printedLabel ? '  ·  printed page ' + hit.printedLabel : '') +
      '  ·  ' + (hit.uncertain ? 'uncertain match - please review' : 'basic-magnetism match');
    $('viewer').hidden = false;
    renderViewerPage();
  }

  function renderViewerPage() {
    var v = state.viewer;
    if (!v.pdf) return;
    $('viewerLoading').hidden = false;
    $('viewerPage').textContent = 'Page ' + v.page + ' of ' + v.numPages;
    v.pdf.getPage(v.page).then(function (page) {
      var base = page.getViewport({ scale: 1 });
      var scale = Math.min(1.7, 1500 / base.width);
      var viewport = page.getViewport({ scale: Math.max(0.6, scale) });
      var canvas = $('viewerCanvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return page.render({ canvasContext: ctx, viewport: viewport, background: '#ffffff' }).promise;
    }).then(function () {
      $('viewerLoading').hidden = true;
    }).catch(function (e) {
      $('viewerLoading').hidden = true;
      $('viewerSub').textContent = 'Could not render this page: ' + e.message;
    });
  }

  function closeViewer() {
    $('viewer').hidden = true;
    var canvas = $('viewerCanvas');
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /* ------------------------------------------------------------------ *
   * Wiring
   * ------------------------------------------------------------------ */
  function init() {
    if (!state.serverMode) {
      $('fileModeWarning').hidden = false;
      $('offlineBadge').textContent = '● Opened as local file';
      $('btnRefresh').disabled = true;
    }

    if (pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
    } else {
      setStatus('ERROR: pdf.js did not load. Check that the vendor folder is complete.');
    }

    if (state.serverMode) {
      fetch('/api/config').then(function (r) { return r.json(); }).then(function (cfg) {
        state.config = cfg;
        $('folderPath').value = cfg.defaultDir;
        refreshList();
      }).catch(function () {
        $('folderStatus').textContent = 'Local server not reachable - use "Choose a different folder".';
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

    $('btnCloseViewer').addEventListener('click', closeViewer);
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

    renderFileList();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
