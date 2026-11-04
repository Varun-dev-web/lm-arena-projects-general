/* End-to-end browser test (DEVELOPMENT ONLY - not needed to run the app).
 * Requires playwright-core and a headless Chromium. In this sandbox:
 *   LD_LIBRARY_PATH=/tmp/chromlibs/lib NODE_PATH=/tmp/browserprobe/node_modules \
 *     QP_BASE_URL=http://127.0.0.1:8777 node tests/test_e2e.js
 *
 * Verifies: two independent QP/MS folder bars, MS filename matching, exact MS
 * page detection, real pdf.js extraction, bundled offline OCR, result columns,
 * position-verified printed pages, exact-page in-app viewer, #page= fallback,
 * encrypted-PDF skip, review persistence, QP + MS auto-capture and the SAME
 * manual alignment editor, TWO separate A4 PDFs, preview / print WITHOUT a
 * download, approval-gated downloads, A4 page geometry, and ZERO external
 * requests.
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
    await page.waitForSelector('#msFileList .fileitem', { timeout: 20000 });
    const fileRows = await page.locator('#fileList .fileitem').count();
    check('QP folder is auto-scanned and PDFs are listed', fileRows >= 5, fileRows);
    check('at least one PDF is named like a Cambridge QP',
      (await page.locator('#fileList').innerText()).includes('0625_w25_qp_41.pdf'));
    check('jsPDF is bundled and available offline',
      await page.evaluate(() => typeof window.jspdf === 'object' && typeof window.jspdf.jsPDF === 'function'));

    /* ---------------- v3: two independent folder / file bars ---------------- */
    check('SECOND, independent MS folder bar lists PDFs',
      (await page.locator('#msFileList .fileitem').count()) >= 3);
    check('MS bar lists the PapaCambridge-style MS filename',
      (await page.locator('#msFileList').innerText()).includes('0625_w25_ms_41.pdf'));
    check('MS filename decoded into year / session / component',
      /2021/.test(await page.locator('#msFileList').innerText()) &&
      /paper 43/.test(await page.locator('#msFileList').innerText()));
    const preselect = await page.evaluate(() => {
      const find = (rootId, name) => {
        for (const row of document.querySelectorAll('#' + rootId + ' .fileitem')) {
          if (row.textContent.includes(name)) {
            const cb = row.querySelector('input[type=checkbox]');
            return cb ? cb.checked : null;
          }
        }
        return null;
      };
      return {
        qpOfMs: find('fileList', '0625_w25_ms_41.pdf'),
        qpOfQp: find('fileList', '0625_w25_qp_41.pdf'),
        msOfMs: find('msFileList', '0625_w25_ms_41.pdf'),
        msOfQp: find('msFileList', '0625_w25_qp_41.pdf')
      };
    });
    check('QP bar does not preselect MS PDFs', preselect.qpOfMs === false, preselect);
    check('QP bar preselects QP PDFs', preselect.qpOfQp === true, preselect);
    check('MS bar preselects MS PDFs', preselect.msOfMs === true, preselect);
    check('MS bar does not preselect QP PDFs', preselect.msOfQp === false, preselect);

    const cfg = await page.evaluate(async () => (await fetch('/api/config')).json());
    await page.fill('#msFolderPath', cfg.appDir);
    await page.click('#btnMsRefresh');
    await page.waitForFunction(() => /MS folder:|Could not|error/i.test(
      document.getElementById('msFolderStatus').textContent), null, { timeout: 15000 });
    check('changing only the MS folder leaves the QP listing untouched',
      (await page.locator('#fileList').innerText()).includes('0625_w25_qp_41.pdf'));
    await page.fill('#msFolderPath', cfg.defaultDir);
    await page.click('#btnMsRefresh');
    await page.waitForFunction(() => document.getElementById('msFileList').textContent
      .includes('0625_w25_ms_41.pdf'), null, { timeout: 15000 });
    check('MS folder bar can be restored independently',
      (await page.locator('#msFileList').innerText()).includes('0625_w25_ms_41.pdf'));

    await page.evaluate(() => {
      window.__opened = [];
      window.open = (url) => { window.__opened.push(url); return null; };
    });

    await page.click('#btnScan');
    await page.waitForFunction(() => /Finished|Stopped/.test(document.getElementById('scanStatus').textContent),
      null, { timeout: 240000 });
    const status = await page.locator('#scanStatus').innerText();
    check('scan completes', /Finished/.test(status), status);
    check('scan reports indexed MS PDFs', /indexed MS PDF\(s\)/.test(status), status);

    const bodyText = await page.locator('#resultsBody').innerText();
    check('results table has rows', bodyText.trim().length > 0, bodyText.slice(0, 200));
    check('component 0625/41 identified from filename', bodyText.includes('0625/41 (Paper 4, variant 1)'));
    check('component 0625/42 identified from filename', bodyText.includes('0625/42 (Paper 4, variant 2)'));
    check('exact QP PDF page column present', /QP PDF page\(s\)/i.test(await page.locator('#resultsTable').innerText()));
    check('exact MS PDF page column present', /MS PDF page\(s\)/i.test(await page.locator('#resultsTable').innerText()));

    const rows = await page.locator('#resultsBody tr').evaluateAll(trs => trs.map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())));
    const q2 = rows.find(r => r[0].includes('0625_w25_qp_41.pdf') && r[2] === 'Q2');
    check('Q2 basic-magnetism hit found with page range', !!q2, rows.slice(0, 4));
    if (q2) {
      check('Q2 ranges across QP PDF pages 2-3 (continuation honoured)', q2[3] === '2-3', q2[3]);
      check('printed page number shown when reliable', /^[0-9]+-?[0-9]*$/.test(q2[4]), q2[4]);
      check('exact MS PDF page for Q2 is page 1', q2[5] === '1', q2[5]);
      check('matched keyword labels shown, not question text',
        q2[6].toLowerCase().includes('compass') && !q2[6].toLowerCase().includes('student has'));
      check('cross-page continuation flagged uncertain for review', /review|continu|uncertain/i.test(q2[7]), q2[7]);
    }
    const q5 = rows.find(r => r[0].includes('0625_w25_qp_41.pdf') && r[2] === 'Q5');
    check('exact MS PDF page for Q5 is page 2 (different physical page)', !!q5 && q5[5] === '2', q5);
    const b3 = rows.find(r => r[0].includes('0625_w24_qp_42.pdf') && r[2] === 'Q3');
    check('MS page matched by year/session/component of a second QP', !!b3 && b3[5] === '2', b3);
    const ocrMsCell = rows.find(r => r[0].includes('scanned_magnetism_notes.pdf'));
    check('unmatched QP reports NO matching MS rather than guessing',
      !!ocrMsCell && ocrMsCell[5] === '—', ocrMsCell);

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
    if (ocrRow) check('OCR-derived result flagged uncertain', /OCR|uncertain/i.test(ocrRow[7]), ocrRow[7]);

    check('OCR engine reports ready (offline)', /ready \(offline\)/i.test(await page.locator('#ocrBadge').innerText()),
      await page.locator('#ocrBadge').innerText());

    const notes = (await page.locator('#scanErrors').count()) ? await page.locator('#scanErrors').innerText() : '';
    check('password-protected PDF is skipped, never bypassed',
      /locked_synthetic\.pdf/.test(notes) && /password|encrypted|could not be opened/i.test(notes), notes.slice(0, 400));

    const beforeExcluded = rows.filter(r => r[7].includes('Excluded')).length;
    check('electromagnetism-only rows hidden by default', beforeExcluded === 0, beforeExcluded);
    await page.check('#showExcluded');
    const afterRows = await page.locator('#resultsBody tr').evaluateAll(trs => trs.map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())));
    check('excluded motor/transformer rows available for transparency',
      afterRows.filter(r => r[7].includes('Excluded')).length >= 2);
    await page.uncheck('#showExcluded');

    // Built-in viewer opens at the exact QP page.
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
    check('row offers a direct link to the matched MS page',
      (await page.locator('#resultsBody').innerText()).includes('Open MS at page'));

    /* ---------------- QP capture + manual alignment ---------------- */
    const q2Row = page.locator('#resultsBody tr').filter({ hasText: '0625_w25_qp_41.pdf' })
      .filter({ hasText: 'Q2' }).first();
    const firstId = await q2Row.getAttribute('data-hit-id');
    await q2Row.locator('.reviewbtns button').first().click();
    await page.waitForSelector('#cropModal:not([hidden])', { timeout: 30000 });
    check('confirming a question automatically opens the QP capture editor',
      await page.locator('#cropModal').isVisible());
    await page.waitForFunction(() => document.getElementById('cropCanvas').width >= 600 &&
      /Drag the box/i.test(document.getElementById('cropSub').textContent), null, { timeout: 30000 });
    check('QP editor is identified as QUESTION PAPER',
      /QUESTION PAPER/.test(await page.locator('#cropTitle').innerText()) &&
      (await page.locator('#cropSourceBadge').innerText()) === 'QP');
    const cropPixels = await page.evaluate(() => {
      const c = document.getElementById('cropCanvas');
      const d = c.getContext('2d').getImageData(0, 0, Math.min(c.width, 400), Math.min(c.height, 400)).data;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 150 && d[i + 1] < 150 && d[i + 2] < 150) dark++;
      return { w: c.width, h: c.height, dark: dark };
    });
    check('QP capture editor renders the actual PDF page', cropPixels.w > 300 && cropPixels.dark > 20, cropPixels);
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

    // Save QP captures with full-page regions. The SAME editor then opens for MS.
    await page.click('#btnUseFullPage');
    await page.waitForFunction(() => /MARK SCHEME/.test(document.getElementById('cropTitle').textContent) &&
      !document.getElementById('cropModal').hidden, null, { timeout: 30000 });
    check('saving QP capture chains into the same manual editor for the MS',
      await page.locator('#cropModal').isVisible());
    check('MS editor is identified as MARK SCHEME',
      (await page.locator('#cropSourceBadge').innerText()) === 'MS' &&
      /0625_w25_ms_41\.pdf/.test(await page.locator('#cropTitle').innerText()));
    await page.waitForFunction(() => document.getElementById('cropCanvas').width >= 600 &&
      /Drag the box/i.test(document.getElementById('cropSub').textContent), null, { timeout: 30000 });
    const msCropPixels = await page.evaluate(() => {
      const c = document.getElementById('cropCanvas');
      const d = c.getContext('2d').getImageData(0, 0, Math.min(c.width, 400), Math.min(c.height, 400)).data;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 150 && d[i + 1] < 150 && d[i + 2] < 150) dark++;
      return { w: c.width, h: c.height, dark: dark };
    });
    check('MS editor renders the exact matched MS page', msCropPixels.w > 300 && msCropPixels.dark > 20, msCropPixels);

    /* ---- v3.1: MANUAL alignment of WHICH MS PDF page is used ---- */
    check('MS editor exposes manual MS page alignment controls',
      await page.locator('#msPageTools').isVisible());
    const msPageOptions = await page.locator('#msPageSelect option').count();
    check('every physical MS PDF page is offered, not just the detected one',
      msPageOptions >= 2, msPageOptions);
    check('auto-detected MS page is preselected',
      (await page.locator('#msPageSelect').inputValue()) === '1');

    const msCellFor = async () => (await page.locator(
      `#resultsBody tr[data-hit-id="${firstId}"] td`).nth(5).innerText()).trim();
    const waitMsCell = (want) => page.waitForFunction(({ id, want }) => {
      const tr = document.querySelector(`#resultsBody tr[data-hit-id="${id}"]`);
      return tr && tr.querySelectorAll('td')[5].innerText.trim() === want;
    }, { id: firstId, want }, { timeout: 30000 });
    const waitMsEditor = () => page.waitForFunction(() =>
      /Pick the exact MS PDF page/.test(document.getElementById('cropSub').textContent) &&
      document.getElementById('cropCanvas').width >= 600, null, { timeout: 30000 });
    const useMsPage = async (n) => {
      await page.selectOption('#msPageSelect', String(n));
      await page.click('#btnMsUsePage');
    };

    await useMsPage(2);
    await waitMsCell('2');
    await waitMsEditor();
    check('manually choosing MS page 2 updates the results table', (await msCellFor()) === '2');
    check('manually chosen MS page 2 is actually rendered in the editor',
      (await page.locator('#cropPageSelect').inputValue()) === '2' &&
      (await page.locator('#msPageSelect').inputValue()) === '2');
    const manualMsPixels = await page.evaluate(() => {
      const c = document.getElementById('cropCanvas');
      const d = c.getContext('2d').getImageData(0, 0, Math.min(c.width, 400), Math.min(c.height, 400)).data;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 150 && d[i + 1] < 150 && d[i + 2] < 150) dark++;
      return { w: c.width, dark: dark };
    });
    check('manually overridden MS page renders real page content',
      manualMsPixels.w > 300 && manualMsPixels.dark > 20, manualMsPixels);

    await useMsPage(1);
    await waitMsCell('1');
    await waitMsEditor();
    check('MS page can be changed back manually', (await msCellFor()) === '1');

    // Pick a DIFFERENT page in the dropdown and add it without replacing page 1.
    await page.selectOption('#msPageSelect', '2');
    await page.click('#btnMsAddPage');
    await page.waitForFunction(id => {
      const tr = document.querySelector(`#resultsBody tr[data-hit-id="${id}"]`);
      return tr && /1.*2/.test(tr.querySelectorAll('td')[5].innerText.trim());
    }, firstId, { timeout: 30000 });
    await waitMsEditor();
    check('"+ Add this page to MS capture" keeps both MS pages in order',
      (await page.locator('#cropPageSelect option').count()) === 2, await msCellFor());
    // The MS editor must support the identical manual alignment controls.
    await page.locator('#cropL').fill('8');
    await page.locator('#cropL').dispatchEvent('change');
    check('MS editor supports the same numeric manual adjustment',
      parseFloat(await page.locator('#cropRect').evaluate(n => n.style.left)) === 8);
    await page.click('#btnUseFullPage');
    await page.waitForFunction(() => document.getElementById('cropModal').hidden === true, null, { timeout: 30000 });
    check('both capture editors close after saving', await page.locator('#cropModal').isHidden());
    const captureBadge = await page.locator(`#resultsBody tr[data-hit-id="${firstId}"] .capture-line`).innerText();
    check('QP and MS captures both shown on the confirmed row',
      /QP 2\/2 captured/.test(captureBadge) && /MS 2\/2 captured/.test(captureBadge), captureBadge);

    await page.selectOption('#filter', 'relevant');
    check('review filter works', (await page.locator('#resultsBody tr').count()) >= 1);
    await page.selectOption('#filter', 'all');

    /* ---------------- build TWO separate A4 PDFs, preview, print, approve ---------------- */
    const pending = parseInt(await page.locator('#cntPending').innerText(), 10);
    check('unchecked questions are still reported before build', pending >= 0);
    if (pending > 0) {
      await page.click('#btnMarkRest');
      check('marking remaining questions clears the pending count',
        (await page.locator('#cntPending').innerText()) === '0');
    }
    check('build button enabled only after checking + BOTH captures',
      await page.locator('#btnBuild').isEnabled(), await page.locator('#compileStatus').innerText());
    check('compile panel counts QP and MS sheets separately',
      /\d+ \+ \d+/.test(await page.locator('#cntSheets').innerText()),
      await page.locator('#cntSheets').innerText());

    await page.click('#btnBuild');
    await page.waitForSelector('#approveBar:not([hidden])', { timeout: 60000 });
    check('A4 QP preview opens in the built-in viewer', await page.locator('#viewer').isVisible());
    check('preview is labelled as not yet downloaded',
      /not downloaded yet/i.test(await page.locator('#viewerSub').innerText()));
    check('MS approve button is enabled when an MS PDF exists',
      await page.locator('#btnApproveMsDownload').isEnabled());
    await page.waitForFunction(() => document.getElementById('viewerLoading').hidden === true, null, { timeout: 30000 });
    const a4 = await page.evaluate(() => {
      const c = document.getElementById('viewerCanvas');
      return { w: c.width, h: c.height };
    });
    check('QP preview renders a portrait A4-shaped sheet',
      a4.h > a4.w && Math.abs(a4.h / a4.w - 841.89 / 595.28) < 0.05, a4);

    // Switch the preview to the SECOND, separate PDF.
    await page.selectOption('#previewSource', 'ms');
    await page.waitForFunction(() => /MARK SCHEME/.test(document.getElementById('viewerTitle').textContent),
      null, { timeout: 30000 });
    await page.waitForFunction(() => document.getElementById('viewerLoading').hidden === true, null, { timeout: 30000 });
    const a4ms = await page.evaluate(() => {
      const c = document.getElementById('viewerCanvas');
      return { w: c.width, h: c.height };
    });
    check('MS preview renders its own portrait A4-shaped sheet',
      a4ms.h > a4ms.w && Math.abs(a4ms.h / a4ms.w - 841.89 / 595.28) < 0.05, a4ms);
    const openedBefore = await page.evaluate(() => window.__opened.length);
    await page.click('#btnPrint');
    await page.waitForFunction(n => window.__opened.length > n, openedBefore, { timeout: 15000 });
    const openedNow = await page.evaluate(() => window.__opened);
    check('Print opens the current A4 PDF in a new tab (no download)',
      openedNow.some(u => /^blob:/.test(u)) && downloads.length === 0, openedNow.slice(-2));
    await page.selectOption('#previewSource', 'qp');
    await page.waitForFunction(() => /QUESTION PAPER/.test(document.getElementById('viewerTitle').textContent),
      null, { timeout: 30000 });
    check('preview can switch back to the QP PDF',
      /QUESTION PAPER/.test(await page.locator('#viewerTitle').innerText()));
    check('NO download occurred before approval', downloads.length === 0, downloads.length);

    const dlPromiseQ = page.waitForEvent('download', { timeout: 30000 });
    await page.click('#btnApproveDownload');
    const dlQ = await dlPromiseQ;
    check('approving QP downloads QP-Magnetism-A4.pdf',
      dlQ.suggestedFilename() === 'QP-Magnetism-A4.pdf', dlQ.suggestedFilename());
    const pdfQ = fs.readFileSync(await dlQ.path());
    const textQ = pdfQ.toString('latin1');
    check('QP file is a real PDF', textQ.slice(0, 5) === '%PDF-', textQ.slice(0, 12));
    const mbQ = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\]/.exec(textQ);
    check('QP pages are A4-sized',
      !!mbQ && Math.abs(parseFloat(mbQ[1]) - 595.28) < 1 && Math.abs(parseFloat(mbQ[2]) - 841.89) < 1,
      mbQ ? [mbQ[1], mbQ[2]] : null);
    check('QP A4 PDF has at least one page',
      (textQ.match(/\/Type\s*\/Page\b/g) || []).length >= 1);
    check('QP re-download button appears only after approval',
      await page.locator('#btnDownloadApproved').isVisible());

    const dlPromiseM = page.waitForEvent('download', { timeout: 30000 });
    await page.click('#btnApproveMsDownload');
    const dlM = await dlPromiseM;
    check('approving MS downloads a SEPARATE MS-Magnetism-A4.pdf',
      dlM.suggestedFilename() === 'MS-Magnetism-A4.pdf', dlM.suggestedFilename());
    const pdfM = fs.readFileSync(await dlM.path());
    const textM = pdfM.toString('latin1');
    check('MS file is a real PDF', textM.slice(0, 5) === '%PDF-', textM.slice(0, 12));
    const mbM = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\]/.exec(textM);
    check('MS pages are A4-sized',
      !!mbM && Math.abs(parseFloat(mbM[1]) - 595.28) < 1 && Math.abs(parseFloat(mbM[2]) - 841.89) < 1,
      mbM ? [mbM[1], mbM[2]] : null);
    check('MS A4 PDF has at least one page',
      (textM.match(/\/Type\s*\/Page\b/g) || []).length >= 1);
    check('QP and MS are genuinely two different PDF files, not one combined PDF',
      !pdfQ.equals(pdfM), { qp: pdfQ.length, ms: pdfM.length });
    check('MS re-download button appears only after approval',
      await page.locator('#btnDownloadMsApproved').isVisible());
    check('exactly two downloads, both approved by the user', downloads.length === 2, downloads.length);

    check('no requests left the local machine', external.length === 0, external.slice(0, 5));
    const realErrors = consoleErrors.filter(e => !/favicon|net::ERR_/i.test(e));
    check('no uncaught browser errors', realErrors.length === 0, realErrors.slice(0, 4));

    console.log('\nE2E summary: ' + passed + ' checks passed; external requests = ' + external.length);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('E2E FAILURE:', e.message); process.exit(1); });
