/* Unit tests for the analysis engine. Run with:  node tests/test_analyze.js
 * No dependencies, no network, no real question papers.
 */
'use strict';
const assert = require('assert');
const A = require('../web/analyze.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { console.error('  FAIL  ' + name + '\n        ' + e.message); process.exitCode = 1; }
}

/* ---------- filename / component parsing ---------- */
test('parseFilename: standard Cambridge QP name', () => {
  const p = A.parseFilename('0625_w25_qp_41.pdf');
  assert.strictEqual(p.syllabus, '0625');
  assert.strictEqual(p.year, 2025);
  assert.strictEqual(p.session, 'October/November');
  assert.strictEqual(p.component, '41');
  assert.match(p.componentLabel, /Paper 4, variant 1/);
  assert.strictEqual(p.docType, 'qp');
});
test('parseFilename: components 42 and 43 and older years', () => {
  assert.strictEqual(A.parseFilename('0625_w24_qp_42.pdf').component, '42');
  assert.strictEqual(A.parseFilename('0625_w21_qp_43.PDF').component, '43');
  assert.strictEqual(A.parseFilename('0625_w22_qp_43.pdf').year, 2022);
});
test('parseFilename: mark schemes are not mislabelled as question papers', () => {
  assert.strictEqual(A.parseFilename('0625_w23_ms_41.pdf').docType, 'ms');
});
test('parseFilename: unknown name stays unidentified', () => {
  assert.strictEqual(A.parseFilename('my_scan.pdf').component, null);
  assert.strictEqual(A.parseFilename('my_scan.pdf').componentLabel, 'Not identifiable');
});
test('componentFromText: reads printed header 0625/43/O/N/25', () => {
  assert.strictEqual(A.componentFromText([{ text: '0625/43/O/N/25\nSome text' }]), '43');
});

/* ---------- classification ---------- */
test('classify: basic magnetism with compass + bar magnet is a match', () => {
  const r = A.classify('A student has a bar magnet and a compass. State which pole of the compass points towards the north pole.');
  assert.strictEqual(r.bucket, 'match');
  assert.ok(r.anchors.includes('compass'));
  assert.ok(r.anchors.includes('bar / horseshoe magnet'));
  assert.ok(r.anchors.includes('north / south pole'));
});
test('classify: induced / permanent magnetism and magnetic materials', () => {
  const r = A.classify('Explain the difference between a permanent magnet and an induced magnet. Name two magnetic materials.');
  assert.strictEqual(r.bucket, 'match');
  assert.ok(r.anchors.includes('permanent magnet'));
  assert.ok(r.anchors.includes('induced magnetism'));
  assert.ok(r.anchors.includes('magnetic material'));
});
test('classify: magnetisation / demagnetisation / stroking', () => {
  const r = A.classify('Describe how a steel bar can be magnetised by stroking and later demagnetised.');
  assert.strictEqual(r.bucket, 'match');
  assert.ok(r.anchors.includes('magnetisation'));
});
test('classify: motor-only question is EXCLUDED', () => {
  const r = A.classify('Fig. 3.1 shows a d.c. motor with a coil in a magnetic field. State the direction of the force on the coil.');
  assert.strictEqual(r.bucket, 'excluded');
  assert.ok(r.em.includes('motor'));
  assert.ok(r.em.length >= 1);
});
test('classify: transformer-only question is EXCLUDED', () => {
  const r = A.classify('A transformer has a primary coil and a secondary coil. Calculate the output voltage.');
  assert.strictEqual(r.bucket, 'excluded');
});
test('classify: induction-only question is EXCLUDED', () => {
  const r = A.classify('A coil is connected to a galvanometer. Explain the induced current and the induced e.m.f. by electromagnetic induction.');
  assert.strictEqual(r.bucket, 'excluded');
});
test('classify: "electromagnetic" must NOT count as basic magnetism', () => {
  const r = A.classify('The electromagnetic spectrum contains radio waves and gamma rays.');
  assert.strictEqual(r.bucket, 'excluded');
  assert.strictEqual(r.anchors.length, 0);
});
test('classify: mixed magnet + induction is flagged for REVIEW, not silently included', () => {
  const r = A.classify('A bar magnet is moved into a coil connected to a galvanometer. Explain the induced e.m.f. produced by electromagnetic induction.');
  assert.strictEqual(r.bucket, 'review');
  assert.ok(r.reason.includes('electromagnetism'));
});
test('classify: generic magnetism wording with no anchor is REVIEW', () => {
  const r = A.classify('The magnetic field near the object is strong and the poles attract.');
  assert.strictEqual(r.bucket, 'review');
});

