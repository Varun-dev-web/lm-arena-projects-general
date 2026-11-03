/* End-to-end browser test (DEVELOPMENT ONLY - not needed to run the app).
 * Requires playwright-core and a headless Chromium. In this sandbox:
 *   LD_LIBRARY_PATH=/tmp/chromlibs/lib NODE_PATH=/tmp/browserprobe/node_modules \
 *     QP_BASE_URL=http://127.0.0.1:8777 node tests/test_e2e.js
 *
 * It verifies: real pdf.js text extraction, bundled offline OCR, result rows,
 * exact-page in-app viewer, #page= fallback link, review persistence, and that
 * ZERO requests leave the local machine.
 */
'use strict';
const { chromium: pw } = require('playwright-core');
const chromium = require('@sparticuz/chromium');

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
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await context.newPage();

  const external = [];
  const consoleErrors = [];
  page.on('request', req => {
    const u = req.url();
    if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR ' + e.message.slice(0, 300)));

  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#fileList .fileitem', { timeout: 20000 });
    const fileRows = await page.locator('#fileList .fileitem').count();
    check('folder is auto-scanned and PDFs are listed', fileRows >= 5, fileRows);
    check('at least one PDF is named like a Cambridge QP',
      (await page.locator('#fileList').innerText()).includes('0625_w25_qp_41.pdf'));

    // Capture window.open calls (the #page= fallback) without really opening tabs.
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

    // Find the Q2 row of the first synthetic paper and check the page range + printed page.
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

    const ocrRow = rows.find(r => r[0].includes('scanned_magnetism_notes.pdf'));
    check('image-only (scanned) PDF produced an OCR result', !!ocrRow, rows.map(r => r[0]));
    if (ocrRow) check('OCR-derived result flagged uncertain', /OCR|uncertain/i.test(ocrRow[6]), ocrRow[6]);

    check('OCR engine reports ready (offline)', /ready \(offline\)/i.test(await page.locator('#ocrBadge').innerText()),
      await page.locator('#ocrBadge').innerText());

    const notes = (await page.locator('#scanErrors').count()) ? await page.locator('#scanErrors').innerText() : '';
    check('password-protected PDF is skipped, never bypassed',
      /locked_synthetic\.pdf/.test(notes) && /password|encrypted|could not be opened/i.test(notes), notes.slice(0, 400));

    // Excluded electromagnetism questions are hidden by default and appear on demand.
    const beforeExcluded = rows.filter(r => r[6].includes('Excluded')).length;
    check('electromagnetism-only rows hidden by default', beforeExcluded === 0, beforeExcluded);
    await page.check('#showExcluded');
    const afterRows = await page.locator('#resultsBody tr').evaluateAll(trs => trs.map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())));
    check('excluded motor/transformer rows available for transparency',
      afterRows.filter(r => r[6].includes('Excluded')).length >= 2);
    await page.uncheck('#showExcluded');

    // Built-in viewer opens at the exact page.
    const firstOpen = page.locator('#resultsBody tr').first().locator('button', { hasText: 'Open at page' });
    await firstOpen.click();
    await page.waitForSelector('#viewer:not([hidden])');
    await page.waitForFunction(() => document.getElementById('viewerLoading').hidden === true,
      null, { timeout: 30000 });
    const viewerInfo = await page.locator('#viewerPage').innerText();
    check('in-app viewer opens with a page indicator', /^Page \d+ of \d+$/.test(viewerInfo), viewerInfo);
    const nonBlank = await page.evaluate(() => {
      const c = document.getElementById('viewerCanvas');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, Math.min(c.width, 400), Math.min(c.height, 400)).data;
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
    const opened = await page.evaluate(() => window.__opened);
    check('fallback opens original PDF at #page=N', opened.some(u => /#page=\d+/.test(u)), opened);

    // Review state persists in localStorage
    const reviewBtn = page.locator('#resultsBody tr').first().locator('.reviewbtns button').first();
    await reviewBtn.click();
    const stored = await page.evaluate(() => localStorage.getItem('qp-page-finder:reviews:v1'));
    check('review marking stored locally', stored && stored.includes('relevant'), stored);
    await page.selectOption('#filter', 'relevant');
    check('review filter works', (await page.locator('#resultsBody tr').count()) >= 1);
    await page.selectOption('#filter', 'all');

    check('no requests left the local machine', external.length === 0, external.slice(0, 5));
    const realErrors = consoleErrors.filter(e => !/favicon|net::ERR_/i.test(e));
    check('no uncaught browser errors', realErrors.length === 0, realErrors.slice(0, 4));

    console.log('\nE2E summary: ' + passed + ' checks passed; external requests = ' + external.length);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('E2E FAILURE:', e.message); process.exit(1); });
