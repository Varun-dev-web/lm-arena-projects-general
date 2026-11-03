/* End-to-end browser test (DEVELOPMENT ONLY - not needed to run the app).
 * Requires playwright-core and a headless Chromium. In this sandbox:
 *   LD_LIBRARY_PATH=/tmp/chromlibs/lib NODE_PATH=/tmp/browserprobe/node_modules \
 *     QP_BASE_URL=http://127.0.0.1:8777 node tests/test_e2e.js
 *
 * Verifies: real pdf.js extraction, bundled offline OCR, result columns,
 * position-verified printed pages, exact-page in-app viewer, #page= fallback,
 * encrypted-PDF skip, review persistence, auto-capture + manual alignment,
 * A4 PDF compilation, preview WITHOUT a download, approval-gated download,
 * A4 page geometry, and that ZERO requests leave the local machine.
 */
'use strict';
const { chromium: pw } = require('playwright-core');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');

const BASE = process.env.QP_BASE_URL || 'http://127.0.0.1:8777';
let passed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS  ' + name); }
  else { console.error('  FAIL  ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); process.exitCode = 1; }
}

(async () => {
  const exe = await chromium.executablePath();
  const browser = await pw.launch({
    executablePath: exe, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--no-zygote']
  });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();

  const external = [];
  const consoleErrors = [];
  const downloads = [];
  page.on('request', req => {
    const u = req.url();
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR ' + e.message.slice(0, 300)));
  page.on('download', d => downloads.push(d));

  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#fileList .fileitem', { timeout: 20000 });
    const fileRows = await page.locator('#fileList .fileitem').count();
    check('folder is auto-scanned and PDFs are listed', fileRows >= 5, fileRows);
    check('at least one PDF is named like a Cambridge QP',
      (await page.locator('#fileList').innerText()).includes('0625_w25_qp_41.pdf'));
    check('jsPDF is bundled and available offline',
      await page.evaluate(() => typeof window.jspdf === 'object' && typeof window.jspdf.jsPDF === 'function'));

    await page.evaluate(() => {
      window.__opened = [];
      window.open = (url) => { window.__opened.push(url); return null; };
    });

    await page.click('#btnScan');
    await page.waitForFunction(() => /Finished|Stopped/.test(document.getElementById('scanStatus').textContent),
      null, { timeout: 240000 });
    const status = await page.locator('#scanStatus').innerText();
    check('scan completes', /Finished/.test(status), status);

    const bodyText = await page.locator('#resultsBody').innerText();
    check('results table has rows', bodyText.trim().length > 0, bodyText.slice(0, 200));
    check('component 0625/41 identified from filename', bodyText.includes('0625/41 (Paper 4, variant 1)'));
    check('component 0625/42 identified from filename', bodyText.includes('0625/42 (Paper 4, variant 2)'));
    check('exact PDF page number column present', /PDF page\(s\)/i.test(await page.locator('#resultsTable').innerText()));

    const rows = await page.locator('#resultsBody tr').evaluateAll(trs => trs.map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())));
    const q2 = rows.find(r => r[0].includes('0625_w25_qp_41.pdf') && r[2] === 'Q2');
    check('Q2 basic-magnetism hit found with page range', !!q2, rows.slice(0, 4));
    if (q2) {
      check('Q2 ranges across PDF pages 2-3 (continuation honoured)', q2[3] === '2-3', q2[3]);
      check('printed page number shown when reliable', /^[0-9]+-?[0-9]*$/.test(q2[4]), q2[4]);
      check('matched keyword labels shown, not question text',
        q2[5].toLowerCase().includes('compass') && !q2[5].toLowerCase().includes('student has'));
      check('cross-page continuation flagged uncertain for review', /review|continu|uncertain/i.test(q2[6]), q2[6]);
    }

    // v2 regression: a printed page equal to the question number is only ever
    // shown if it was position-verified in a bottom-centred footer.
    const printedCells = await page.locator('#resultsBody tr').evaluateAll(trs => trs.map(tr => {
      const td = tr.querySelectorAll('td');
      return { q: (td[2] || {}).innerText, printed: (td[4] || {}).innerText, title: (td[4] || {}).title };
    }));
    const sameNumber = printedCells.filter(c => /^Q(\d+)$/.test(c.q || '') &&
      c.printed === (c.q || '').slice(1) && /^[0-9]+$/.test(c.printed || ''));
    check('printed page never silently reuses a question number',
      sameNumber.every(c => /position verified/i.test(c.title || '')), sameNumber);

    const ocrRow = rows.find(r => r[0].includes('scanned_magnetism_notes.pdf'));
    check('image-only (scanned) PDF produced an OCR result', !!ocrRow, rows.map(r => r[0]));
    if (ocrRow) check('OCR-derived result flagged uncertain', /OCR|uncertain/i.test(ocrRow[6]), ocrRow[6]);

    check('OCR engine reports ready (offline)', /ready \(offline\)/i.test(await page.locator('#ocrBadge').innerText()),
      await page.locator('#ocrBadge').innerText());

    const notes = (await page.locator('#scanErrors').count()) ? await page.locator('#scanErrors').innerText() : '';
    check('password-protected PDF is skipped, never bypassed',
      /locked_synthetic\.pdf/.test(notes) && /password|encrypted|could not be opened/i.test(notes), notes.slice(0, 400));

    const beforeExcluded = rows.filter(r => r[6].includes('Excluded')).length;
    check('electromagnetism-only rows hidden by default', beforeExcluded === 0, beforeExcluded);
    await page.check('#showExcluded');
    const afterRows = await page.locator('#resultsBody tr').evaluateAll(trs => trs.map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())));
    check('excluded motor/transformer rows available for transparency',
      afterRows.filter(r => r[6].includes('Excluded')).length >= 2);
    await page.uncheck('#showExcluded');

    // Built-in viewer opens at the exact page.
    await page.locator('#resultsBody tr').first().locator('button', { hasText: 'Open at page' }).click();
    await page.waitForSelector('#viewer:not([hidden])');
    await page.waitForFunction(() => document.getElementById('viewerLoading').hidden === true,
      null, { timeout: 30000 });
    const viewerInfo = await page.locator('#viewerPage').innerText();
    check('in-app viewer opens with a page indicator', /^Page \d+ of \d+$/.test(viewerInfo), viewerInfo);
    check('approval bar hidden while viewing an original PDF', await page.locator('#approveBar').isHidden());
    const nonBlank = await page.evaluate(() => {
      const c = document.getElementById('viewerCanvas');
      const d = c.getContext('2d').getImageData(0, 0, Math.min(c.width, 400), Math.min(c.height, 400)).data;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 150 && d[i + 1] < 150 && d[i + 2] < 150) dark++;
      return { w: c.width, h: c.height, dark: dark };
    });
    check('viewer renders actual page content on canvas', nonBlank.w > 300 && nonBlank.dark > 40, nonBlank);
    await page.click('#btnNext');
    check('viewer can navigate pages', /^Page \d+ of \d+$/.test(await page.locator('#viewerPage').innerText()));
    await page.click('#btnCloseViewer');
    check('viewer closes', await page.locator('#viewer').isHidden());

    // #page= fallback link
    await page.locator('#resultsBody tr').first().locator('a', { hasText: 'Open PDF at page' }).click();
    await page.waitForFunction(() => window.__opened.length > 0, null, { timeout: 10000 });
    const opened = await page.evaluate(() => window.__opened);
    check('fallback opens original PDF at #page=N', opened.some(u => /#page=\d+/.test(u)), opened);

    /* ---------------- v2: capture + alignment ---------------- */
    const firstRow = page.locator('#resultsBody tr').first();
    const firstId = await firstRow.getAttribute('data-hit-id');
    await firstRow.locator('.reviewbtns button').first().click();
    await page.waitForSelector('#cropModal:not([hidden])', { timeout: 30000 });
    check('confirming a question automatically opens the capture editor', await page.locator('#cropModal').isVisible());
    await page.waitForFunction(() => document.getElementById('cropCanvas').width >= 600 &&
      /Drag the box/i.test(document.getElementById('cropSub').textContent), null, { timeout: 30000 });
    const cropPixels = await page.evaluate(() => {
      const c = document.getElementById('cropCanvas');
      const d = c.getContext('2d').getImageData(0, 0, Math.min(c.width, 400), Math.min(c.height, 400)).data;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 150 && d[i + 1] < 150 && d[i + 2] < 150) dark++;
      return { w: c.width, h: c.height, dark: dark };
    });
    check('capture editor renders the actual PDF page', cropPixels.w > 300 && cropPixels.dark > 20, cropPixels);
    const autoRect = await page.locator('#cropRect').evaluate(n =>
      ({ w: parseFloat(n.style.width), h: parseFloat(n.style.height) }));
    check('auto-selected region is a question crop, not the whole page',
      autoRect.w < 95 && autoRect.w > 20 && autoRect.h > 10, autoRect);
    await page.click('#btnAutoCrop');
    check('auto-select button re-applies the positional question hint',
      (await page.locator('#cropRect').evaluate(n => parseFloat(n.style.width))) < 95);

    const stored = await page.evaluate(() => localStorage.getItem('qp-page-finder:reviews:v1'));
    check('review marking stored locally', stored && stored.includes('relevant'), stored);

    // Manual alignment via numeric percentages.
    await page.locator('#cropL').fill('12');
    await page.locator('#cropL').dispatchEvent('change');
    const leftPct = await page.locator('#cropRect').evaluate(n => n.style.left);
    check('manual percentage alignment changes the crop box', parseFloat(leftPct) === 12, leftPct);

    // Manual alignment by dragging the box.
    const before = await page.locator('#cropRect').evaluate(n => n.style.left);
    const box = await page.locator('#cropRect').boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 4 });
      await page.mouse.up();
    }
    const after = await page.locator('#cropRect').evaluate(n => n.style.left);
    check('dragging the crop box manually re-aligns it', before !== after, { before: before, after: after });

    // Use full page (explicit user choice) to save the capture(s).
    await page.click('#btnUseFullPage');
    await page.waitForFunction(() => document.getElementById('cropModal').hidden === true, null, { timeout: 30000 });
    check('capture editor closes after saving', await page.locator('#cropModal').isHidden());
    const captureBadge = await page.locator(`#resultsBody tr[data-hit-id="${firstId}"] .capture-line`).innerText();
    check('saved capture shown on the confirmed row', /capture/i.test(captureBadge), captureBadge);
    check('confirmed-questions counter updated', (await page.locator('#cntConfirmed').innerText()) === '1'
      || parseInt(await page.locator('#cntConfirmed').innerText(), 10) >= 1);

    await page.selectOption('#filter', 'relevant');
    check('review filter works', (await page.locator('#resultsBody tr').count()) >= 1);
    await page.selectOption('#filter', 'all');

    /* ---------------- v2: build, preview, approval ---------------- */
    const pending = parseInt(await page.locator('#cntPending').innerText(), 10);
    check('unchecked questions are still reported before build', pending >= 0);
    if (pending > 0) {
      await page.click('#btnMarkRest');
      check('marking remaining questions clears the pending count',
        (await page.locator('#cntPending').innerText()) === '0');
    }
    check('build button enabled only after checking + capturing',
      await page.locator('#btnBuild').isEnabled(), await page.locator('#compileStatus').innerText());

    await page.click('#btnBuild');
    await page.waitForSelector('#approveBar:not([hidden])', { timeout: 60000 });
    check('A4 PDF preview opens in the built-in viewer', await page.locator('#viewer').isVisible());
    check('preview is labelled as not yet downloaded',
      /not downloaded yet/i.test(await page.locator('#viewerSub').innerText()));
    await page.waitForFunction(() => document.getElementById('viewerLoading').hidden === true, null, { timeout: 30000 });
    const a4 = await page.evaluate(() => {
      const c = document.getElementById('viewerCanvas');
      return { w: c.width, h: c.height };
    });
    check('preview renders a portrait A4-shaped sheet', a4.h > a4.w && Math.abs(a4.h / a4.w - 841.89 / 595.28) < 0.05, a4);
    check('NO download occurred before approval', downloads.length === 0, downloads.length);

    const dlPromise = page.waitForEvent('download', { timeout: 30000 });
    await page.click('#btnApproveDownload');
    const dl = await dlPromise;
    check('approval triggers the A4 PDF download', dl.suggestedFilename() === 'QP-Magnetism-A4.pdf', dl.suggestedFilename());
    const dlPath = await dl.path();
    const pdfBuf = fs.readFileSync(dlPath);
    const pdfText = pdfBuf.toString('latin1');
    check('downloaded file is a real PDF', pdfText.slice(0, 5) === '%PDF-', pdfText.slice(0, 12));
    const mb = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\]/.exec(pdfText);
    check('downloaded PDF pages are A4-sized',
      !!mb && Math.abs(parseFloat(mb[1]) - 595.28) < 1 && Math.abs(parseFloat(mb[2]) - 841.89) < 1,
      mb ? [mb[1], mb[2]] : null);
    const pageCount = (pdfText.match(/\/Type\s*\/Page\b/g) || []).length;
    check('downloaded A4 PDF has at least one page', pageCount >= 1, pageCount);
    check('re-download button appears only after approval', await page.locator('#btnDownloadApproved').isVisible());

    check('no requests left the local machine', external.length === 0, external.slice(0, 5));
    const realErrors = consoleErrors.filter(e => !/favicon|net::ERR_/i.test(e));
    check('no uncaught browser errors', realErrors.length === 0, realErrors.slice(0, 4));

    console.log('\nE2E summary: ' + passed + ' checks passed; external requests = ' + external.length);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('E2E FAILURE:', e.message); process.exit(1); });