/* ---------- question numbers ---------- */
test('questionAtLine: bare / bracketed / "2 Fig." / Question 5', () => {
  assert.strictEqual(A.questionAtLine('3'), 3);
  assert.strictEqual(A.questionAtLine('4 (a) State the value'), 4);
  assert.strictEqual(A.questionAtLine('2 Fig. 2.1 shows a circuit'), 2);
  assert.strictEqual(A.questionAtLine('Question 5'), 5);
});
test('questionAtLine: physical quantities / figure labels are NOT question numbers', () => {
  assert.strictEqual(A.questionAtLine('10 N'), null);
  assert.strictEqual(A.questionAtLine('2.1 The diagram'), null);
  assert.strictEqual(A.questionAtLine('Fig. 2.1'), null);
  assert.strictEqual(A.questionAtLine('5 cm of wire'), null);
});
test('detectQuestions: monotonic guard rejects stray numbers', () => {
  const lines = ['1 A student measures', '2 (a) State', '12 N', '2 (b) Explain', '3 The final part'];
  const r = A.detectQuestions(lines, 0);
  assert.deepStrictEqual(r.markers.map(m => m.number), [1, 2, 2, 3]);
  assert.strictEqual(r.lastNumber, 3);
});

/* ---------- printed page numbers ---------- */
test('printedPageCandidate: bare footer number / "Page 7" / "7 / 12"', () => {
  assert.strictEqual(A.printedPageCandidate(['some text', '© UCLES 2025 0625/41/O/N/25 [Turn over', '7']), 7);
  assert.strictEqual(A.printedPageCandidate(['body', 'Page 7']), 7);
  assert.strictEqual(A.printedPageCandidate(['body', '7 / 12']), 7);
});
test('resolvePrintedPages: consistent offset is reliable', () => {
  const pages = [1, 2, 3, 4].map(n => ({ pdfPage: n, printedCandidate: n + 1 }));
  const r = A.resolvePrintedPages(pages);
  assert.strictEqual(r.reliable, true);
  assert.strictEqual(r.offset, 1);
});
test('resolvePrintedPages: too few / inconsistent candidates are NOT reliable', () => {
  assert.strictEqual(A.resolvePrintedPages([{ pdfPage: 1, printedCandidate: 4 }]).reliable, false);
  assert.strictEqual(A.resolvePrintedPages([
    { pdfPage: 1, printedCandidate: 1 }, { pdfPage: 2, printedCandidate: 9 },
    { pdfPage: 3, printedCandidate: 3 }, { pdfPage: 4, printedCandidate: 22 }
  ]).reliable, false);
});

/* ---------- full document analysis ---------- */
function pg(n, lines, printed, ocr) {
  return { pdfPage: n, lines: lines, text: lines.join('\n'), printedCandidate: printed, ocr: !!ocr };
}

