/* QP Page Finder - analysis engine (v3)
 * Pure, dependency-free JavaScript. Works in the browser (window.QPAnalyze)
 * and in Node (require).
 *
 * v2 improvements:
 *  - Multi-line phrase normalisation ("mag-" + "netic", "magnetic\\nfield").
 *  - Term families so overlapping phrases are not double-counted.
 *  - POSITIONAL printed-page detection: footer numbers are identified by their
 *    physical position (bottom, horizontally centred). A bare number in the
 *    left margin is a QUESTION number and can never become a printed page.
 *    This fixes the "printed page = question number" bug.
 *  - POSITIONAL question-number detection (left-margin numbers only).
 *  - Weighted confidence scoring and richer uncertainty reasons.
 *  - Crop hints (line ranges) used by the A4 capture editor.
 *
 * v3 additions:
 *  - seriesCode ("w21", "s25", "m22") on parsed filenames so a mark scheme can
 *    be matched to its question paper by syllabus + year/session + component.
 *  - Mark-scheme filename parsing and a question -> exact-PDF-page index built
 *    from MS table/row markers in the LEFT margin.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QPAnalyze = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 0. Text normalisation
   * ------------------------------------------------------------------ */

  // PDF text extraction frequently splits a phrase across lines. Join lines
  // before matching so "magnetic\nfield" and "per-\nmanent magnet" are found.
  function normalizeText(text) {
    return String(text || '')
      .replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, '$1$2')  // hyphenated line break
      .replace(/\s*\r?\n\s*/g, ' ')                         // join lines with a space
      .replace(/[\t ]+/g, ' ')
      .trim();
  }

  function unique(arr) {
    var out = [], seen = {};
    for (var i = 0; i < arr.length; i++) {
      if (!seen[arr[i]]) { seen[arr[i]] = true; out.push(arr[i]); }
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 1. Vocabulary (id, family, regex)
   * ------------------------------------------------------------------ */

  // "Anchors": phrases that specifically belong to BASIC magnetism.
  var ANCHORS = [
    { id: 'compass', family: 'compass', re: /\bcompass(?:es)?\b/i },
    { id: 'plotting compass', family: 'compass', re: /\bplotting compass\b/i },
    { id: 'compass needle', family: 'compass', re: /\bcompass needle\b/i },
    { id: 'permanent magnet', family: 'permanent', re: /\bpermanent magnet(?:s)?\b/i },
    { id: 'induced magnetism', family: 'induced', re: /\binduced magnet\w*\b/i },
    { id: 'magnetisation', family: 'magnetisation', re: /\bd?emagnetis(?:e|ed|es|ing|ation)\b|\bd?emagnetiz(?:e|ed|es|ing|ation)\b/i },
    { id: 'magnetic material', family: 'material', re: /\b(?:non[- ])?magnetic material(?:s)?\b/i },
    { id: 'non-magnetic', family: 'material', re: /\bnon[- ]magnetic\b/i },
    { id: 'magnetic poles', family: 'poles', re: /\bmagnetic pole(?:s)?\b/i },
    { id: 'north / south pole', family: 'poles', re: /\b(?:north|south)[ -]?(?:seeking )?pole(?:s)?\b/i },
    { id: 'N / S pole', family: 'poles', re: /\b[NS][ -]?pole(?:s)?\b/i },
    { id: 'north-seeking', family: 'poles', re: /\bnorth[- ]seeking\b/i },
    { id: 'like / unlike poles', family: 'poles', re: /\b(?:like|unlike|opposite|same) poles\b/i },
    { id: 'pole attraction / repulsion', family: 'poles', re: /\b(?:attraction|repulsion) (?:between|of) (?:magnet|pole)s?\b/i },
    { id: 'bar / horseshoe magnet', family: 'magnet', re: /\b(?:bar|horseshoe|u[- ]shaped) magnet(?:s)?\b/i },
    { id: 'magnetic field pattern', family: 'field', re: /\bmagnetic field (?:pattern|lines?)\b/i },
    { id: 'field pattern', family: 'field', re: /\bfield (?:pattern|lines?)\b/i },
    { id: 'neutral point', family: 'field', re: /\bneutral point\b/i },
    { id: 'magnetic shielding', family: 'field', re: /\bmagnetic shielding\b/i },
    { id: 'ferromagnetic', family: 'material', re: /\bferromagnetic\b|\bferrous material(?:s)?\b/i },
    { id: 'suspended magnet', family: 'compass', re: /\b(?:freely )?suspended magnet\b/i }
  ];

  // Generic magnetism wording - not enough on its own.
  var WEAK = [
    { id: 'magnet', family: 'magnet', re: /\bmagnet(?:s)?\b/i },
    { id: 'magnetism', family: 'magnetism', re: /\bmagnetism\b/i },
    { id: 'magnetic', family: 'magnetic', re: /\bmagnetic\b/i },
    { id: 'magnetic field', family: 'field', re: /\bmagnetic field(?:s)?\b/i },
    { id: 'poles', family: 'poles', re: /\bpole(?:s)?\b/i },
    { id: 'attraction / repulsion', family: 'force', re: /\battract(?:s|ed|ing|ion)?\b|\brepel(?:s|ed|ing|lent)?\b|\brepulsion\b/i },
    { id: 'iron / steel / cobalt / nickel', family: 'material', re: /\b(?:soft iron|iron|steel|cobalt|nickel)\b/i },
    { id: 'suspended / freely rotating', family: 'compass', re: /\bfreely (?:suspended|rotating|pivoted)\b|\bsuspended (?:magnet|bar|needle)\b/i },
    { id: 'magnetising by stroking', family: 'magnetisation', re: /\bstrok(?:e|ing)\b/i }
  ];

  // Electromagnetism-only markers. Used to filter out questions that are
  // solely about motors, transformers, induction, coils etc.
  var EM = [
    { id: 'motor', family: 'motor', re: /\b(?:d\.?c\.? |electric |simple )?motor(?:s)?\b/i },
    { id: 'transformer', family: 'transformer', re: /\btransformer(?:s)?\b/i },
    { id: 'generator', family: 'generator', re: /\bgenerator(?:s)?\b|\bdynamo\b/i },
    { id: 'electromagnetic induction', family: 'induction', re: /\belectromagnetic induction\b|\binduced (?:e\.?m\.?f\.?|current|voltage)\b|\bfaraday\b|\blenz\b/i },
    { id: 'coil / solenoid', family: 'coil', re: /\bcoil(?:s)?\b|\bsolenoid(?:s)?\b|\bturns?\b/i },
    { id: 'electromagnet', family: 'electromagnet', re: /\belectromagnet(?:s|ic|ism)?\b/i },
    { id: 'current-carrying conductor', family: 'current', re: /\bcurrent[- ]carrying\b|\bcurrent in (?:a|the) (?:wire|conductor|coil)\b|\bright[- ]hand (?:grip|rule)\b/i },
    { id: 'Fleming rule', family: 'motor', re: /\bfleming\b|\bleft[- ]hand rule\b/i },
    { id: 'primary / secondary coil', family: 'transformer', re: /\bprimary (?:coil|winding)\b|\bsecondary (?:coil|winding)\b|\bstep[- ](?:up|down)\b/i },
    { id: 'e.m.f. / flux linkage', family: 'induction', re: /\be\.?m\.?f\.?\b|\bflux linkage\b|\bmagnetic flux\b/i },
    { id: 'galvanometer / induced current', family: 'induction', re: /\bgalvanometer\b|\binduced current\b/i },
    { id: 'electromagnetic spectrum', family: 'spectrum', re: /\belectromagnetic (?:spectrum|wave|radiation)\b/i },
    { id: 'force on a conductor', family: 'force', re: /\bforce on (?:a|the) (?:wire|conductor|coil)\b/i }
  ];

  // Lines beginning with "<number> <unit>" are physical quantities, not question numbers.
  var UNIT_LINE = /^\d{1,3}\s*(?:kN|cm|mm|km|kg|mg|ms|min|mV|mA|kW|kJ|kPa|Hz|Pa|ohms?|m\/s|cm3|m3|°C)\b/i;
  var FIGURE_LINE = /^(?:fig|figure|table|diagram|graph)\b/i;

  function matchTerms(text, list) {
    var ids = [], fams = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].re.test(text)) { ids.push(list[i].id); fams.push(list[i].family || list[i].id); }
    }
    return { ids: ids, families: unique(fams) };
  }

  /* ------------------------------------------------------------------ *
   * 2. Filename / component parsing
   * ------------------------------------------------------------------ */

  var COMPONENT_LABELS = {
    '41': '0625/41 (Paper 4, variant 1)',
    '42': '0625/42 (Paper 4, variant 2)',
    '43': '0625/43 (Paper 4, variant 3)'
  };

  function parseFilename(name) {
    var base = String(name || '');
    var result = {
      filename: base, syllabus: null, year: null, session: null,
      seriesCode: null, component: null, componentLabel: 'Not identifiable', docType: null
    };
    var m = /\b(\d{4})\s*[_\-. ]\s*([wsm])\s*(\d{2})\s*[_\-. ]\s*(qp|ms|gt|er|ci|in|sp)\s*[_\-. ]\s*(\d{2})\b/i.exec(base);
    if (m) {
      result.syllabus = m[1];
      result.year = 2000 + parseInt(m[3], 10);
      result.seriesCode = m[2].toLowerCase() + m[3];
      result.session = ({ w: 'October/November', s: 'May/June', m: 'March' })[m[2].toLowerCase()] || null;
      result.docType = m[4].toLowerCase();
      result.component = m[5];
      result.componentLabel = COMPONENT_LABELS[m[5]] || ('0625/' + m[5]);
      return result;
    }
    var m2 = /\b0625\s*[_\-. ]?\s*[wsm]\d{2}\s*[_\-. ]?\s*qp\s*[_\-. ]?\s*(\d{2})\b/i.exec(base);
    if (m2) {
      result.syllabus = '0625'; result.component = m2[1]; result.docType = 'qp';
      result.componentLabel = COMPONENT_LABELS[m2[1]] || ('0625/' + m2[1]);
      return result;
    }
    var m3 = /\b0625\s*[/_\-.]\s*(4[123])\b/.exec(base);
    if (m3) {
      result.syllabus = '0625'; result.component = m3[1];
      result.componentLabel = COMPONENT_LABELS[m3[1]];
      return result;
    }
    var m4 = /\bqp[_ .\-]?(4[123])\b|\b(4[123])[_ .\-]?qp\b/i.exec(base);
    if (m4) {
      result.syllabus = '0625'; result.component = m4[1] || m4[2];
      result.componentLabel = COMPONENT_LABELS[result.component];
      return result;
    }
    return result;
  }

  function componentFromText(pages) {
    for (var i = 0; i < Math.min(pages.length, 4); i++) {
      var t = (pages[i].text || '').replace(/\s+/g, '');
      var m = /0625\/(4[123])\//.exec(t);
      if (m) return m[1];
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 3. Question-number and printed-page detection
   * ------------------------------------------------------------------ */

  function questionAtLine(line) {
    var t = String(line || '').trim();
    if (!t || FIGURE_LINE.test(t) || UNIT_LINE.test(t) || /^\d{1,2}\.\d/.test(t)) return null;
    var m = /^question\s+(\d{1,2})\b/i.exec(t);
    if (!m) m = /^(\d{1,2})\s*\([a-z]\)/.exec(t);
    if (!m) m = /^(\d{1,2})\s+(?=[A-Z][A-Za-z0-9 ,.'’\-]{6,})/.exec(t);
    if (!m) m = /^(\d{1,2})\s*$/.exec(t);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    if (n < 1 || n > 20) return null;
    if (/^\d{1,2}\s+(?:of|and|to|in|at|is|are|was|were)\b/i.test(t)) return null;
    return n;
  }

  // lineMeta[i] = {x, y, w, h}; pageWidth in PDF units. Question numbers live
  // in the LEFT MARGIN; centred/footnote numbers must be ignored.
  function detectQuestions(lines, lastNumber, lineMeta, pageWidth) {
    var markers = [], last = lastNumber || 0;
    var footerStart = Math.max(0, lines.length - 3);
    for (var i = 0; i < lines.length; i++) {
      if (i >= footerStart && /^\s*\d{1,3}\s*$/.test(String(lines[i] || ''))) continue;
      var bare = /^\s*\d{1,2}\s*$/.test(String(lines[i] || ''));
      if (lineMeta && pageWidth) {
        var lm = lineMeta[i];
        if (!lm || typeof lm.x !== 'number') continue;
        var leftLimit = bare ? 0.28 : 0.36;
        if (lm.x > pageWidth * leftLimit) continue;   // not a left-margin number
      }
      var n = questionAtLine(lines[i]);
      if (n === null) continue;
      if (n < last || n > last + 4) continue;
      last = n;
      markers.push({ line: i, number: n });
    }
    return { markers: markers, lastNumber: last };
  }

  // POSITIONAL printed-page detection. items: [{text,x,y,w,h}] in PDF user
  // space (y measured from the BOTTOM of the page). A printed page number is
  // in the bottom band AND horizontally centred.
  function printedPageFromItems(items, pageWidth, pageHeight) {
    if (!items || !pageWidth || !pageHeight) return null;
    var found = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var t = String(it.text == null ? '' : it.text).trim();
      if (!t) continue;
      var m = /^page\s+(\d{1,3})\b/i.exec(t) ||
              /^(\d{1,3})\s*\/\s*\d{1,3}$/.exec(t) ||
              /^(\d{1,3})$/.exec(t);
      if (!m) continue;
      var n = parseInt(m[1], 10);
      if (n < 1 || n > 300) continue;
      var cx = (it.x || 0) + (it.w || 0) / 2;
      var y = it.y || 0;
      if (y > pageHeight * 0.16) continue;                       // not in the footer band
      if (cx < pageWidth * 0.28 || cx > pageWidth * 0.72) continue;  // not centred
      found.push({ n: n, y: y });
    }
    if (!found.length) return null;
    found.sort(function (a, b) { return a.y - b.y; });            // lowest = footer
    return found[0].n;
  }

  // Text-only fallback (OCR / no coordinate data). Banned numbers are the
  // question numbers detected on that page - they must never be reused as a
  // printed page number.
  function printedPageCandidate(lines, bannedQuestionNumbers) {
    var banned = bannedQuestionNumbers || [];
    var tail = lines.slice(-5);
    for (var i = tail.length - 1; i >= 0; i--) {
      var t = String(tail[i] || '').trim();
      if (!t) continue;
      var a = /^page\s+(\d{1,3})\b/i.exec(t);
      var b = /^(\d{1,3})\s*\/\s*\d{1,3}$/.exec(t);
      var c = /^(\d{1,3})$/.exec(t);
      var n = a ? parseInt(a[1], 10) : b ? parseInt(b[1], 10) : c ? parseInt(c[1], 10) : null;
      if (n === null) continue;
      if (banned.indexOf(n) !== -1) continue;      // <-- the bug fix
      if (n >= 1 && n <= 300) return n;
    }
    return null;
  }

  function resolvePrintedPages(pages) {
    var offsets = [];
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i];
      var c = p.printedCandidate;
      if (c === null || c === undefined) continue;
      // Hard guard: a printed page number may never equal a question number on
      // the same page unless it was positionally confirmed in the footer.
      if (!p.printedPositional && p.questionNumbers && p.questionNumbers.indexOf(c) !== -1) continue;
      offsets.push({ page: p.pdfPage, offset: c - p.pdfPage });
    }
    if (offsets.length < 3) return { reliable: false, offset: null };
    var counts = {}, best = null, bestCount = 0;
    for (var j = 0; j < offsets.length; j++) {
      var k = String(offsets[j].offset);
      counts[k] = (counts[k] || 0) + 1;
      if (counts[k] > bestCount) { bestCount = counts[k]; best = offsets[j].offset; }
    }
    var reliable = bestCount >= 3 && bestCount / offsets.length >= 0.7;
    return { reliable: reliable, offset: reliable ? best : null };
  }

  /* ------------------------------------------------------------------ *
   * 4. Classification
   * ------------------------------------------------------------------ */

  function classify(rawText) {
    var text = normalizeText(rawText);
    var a = matchTerms(text, ANCHORS);
    var w = matchTerms(text, WEAK);
    var e = matchTerms(text, EM);
    var fam = a.families.length, wfam = w.families.length, efam = e.families.length;
    var score = fam * 3 + wfam - efam * 2;
    var bucket, reason;

    if (fam === 0) {
      if (efam >= 1) { bucket = 'excluded'; reason = 'Electromagnetism wording only (no basic-magnetism concept)'; }
      else if (wfam >= 2) { bucket = 'review'; reason = 'Generic magnetism wording, no specific basic-magnetism concept'; }
      else { bucket = 'excluded'; reason = 'No magnetism wording detected'; }
    } else if (efam >= 2 && fam <= 1) {
      bucket = 'review';
      reason = 'Also mentions electromagnetism (motor / coil / induction / transformer) - check whether it tests basic magnetism';
    } else if (efam >= 3) {
      bucket = 'review'; reason = 'Mixed basic-magnetism and electromagnetism wording';
    } else {
      bucket = 'match'; reason = '';
    }

    return {
      bucket: bucket, reason: reason,
      anchors: a.ids, anchorFamilies: a.families,
      weak: w.ids, weakFamilies: w.families,
      em: e.ids, emFamilies: e.families,
      score: score,
      terms: unique(a.ids.concat(w.ids))
    };
  }

  /* ------------------------------------------------------------------ *
   * 5. Document analysis
   * ------------------------------------------------------------------ */

  function analyzeDocument(pages, meta) {
    meta = meta || {};
    var filename = meta.filename || 'unknown.pdf';
    var parsed = parseFilename(filename);
    var textComp = componentFromText(pages);
    if (!parsed.component && textComp) {
      parsed.component = textComp;
      parsed.componentLabel = COMPONENT_LABELS[textComp] || ('0625/' + textComp);
      parsed.componentSource = 'PDF header';
    } else if (parsed.component) parsed.componentSource = 'filename';

    // Resolve printed candidates first (positional preferred, text fallback).
    var lastNumber = 0, prepared = [];
    for (var p = 0; p < pages.length; p++) {
      var page = pages[p];
      var lines = page.lines || [];
      var dq = detectQuestions(lines, lastNumber, page.lineMeta, page.pageWidth);
      lastNumber = dq.lastNumber;
      var qnums = unique(dq.markers.map(function (m) { return m.number; }));
      var cand = page.printedCandidate;
      var positional = !!page.printedPositional;
      if (cand === null || cand === undefined) {
        cand = printedPageCandidate(lines, qnums);
        positional = false;
      }
      prepared.push({
        page: page, lines: lines, markers: dq.markers, qnums: qnums,
        printedCandidate: cand, printedPositional: positional
      });
    }
    var printed = resolvePrintedPages(prepared.map(function (x) {
      return {
        pdfPage: x.page.pdfPage, printedCandidate: x.printedCandidate,
        printedPositional: x.printedPositional, questionNumbers: x.qnums
      };
    }));

    // Build question blocks.
    var blocks = [];
    for (var b = 0; b < prepared.length; b++) {
      var pr = prepared[b];
      var pg = pr.page, lines2 = pr.lines, markers = pr.markers;
      var printedNo = printed.reliable ? (pg.pdfPage + printed.offset) : null;
      // Extra guard: never surface a printed page identical to a question
      // number unless it was positionally verified in the footer.
      if (printedNo !== null && !pr.printedPositional && pr.qnums.indexOf(printedNo) !== -1) printedNo = null;
      var base = {
        pdfPage: pg.pdfPage, printed: printedNo, printedPositional: pr.printedPositional,
        ocr: !!pg.ocr, pageWidth: pg.pageWidth, pageHeight: pg.pageHeight
      };
      var pageBlocks = [];
      if (markers.length === 0) {
        pageBlocks.push(Object.assign({}, base, {
          qnum: null, continuation: (b > 0), startLine: 0, endLine: lines2.length,
          text: pg.text || lines2.join('\n')
        }));
      } else {
        if (markers[0].line > 0) {
          pageBlocks.push(Object.assign({}, base, {
            qnum: null, continuation: true, startLine: 0, endLine: markers[0].line,
            text: lines2.slice(0, markers[0].line).join('\n')
          }));
        }
        for (var k = 0; k < markers.length; k++) {
          var start = markers[k].line;
          var end = (k + 1 < markers.length) ? markers[k + 1].line : lines2.length;
          pageBlocks.push(Object.assign({}, base, {
            qnum: markers[k].number, continuation: false, startLine: start, endLine: end,
            text: lines2.slice(start, end).join('\n')
          }));
        }
      }
      for (var q = 0; q < pageBlocks.length; q++) blocks.push(pageBlocks[q]);
    }
    blocks.sort(function (a, c) { return a.pdfPage - c.pdfPage; });

    var signals = [];
    for (var s = 0; s < blocks.length; s++) {
      var cls = classify(blocks[s].text);
      if (cls.bucket === 'excluded') {
        if (cls.em.length > 0 || cls.weak.length > 0) signals.push({ block: blocks[s], cls: cls, bucket: 'excluded' });
        continue;
      }
      signals.push({ block: blocks[s], cls: cls, bucket: cls.bucket });
    }

    // Continuation inheritance.
    for (var c = 0; c < signals.length; c++) {
      var sig = signals[c];
      if (sig.bucket === 'excluded' || sig.block.qnum !== null) continue;
      var inherited = null, inheritedPage = -1;
      for (var e2 = c - 1; e2 >= 0; e2--) {
        var prev = signals[e2];
        if (prev.bucket === 'excluded' || prev.block.qnum === null) continue;
        if (sig.block.pdfPage - prev.block.pdfPage <= 1) {
          inherited = prev.block.qnum; inheritedPage = prev.block.pdfPage;
        }
        break;
      }
      sig.block.qnum = inherited;
      if (inherited !== null && inheritedPage !== sig.block.pdfPage) {
        sig.block.continuation = true;
        sig.block.inheritedFromPage = inheritedPage;
      }
    }

    var used = {}, hits = [];
    for (var h = 0; h < signals.length; h++) {
      if (used[h]) continue;
      var first = signals[h], group = [first];
      used[h] = true;
      for (var g = h + 1; g < signals.length; g++) {
        if (used[g]) continue;
        var other = signals[g];
        if (other.bucket !== first.bucket) continue;
        if (other.block.qnum === null || first.block.qnum === null) continue;
        if (other.block.qnum !== first.block.qnum) continue;
        var maxPage = Math.max.apply(null, group.map(function (x) { return x.block.pdfPage; }));
        if (other.block.pdfPage > maxPage + 1) continue;
        group.push(other); used[g] = true;
      }

      var pageNos = [], printedNos = [], terms = {}, reasons = [], fams = {};
      var ocr = false, continuation = false, score = 0, anyPositional = false;
      for (var t = 0; t < group.length; t++) {
        var it2 = group[t];
        if (pageNos.indexOf(it2.block.pdfPage) === -1) pageNos.push(it2.block.pdfPage);
        if (it2.block.printed !== null && printedNos.indexOf(it2.block.printed) === -1) printedNos.push(it2.block.printed);
        for (var u = 0; u < it2.cls.terms.length; u++) terms[it2.cls.terms[u]] = true;
        for (var f = 0; f < it2.cls.anchorFamilies.length; f++) fams[it2.cls.anchorFamilies[f]] = true;
        score = Math.max(score, it2.cls.score);
        if (it2.block.ocr) ocr = true;
        if (it2.block.continuation || it2.block.inheritedFromPage) continuation = true;
        if (it2.block.printedPositional) anyPositional = true;
        if (it2.cls.reason && reasons.indexOf(it2.cls.reason) === -1) reasons.push(it2.cls.reason);
      }
      pageNos.sort(function (a, z) { return a - z; });
      printedNos.sort(function (a, z) { return a - z; });

      var qnum = first.block.qnum;
      var uncertain = false, uncertainReasons = [];
      if (first.bucket === 'review') { uncertain = true; uncertainReasons = reasons.length ? reasons : ['Needs review']; }
      if (qnum === null) { uncertain = true; uncertainReasons.push('Question number not identifiable'); }
      if (ocr) { uncertain = true; uncertainReasons.push('Text came from OCR (check the page image)'); }
      if (continuation) { uncertain = true; uncertainReasons.push('Question may continue across pages - verify the range'); }
      if (Object.keys(fams).length < 2) {
        uncertain = true;
        if (uncertainReasons.indexOf('Only one basic-magnetism keyword') === -1) uncertainReasons.push('Only one basic-magnetism keyword');
      }

      var label = pageNos.length === 1 ? String(pageNos[0]) : (pageNos[0] + '-' + pageNos[pageNos.length - 1]);
      var printedLabel = printedNos.length === 1 ? String(printedNos[0]) :
        (printedNos.length ? printedNos[0] + '-' + printedNos[printedNos.length - 1] : null);
      // Final safety: if the printed number still equals the question number
      // and was NOT positionally confirmed, suppress it entirely.
      if (printedLabel !== null && !anyPositional && String(qnum) === String(printedNos[0])) printedLabel = null;

      hits.push({
        id: filename + '|' + (qnum === null ? 'q?' : qnum) + '|' + label,
        filename: filename, component: parsed.component,
        componentLabel: parsed.componentLabel, componentSource: parsed.componentSource || null,
        syllabus: parsed.syllabus, year: parsed.year, session: parsed.session,
        seriesCode: parsed.seriesCode, docType: parsed.docType,
        question: qnum, questionLabel: qnum === null ? 'Not identifiable' : String(qnum),
        pages: pageNos, pageLabel: label,
        printedPages: printedNos, printedLabel: printedLabel,
        printedReliable: printed.reliable, printedPositional: anyPositional,
        terms: Object.keys(terms), anchorFamilies: Object.keys(fams), score: score,
        bucket: first.bucket, uncertain: uncertain, uncertainReasons: uncertainReasons,
        ocr: ocr, continuation: continuation,
        confidence: first.bucket === 'review' ? 'Low' : (score >= 7 && !uncertain ? 'High' : 'Medium'),
        cropHint: { startLine: first.block.startLine, endLine: first.block.endLine },
        review: 'unreviewed'
      });
    }

    hits.sort(function (a, z) {
      return a.filename.localeCompare(z.filename) || (a.pages[0] - z.pages[0]) || ((a.question || 0) - (z.question || 0));
    });

    return {
      hits: hits, pageCount: pages.length, printedReliable: printed.reliable,
      component: parsed.component, componentLabel: parsed.componentLabel
    };
  }

  /* ------------------------------------------------------------------ *
   * 6. Mark-scheme matching (v3)
   * ------------------------------------------------------------------ */

  // PapaCambridge MS names look like 0625_w21_ms_41.pdf. Match on syllabus +
  // year/session code + component, never on the filename alone.
  function isMarkSchemeName(name) {
    return /\b\d{4}\s*[_\-. ]\s*[wsm]\s*\d{2}\s*[_\-. ]\s*ms\s*[_\-. ]\s*\d{2}\b/i.test(String(name || '')) ||
           /[_\-. ]ms[_\-. ]/i.test(String(name || ''));
  }
  function markSchemeKey(parsed) {
    if (!parsed || !parsed.syllabus || !parsed.seriesCode || !parsed.component) return null;
    return parsed.syllabus + '|' + parsed.seriesCode + '|' + parsed.component;
  }
  function matchesQuestionPaper(qp, ms) {
    if (!qp || !ms || ms.docType !== 'ms' || !qp.syllabus || !qp.seriesCode || !qp.component) return false;
    return ms.syllabus === qp.syllabus &&
           ms.seriesCode === qp.seriesCode &&
           ms.component === qp.component;
  }

  // Mark schemes use table rows such as "2 (a)  ...  1" or "Question 2".
  // Only a number in the LEFT margin counts; footer numbers are skipped.
  function msQuestionAtLine(line) {
    var t = String(line || '').trim();
    if (!t || FIGURE_LINE.test(t) || UNIT_LINE.test(t)) return null;
    var m = /^question\s+(\d{1,2})\b/i.exec(t) ||
            /^(\d{1,2})\s*\([a-z]\)/.exec(t) ||
            /^(\d{1,2})\s*\)/.exec(t) ||
            /^(\d{1,2})\s*\.\s+(?=[A-Za-z])/.exec(t) ||
            /^(\d{1,2})\s*$/.exec(t) ||
            /^(\d{1,2})\s+(?=[A-Z])/.exec(t);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    if (n < 1 || n > 20) return null;
    return n;
  }

  // pages: [{pdfPage, lines, lineMeta, pageWidth}]
  // returns { "<qnum>": [{pdfPage, startLine, endLine}, ...] }
  function indexMarkSchemePages(pages) {
    var index = {};
    for (var p = 0; p < (pages || []).length; p++) {
      var pg = pages[p], lines = pg.lines || [], meta = pg.lineMeta;
      var footerStart = Math.max(0, lines.length - 3);
      var markers = [];
      for (var i = 0; i < lines.length; i++) {
        if (i >= footerStart && /^\s*\d{1,3}\s*$/.test(String(lines[i] || ''))) continue;
        var n = msQuestionAtLine(lines[i]);
        if (n === null) continue;
        if (meta && pg.pageWidth && meta[i] && typeof meta[i].x === 'number' &&
            meta[i].x > pg.pageWidth * 0.32) continue;
        markers.push({ line: i, number: n });
      }
      for (var k = 0; k < markers.length; k++) {
        var key = String(markers[k].number);
        if (!index[key]) index[key] = [];
        index[key].push({
          pdfPage: pg.pdfPage,
          startLine: markers[k].line,
          endLine: (k + 1 < markers.length) ? markers[k + 1].line : lines.length
        });
      }
    }
    return index;
  }
  function markSchemePagesForQuestion(index, qnum) {
    if (!index || qnum === null || qnum === undefined) return null;
    var entries = index[String(qnum)];
    if (!entries || !entries.length) return null;
    var pageNos = unique(entries.map(function (e) { return e.pdfPage; })).sort(function (a, b) { return a - b; });
    return { pages: pageNos, entries: entries, uncertain: false };
  }

  return {
    normalizeText: normalizeText,
    parseFilename: parseFilename, componentFromText: componentFromText,
    isMarkSchemeName: isMarkSchemeName, markSchemeKey: markSchemeKey,
    matchesQuestionPaper: matchesQuestionPaper,
    msQuestionAtLine: msQuestionAtLine,
    indexMarkSchemePages: indexMarkSchemePages,
    markSchemePagesForQuestion: markSchemePagesForQuestion,
    questionAtLine: questionAtLine, detectQuestions: detectQuestions,
    printedPageFromItems: printedPageFromItems,
    printedPageCandidate: printedPageCandidate, resolvePrintedPages: resolvePrintedPages,
    classify: classify, analyzeDocument: analyzeDocument,
    ANCHORS: ANCHORS, WEAK: WEAK, EM: EM
  };
});
