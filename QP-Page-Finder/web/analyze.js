/* QP Page Finder - analysis engine
 * Pure, dependency-free JavaScript. Works in the browser (window.QPAnalyze)
 * and in Node (require). It never sees or emits question text: it only emits
 * filenames, component labels, question numbers, page numbers and keyword labels.
 *
 * Scope: "simple phenomena of magnetism" in Cambridge IGCSE Physics 0625
 * (magnetic materials, poles, attraction/repulsion, induced & permanent
 * magnetism, magnetic fields/field patterns, compass behaviour). Questions
 * that are ONLY about motors, transformers, electromagnetic induction or
 * other electromagnetism are separated out.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QPAnalyze = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. Vocabulary
   * ------------------------------------------------------------------ */

  // "Anchors": phrases that specifically belong to BASIC magnetism.
  var ANCHORS = [
    { id: 'compass', re: /\bcompass(?:es)?\b/i },
    { id: 'plotting compass', re: /\bplotting compass\b/i },
    { id: 'permanent magnet', re: /\bpermanent magnet(?:s)?\b/i },
    { id: 'induced magnetism', re: /\binduced magnet\w*\b/i },
    { id: 'magnetisation', re: /\bd?emagnetis(?:e|ed|es|ing|ation)\b|\bd?emagnetiz(?:e|ed|es|ing|ation)\b/i },
    { id: 'magnetic material', re: /\bmagnetic material(?:s)?\b/i },
    { id: 'magnetic poles', re: /\bmagnetic pole(?:s)?\b/i },
    { id: 'north / south pole', re: /\b(?:north|south)[ -]?(?:seeking )?pole(?:s)?\b/i },
    { id: 'N / S pole', re: /\b[NS][ -]?pole(?:s)?\b/ },
    { id: 'north-seeking', re: /\bnorth[- ]seeking\b/i },
    { id: 'like / unlike poles', re: /\b(?:like|unlike|opposite|same) poles\b/i },
    { id: 'bar / horseshoe magnet', re: /\b(?:bar|horseshoe|u[- ]shaped) magnet(?:s)?\b/i },
    { id: 'magnetic field pattern', re: /\bmagnetic field (?:pattern|lines?)\b/i },
    { id: 'field pattern', re: /\bfield (?:pattern|lines?)\b/i },
    { id: 'ferromagnetic', re: /\bferromagnetic\b|\bferrous material\b/i },
    { id: 'magnetic shielding', re: /\bmagnetic shielding\b/i }
  ];

  // Generic magnetism wording - not enough on its own.
  var WEAK = [
    { id: 'magnet', re: /\bmagnet(?:s)?\b/i },
    { id: 'magnetism', re: /\bmagnetism\b/i },
    { id: 'magnetic', re: /\bmagnetic\b/i },
    { id: 'magnetic field', re: /\bmagnetic field(?:s)?\b/i },
    { id: 'poles', re: /\bpole(?:s)?\b/i },
    { id: 'attraction / repulsion', re: /\battract(?:s|ed|ing|ion)?\b|\brepel(?:s|ed|ing|lent)?\b|\brepulsion\b/i },
    { id: 'iron / steel / cobalt / nickel', re: /\b(?:soft iron|iron|steel|cobalt|nickel)\b/i },
    { id: 'suspended / freely rotating', re: /\bfreely (?:suspended|rotating|pivoted)\b|\bsuspended (?:magnet|bar|needle)\b/i },
    { id: 'magnetising by stroking', re: /\bstrok(?:e|ing)\b/i }
  ];

  // Electromagnetism-only markers. Used to filter out questions that are
  // solely about motors, transformers, induction, coils etc.
  var EM = [
    { id: 'motor', re: /\b(?:d\.?c\.? |electric |simple )?motor(?:s)?\b/i },
    { id: 'transformer', re: /\btransformer(?:s)?\b/i },
    { id: 'generator', re: /\bgenerator(?:s)?\b|\bdynamo\b/i },
    { id: 'electromagnetic induction', re: /\belectromagnetic induction\b|\binduced (?:e\.?m\.?f\.?|current|voltage)\b|\bfaraday\b|\blenz\b/i },
    { id: 'coil / solenoid', re: /\bcoil(?:s)?\b|\bsolenoid(?:s)?\b|\bturns?\b/i },
    { id: 'electromagnet', re: /\belectromagnet(?:s|ic|ism)?\b/i },
    { id: 'current-carrying conductor', re: /\bcurrent[- ]carrying\b|\bcurrent in (?:a|the) (?:wire|conductor|coil)\b|\bright[- ]hand (?:grip|rule)\b/i },
    { id: 'Fleming rule', re: /\bfleming\b|\bleft[- ]hand rule\b/i },
    { id: 'primary / secondary coil', re: /\bprimary (?:coil|winding)\b|\bsecondary (?:coil|winding)\b|\bstep[- ](?:up|down)\b/i },
    { id: 'e.m.f. / flux linkage', re: /\be\.?m\.?f\.?\b|\bflux linkage\b|\bmagnetic flux\b/i },
    { id: 'galvanometer / induced current', re: /\bgalvanometer\b|\binduced current\b/i }
  ];

  // Lines beginning with "<number> <unit>" are physical quantities, not question numbers.
  // Only unambiguous multi-character units are listed (single-letter units such
  // as "A" in "1 A student..." must NOT reject a genuine question line).
  var UNIT_LINE = /^\d{1,3}\s*(?:kN|cm|mm|km|kg|mg|ms|min|mV|mA|kW|kJ|kPa|Hz|Pa|ohms?|m\/s|cm3|m3|°C)\b/i;
  var FIGURE_LINE = /^(?:fig|figure|table|diagram|graph)\b/i;

  function matchIds(text, list) {
    var ids = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].re.test(text)) ids.push(list[i].id);
    }
    return ids;
  }

  /* ------------------------------------------------------------------ *
   * 2. Filename / component parsing
   * ------------------------------------------------------------------ */

  // Cambridge IGCSE 0625: components 41/42/43 = Paper 4 (Theory, Extended) variants 1/2/3.
  var COMPONENT_LABELS = {
    '41': '0625/41 (Paper 4, variant 1)',
    '42': '0625/42 (Paper 4, variant 2)',
    '43': '0625/43 (Paper 4, variant 3)'
  };

  function parseFilename(name) {
    var base = String(name || '');
    var result = {
      filename: base,
      syllabus: null,
      year: null,
      session: null,
      component: null,
      componentLabel: 'Not identifiable',
      docType: null
    };
    var m = /\b(\d{4})\s*[_\-. ]\s*([wsm])\s*(\d{2})\s*[_\-. ]\s*(qp|ms|gt|er|ci|in|sp)\s*[_\-. ]\s*(\d{2})\b/i.exec(base);
    if (m) {
      result.syllabus = m[1];
      result.year = 2000 + parseInt(m[3], 10);
      result.session = ({ w: 'October/November', s: 'May/June', m: 'March' })[m[2].toLowerCase()] || null;
      result.docType = m[4].toLowerCase();
      result.component = m[5];
      result.componentLabel = COMPONENT_LABELS[m[5]] || ('0625/' + m[5]);
      return result;
    }
    // Fallback: "0625_w25_qp_41" without separators, or "0625/41"
    var m2 = /\b0625\s*[_\-. ]?\s*[wsm]\d{2}\s*[_\-. ]?\s*qp\s*[_\-. ]?\s*(\d{2})\b/i.exec(base);
    if (m2) {
      result.syllabus = '0625';
      result.component = m2[1];
      result.componentLabel = COMPONENT_LABELS[m2[1]] || ('0625/' + m2[1]);
      result.docType = 'qp';
      return result;
    }
    var m3 = /\b0625\s*[/_\-.]\s*(4[123])\b/.exec(base);
    if (m3) {
      result.syllabus = '0625';
      result.component = m3[1];
      result.componentLabel = COMPONENT_LABELS[m3[1]];
      return result;
    }
    // Last resort: any 4x component token near "qp"
    var m4 = /\bqp[_ .\-]?(4[123])\b|\b(4[123])[_ .\-]?qp\b/i.exec(base);
    if (m4) {
      result.syllabus = '0625';
      result.component = m4[1] || m4[2];
      result.componentLabel = COMPONENT_LABELS[result.component];
      return result;
    }
    return result;
  }

  // Look for the component code printed in the page header, e.g. 0625/41/O/N/25.
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
    if (!m) m = /^(\d{1,2})\s*\([a-z]\)/.exec(t);              // 3 (a) ...
    // "2 Fig. 2.1 shows..." / "1 A student..." - require a real sentence after
    // the number so short quantities such as "10 N" or "2 A" are not counted.
    if (!m) m = /^(\d{1,2})\s+(?=[A-Z][A-Za-z0-9 ,.'’\-]{6,})/.exec(t);
    if (!m) m = /^(\d{1,2})\s*$/.exec(t);                       // number in its own column
    if (!m) return null;
    var n = parseInt(m[1], 10);
    if (n < 1 || n > 20) return null;
    if (/^\d{1,2}\s+(?:of|and|to|in|at|is|are|was|were)\b/i.test(t)) return null;
    return n;
  }

  // Detect question markers for one page, carrying the running number across pages.
  function detectQuestions(lines, lastNumber) {
    var markers = [];
    var last = lastNumber || 0;
    var footerStart = Math.max(0, lines.length - 3);
    for (var i = 0; i < lines.length; i++) {
      // A bare number near the bottom of a page is almost always the PRINTED
      // page number in the footer, not a question number.
      if (i >= footerStart && /^\s*\d{1,3}\s*$/.test(String(lines[i] || ''))) continue;
      var n = questionAtLine(lines[i]);
      if (n === null) continue;
      // Question numbers in a paper rise roughly sequentially. This rejects
      // stray quantities such as "12 N" or figure labels.
      if (n < last || n > last + 4) continue;
      last = n;
      markers.push({ line: i, number: n });
    }
    return { markers: markers, lastNumber: last };
  }

  function printedPageCandidate(lines) {
    var tail = lines.slice(-14);
    for (var i = tail.length - 1; i >= 0; i--) {
      var t = String(tail[i] || '').trim();
      if (!t) continue;
      var a = /^page\s+(\d{1,3})\b/i.exec(t);
      if (a) return parseInt(a[1], 10);
      var b = /^(\d{1,3})\s*\/\s*\d{1,3}$/.exec(t);
      if (b) return parseInt(b[1], 10);
      var c = /^(\d{1,3})$/.exec(t);
      if (c && !/turn over|uc les|uc|©/i.test(t)) {
        var n = parseInt(c[1], 10);
        if (n >= 1 && n <= 200) return n;
      }
    }
    return null;
  }

  // Only report printed page numbers when the candidates form a consistent
  // sequence (printed number - physical page is the same for most pages).
  function resolvePrintedPages(pages) {
    var offsets = [];
    for (var i = 0; i < pages.length; i++) {
      if (pages[i].printedCandidate !== null && pages[i].printedCandidate !== undefined) {
        offsets.push({ page: pages[i].pdfPage, offset: pages[i].printedCandidate - pages[i].pdfPage });
      }
    }
    if (offsets.length < 3) return { reliable: false, offset: null };
    var counts = {};
    var best = null, bestCount = 0;
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

  function classify(text) {
    var anchors = matchIds(text, ANCHORS);
    var weak = matchIds(text, WEAK);
    var em = matchIds(text, EM);
    var bucket, reason;

    if (anchors.length === 0) {
      if (em.length >= 1) {
        bucket = 'excluded';
        reason = 'Electromagnetism wording only (no basic-magnetism concept)';
      } else if (weak.length >= 2) {
        bucket = 'review';
        reason = 'Generic magnetism wording, no specific basic-magnetism concept';
      } else {
        bucket = 'excluded';
        reason = 'No magnetism wording detected';
      }
    } else if (em.length >= 2 && anchors.length <= 1) {
      bucket = 'review';
      reason = 'Also mentions electromagnetism (motor / coil / induction / transformer) - check whether it tests basic magnetism';
    } else if (em.length >= 3) {
      bucket = 'review';
      reason = 'Mixed basic-magnetism and electromagnetism wording';
    } else {
      bucket = 'match';
      reason = '';
    }

    return {
      bucket: bucket,
      reason: reason,
      anchors: anchors,
      weak: weak,
      em: em,
      terms: anchors.concat(weak.filter(function (w) { return anchors.indexOf(w) === -1; }))
    };
  }

  /* ------------------------------------------------------------------ *
   * 5. Document analysis
   * pages: [{ pdfPage: 1-based, lines: [string], text: string, ocr: bool }]
   * Returns: { hits: [...], excludedCount, pageCount, printedReliable }
   * ------------------------------------------------------------------ */

  function analyzeDocument(pages, meta) {
    meta = meta || {};
    var filename = meta.filename || 'unknown.pdf';
    var parsed = parseFilename(filename);
    var printed = resolvePrintedPages(pages);
    var textComp = componentFromText(pages);
    if (!parsed.component && textComp) {
      parsed.component = textComp;
      parsed.componentLabel = COMPONENT_LABELS[textComp] || ('0625/' + textComp);
      parsed.componentSource = 'PDF header';
    } else if (parsed.component) {
      parsed.componentSource = 'filename';
    }

    // Build question blocks for each page.
    var lastNumber = 0;
    var blocks = [];
    for (var p = 0; p < pages.length; p++) {
      var page = pages[p];
      var lines = page.lines || [];
      var dq = detectQuestions(lines, lastNumber);
      lastNumber = dq.lastNumber;
      var markers = dq.markers;
      var printedNo = printed.reliable ? (page.pdfPage + printed.offset) : null;
      var pageInfo = { pdfPage: page.pdfPage, printed: printedNo, ocr: !!page.ocr, lines: lines };

      var pageBlocks = [];
      if (markers.length === 0) {
        pageBlocks.push({
          pdfPage: page.pdfPage, printed: printedNo, ocr: !!page.ocr,
          qnum: null, continuation: (p > 0), sourceLines: lines.length,
          text: (page.text || lines.join('\n'))
        });
      } else {
        // Any text before the first question marker belongs to the previous
        // question (a question continuing from the previous page).
        if (markers[0].line > 0) {
          pageBlocks.push({
            pdfPage: page.pdfPage, printed: printedNo, ocr: !!page.ocr,
            qnum: null, continuation: true,
            sourceLines: markers[0].line,
            text: lines.slice(0, markers[0].line).join('\n')
          });
        }
        for (var b = 0; b < markers.length; b++) {
          var start = markers[b].line;
          var end = (b + 1 < markers.length) ? markers[b + 1].line : lines.length;
          pageBlocks.push({
            pdfPage: page.pdfPage, printed: printedNo, ocr: !!page.ocr,
            qnum: markers[b].number, continuation: false,
            sourceLines: end - start,
            text: lines.slice(start, end).join('\n')
          });
        }
      }
      for (var pb = 0; pb < pageBlocks.length; pb++) blocks.push(pageBlocks[pb]);
      pageInfo.markers = markers;
    }

    blocks.sort(function (a, b) { return a.pdfPage - b.pdfPage || 0; });

    // Classify blocks.
    var signals = [];
    for (var s = 0; s < blocks.length; s++) {
      var blk = blocks[s];
      var cls = classify(blk.text);
      if (cls.bucket === 'excluded') {
        if (cls.em.length > 0 || cls.weak.length > 0) {
          signals.push({ block: blk, cls: cls, bucket: 'excluded' });
        }
        continue;
      }
      signals.push({ block: blk, cls: cls, bucket: cls.bucket });
    }

    // Continuation: a block with no question number inherits the number of
    // the nearest earlier basic-magnetism signal on the previous page.
    for (var c = 0; c < signals.length; c++) {
      var sig = signals[c];
      if (sig.bucket === 'excluded') continue;
      if (sig.block.qnum !== null) continue;
      var inherited = null, inheritedPage = -1;
      for (var e = c - 1; e >= 0; e--) {
        var prev = signals[e];
        if (prev.bucket === 'excluded') continue;
        if (prev.block.qnum === null) continue;
        if (sig.block.pdfPage - prev.block.pdfPage <= 1) {
          inherited = prev.block.qnum;
          inheritedPage = prev.block.pdfPage;
          break;
        }
        break; // only look at the immediately preceding page
      }
      sig.block.qnum = inherited;
      if (inherited !== null && inheritedPage !== sig.block.pdfPage) {
        sig.block.continuation = true;
        sig.block.inheritedFromPage = inheritedPage;
      }
    }

    // Merge signals that belong to the same question across consecutive pages.
    var used = {};
    var hits = [];
    for (var h = 0; h < signals.length; h++) {
      if (used[h]) continue;
      var first = signals[h];
      var group = [first];
      used[h] = true;
      for (var g = h + 1; g < signals.length; g++) {
        if (used[g]) continue;
        var other = signals[g];
        if (other.bucket !== first.bucket) continue;
        if (other.block.qnum === null || first.block.qnum === null) continue;
        if (other.block.qnum !== first.block.qnum) continue;
        var maxPage = Math.max.apply(null, group.map(function (x) { return x.block.pdfPage; }));
        if (other.block.pdfPage > maxPage + 1) continue;
        group.push(other);
        used[g] = true;
      }

      var pageNos = [];
      var printedNos = [];
      var terms = {};
      var ocr = false, continuation = false, bucket = first.bucket;
      var reasons = [];
      for (var k = 0; k < group.length; k++) {
        var it = group[k];
        if (pageNos.indexOf(it.block.pdfPage) === -1) pageNos.push(it.block.pdfPage);
        if (it.block.printed !== null && it.block.printed !== undefined && printedNos.indexOf(it.block.printed) === -1) printedNos.push(it.block.printed);
        for (var t = 0; t < it.cls.terms.length; t++) terms[it.cls.terms[t]] = true;
        if (it.block.ocr) ocr = true;
        if (it.block.continuation || it.block.inheritedFromPage) continuation = true;
        if (it.cls.reason && reasons.indexOf(it.cls.reason) === -1) reasons.push(it.cls.reason);
      }
      pageNos.sort(function (a, b) { return a - b; });
      printedNos.sort(function (a, b) { return a - b; });

      var qnum = first.block.qnum;
      var uncertain = false;
      var uncertainReasons = [];
      if (bucket === 'review') {
        uncertain = true;
        uncertainReasons = reasons.length ? reasons : ['Needs review'];
      }
      if (qnum === null) { uncertain = true; uncertainReasons.push('Question number not identifiable'); }
      if (ocr) { uncertain = true; uncertainReasons.push('Text came from OCR (check the page image)'); }
      if (continuation) { uncertain = true; uncertainReasons.push('Question may continue across pages - verify the range'); }
      if (first.cls.anchors.length < 2) {
        uncertain = true;
        if (uncertainReasons.indexOf('Only one basic-magnetism keyword') === -1) uncertainReasons.push('Only one basic-magnetism keyword');
      }

      var label = pageNos.length === 1
        ? String(pageNos[0])
        : (pageNos[0] + '-' + pageNos[pageNos.length - 1]);
      var printedLabel = printedNos.length === 1
        ? String(printedNos[0])
        : (printedNos.length ? printedNos[0] + '-' + printedNos[printedNos.length - 1] : null);

      hits.push({
        id: filename + '|' + (qnum === null ? 'q?' : qnum) + '|' + label,
        filename: filename,
        component: parsed.component,
        componentLabel: parsed.componentLabel,
        componentSource: parsed.componentSource || null,
        syllabus: parsed.syllabus,
        year: parsed.year,
        session: parsed.session,
        question: qnum,
        questionLabel: qnum === null ? 'Not identifiable' : String(qnum),
        pages: pageNos,
        pageLabel: label,
        printedPages: printedNos,
        printedLabel: printedLabel,
        printedReliable: printed.reliable,
        terms: Object.keys(terms),
        bucket: bucket,
        uncertain: uncertain,
        uncertainReasons: uncertainReasons,
        ocr: ocr,
        continuation: continuation,
        confidence: (bucket === 'review') ? 'Low' : (uncertain ? 'Medium' : 'High'),
        review: 'unreviewed'
      });
    }

    hits.sort(function (a, b) {
      return a.filename.localeCompare(b.filename) || (a.pages[0] - b.pages[0]) || ((a.question || 0) - (b.question || 0));
    });

    return {
      hits: hits,
      pageCount: pages.length,
      printedReliable: printed.reliable,
      component: parsed.component,
      componentLabel: parsed.componentLabel
    };
  }

  return {
    parseFilename: parseFilename,
    componentFromText: componentFromText,
    questionAtLine: questionAtLine,
    detectQuestions: detectQuestions,
    printedPageCandidate: printedPageCandidate,
    resolvePrintedPages: resolvePrintedPages,
    classify: classify,
    analyzeDocument: analyzeDocument,
    ANCHORS: ANCHORS, WEAK: WEAK, EM: EM
  };
});