test('analyzeDocument: component, question number, physical and printed pages', () => {
  const pages = [
    pg(1, ['INSTRUCTIONS', 'Answer all questions.', '3'], 2),
    pg(2, ['1 A car travels at constant speed.', '2 A student has a bar magnet and a compass.',
           'State which pole of the compass points towards the north pole of the magnet.',
           'Describe the magnetic field pattern around a bar magnet.', '4'], 3),
    pg(3, ['5 Explain the difference between a permanent magnet and an induced magnet.',
           'Describe how a plotting compass can be used to find the field pattern.', '6'], 4),
  ];
  const r = A.analyzeDocument(pages, { filename: '0625_w25_qp_41.pdf' });
  assert.strictEqual(r.component, '41');
  assert.strictEqual(r.printedReliable, true);
  const q2 = r.hits.find(h => h.question === 2 && h.bucket !== 'excluded');
  assert.ok(q2, 'Q2 basic magnetism hit exists');
  assert.strictEqual(q2.pageLabel, '2');
  assert.strictEqual(q2.printedLabel, '3');
  assert.strictEqual(q2.componentLabel, '0625/41 (Paper 4, variant 1)');
  assert.ok(q2.terms.includes('compass'));
  const q5 = r.hits.find(h => h.question === 5 && h.bucket !== 'excluded');
  assert.ok(q5, 'Q5 basic magnetism hit exists');
  assert.strictEqual(q5.printedLabel, '4');
});

test('analyzeDocument: question continuing across pages becomes a page RANGE, flagged uncertain', () => {
  const pages = [
    pg(1, ['INSTRUCTIONS', 'Answer all questions.', '1'], 1),
    pg(2, ['2 A student has a bar magnet and a compass.',
           'State which pole of the compass points towards the north pole.', '2'], 2),
    pg(3, ['Name two magnetic materials that can be magnetised by stroking with a permanent magnet.',
           '3 Describe a transformer.', '3'], 3),
  ];
  const r = A.analyzeDocument(pages, { filename: '0625_w24_qp_42.pdf' });
  const cont = r.hits.find(h => h.continuation && h.bucket !== 'excluded');
  assert.ok(cont, 'continuation hit exists');
  assert.strictEqual(cont.question, 2);
  assert.ok(cont.pages.includes(2) && cont.pages.includes(3));
  assert.strictEqual(cont.uncertain, true);
  assert.ok(cont.uncertainReasons.some(x => x.includes('continue')));
});

test('analyzeDocument: OCR-derived matches are flagged uncertain', () => {
  const pages = [
    pg(1, ['A compass is placed near a bar magnet.', 'The north pole points along the magnetic field lines.'], 1, true),
    pg(2, ['A compass is placed near a bar magnet.'], 2, true),
    pg(3, ['A compass is placed near a bar magnet.'], 3, true),
  ];
  const r = A.analyzeDocument(pages, { filename: 'scanned_magnetism_notes.pdf' });
  assert.ok(r.hits.length > 0);
  const h = r.hits.find(x => x.bucket !== 'excluded');
  assert.strictEqual(h.ocr, true);
  assert.strictEqual(h.uncertain, true);
  assert.ok(h.uncertainReasons.some(x => x.includes('OCR')));
  assert.strictEqual(h.componentLabel, 'Not identifiable');
});

test('analyzeDocument: printed page is blank when sequence cannot be verified', () => {
  const pages = [pg(1, ['A compass is near a bar magnet.'], null)];
  const r = A.analyzeDocument(pages, { filename: 'x.pdf' });
  assert.strictEqual(r.printedReliable, false);
  assert.strictEqual(r.hits.find(h => h.bucket !== 'excluded').printedLabel, null);
});

test('analyzeDocument: motor/transformer questions are separated as excluded', () => {
  const pages = [
    pg(1, ['INSTRUCTIONS', '1'], 1),
    pg(2, ['1 Fig 1.1 shows a d.c. motor with a coil in a magnetic field.',
           'State the direction of the force on the coil.', '2'], 2),
    pg(3, ['2 A transformer has a primary coil and a secondary coil.',
           'Calculate the output voltage.', '3'], 3),
  ];
  const r = A.analyzeDocument(pages, { filename: '0625_w23_qp_43.pdf' });
  const excluded = r.hits.filter(h => h.bucket === 'excluded');
  assert.ok(excluded.length >= 2, 'motor and transformer questions excluded');
  assert.strictEqual(r.hits.filter(h => h.bucket === 'match').length, 0);
});

console.log('\n' + passed + ' assertions groups passed.');
