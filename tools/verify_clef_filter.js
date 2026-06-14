/**
 * Verification script: SVG clef filter (RH / LH / Both) for Bohemian Rhapsody
 * Run: node tools/verify_clef_filter.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const BASE = 'http://localhost:7654';
const OUT  = path.join(__dirname, 'verify_screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  page.setDefaultTimeout(20000);

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // ── Helper ──────────────────────────────────────────────────────────────
  async function selectSong(label) {
    // Force-select via JS (element may be CSS-hidden on desktop viewport)
    await page.evaluate((lbl) => {
      const sel = document.getElementById('songSelect');
      const opt = Array.from(sel.options).find(o => o.text.includes(lbl));
      if (!opt) throw new Error('Song not found: ' + lbl);
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, label);
    await page.waitForFunction(
      () => !document.querySelector('.score-loading'),
      { timeout: 15000 }
    );
    await page.waitForTimeout(1200);
  }

  async function setHand(value) {
    await page.evaluate((v) => {
      const sel = document.getElementById('handSelect');
      sel.value = v;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await page.waitForTimeout(600);
  }

  async function countVisible(selector) {
    return page.evaluate((sel) => {
      const els = document.querySelectorAll(sel);
      return Array.from(els).filter(el => {
        const s = el.style.visibility;
        // also check computed in case inherited
        return s !== 'hidden';
      }).length;
    }, selector);
  }

  async function countHidden(selector) {
    return page.evaluate((sel) => {
      return Array.from(document.querySelectorAll(sel))
        .filter(el => el.style.visibility === 'hidden').length;
    }, selector);
  }

  async function svgMode() {
    return page.evaluate(() => document.body.classList.contains('nk-svg-score'));
  }

  async function staffData() {
    return page.evaluate(() => {
      const svgEl = document.querySelector('#score svg');
      if (!svgEl) return null;
      const all    = Array.from(svgEl.querySelectorAll('[data-nk-staff]'));
      const result = { treble: 0, bass: 0, both: 0, brace: 0, hiddenTreble: 0, hiddenBass: 0 };
      for (const el of all) {
        const staff = el.dataset.nkStaff;
        result[staff] = (result[staff] || 0) + 1;
        if (el.style.visibility === 'hidden') {
          if (staff === 'treble') result.hiddenTreble++;
          if (staff === 'bass')   result.hiddenBass++;
        }
      }
      return result;
    });
  }

  // ── Open app ─────────────────────────────────────────────────────────────
  await page.goto(BASE + '/index.html');
  // Wait for JS to populate the song select dropdown (has options)
  await page.waitForFunction(
    () => document.querySelector('#songSelect')?.options?.length > 0,
    { timeout: 15000 }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 1: Bohemian Rhapsody — Both (initial)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n─── BH: Load (Both) ───');
  await selectSong('Bohemian Rhapsody');

  const isSvg = await svgMode();
  console.log('SVG mode:', isSvg);

  let d = await staffData();
  console.log('Staff data (Both):', JSON.stringify(d));
  await page.screenshot({ path: path.join(OUT, '1-bh-both.png') });

  const hasElements = d && d.treble > 0 && d.bass > 0;
  console.log(`EXPECT: treble>0 && bass>0 → ${hasElements ? 'PASS' : 'FAIL'}`);
  console.log(`EXPECT: hiddenTreble=0 && hiddenBass=0 → ${d.hiddenTreble === 0 && d.hiddenBass === 0 ? 'PASS' : 'FAIL'}`);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 2: Switch to RH (treble only)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n─── BH: Switch to RH ───');
  await setHand('treble');

  d = await staffData();
  console.log('Staff data (RH):', JSON.stringify(d));
  await page.screenshot({ path: path.join(OUT, '2-bh-rh.png') });

  console.log(`EXPECT: hiddenBass>0 → ${d.hiddenBass > 0 ? 'PASS' : 'FAIL'}`);
  console.log(`EXPECT: hiddenTreble=0 → ${d.hiddenTreble === 0 ? 'PASS' : 'FAIL'}`);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 3: Switch to LH (bass only)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n─── BH: Switch to LH ───');
  await setHand('bass');

  d = await staffData();
  console.log('Staff data (LH):', JSON.stringify(d));
  await page.screenshot({ path: path.join(OUT, '3-bh-lh.png') });

  console.log(`EXPECT: hiddenTreble>0 → ${d.hiddenTreble > 0 ? 'PASS' : 'FAIL'}`);
  console.log(`EXPECT: hiddenBass=0 → ${d.hiddenBass === 0 ? 'PASS' : 'FAIL'}`);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 4: Back to Both
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n─── BH: Back to Both ───');
  await setHand('both');

  d = await staffData();
  console.log('Staff data (Both again):', JSON.stringify(d));
  await page.screenshot({ path: path.join(OUT, '4-bh-both-again.png') });

  console.log(`EXPECT: hiddenTreble=0 && hiddenBass=0 → ${d.hiddenTreble === 0 && d.hiddenBass === 0 ? 'PASS' : 'FAIL'}`);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 5: Roti Panas — rh_only song, should load clean (no bass to hide)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n─── Roti Panas (rh_only) ───');
  // Roti Panas might not be in the dropdown (check index.json listing)
  const options = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#songSelect option')).map(o => o.text)
  );
  console.log('Available songs:', options);

  // ── Console errors check ─────────────────────────────────────────────────
  console.log('\n─── Console errors ───');
  if (errors.length) {
    console.log('ERRORS:', errors.join('\n'));
  } else {
    console.log('No console errors');
  }

  await browser.close();
  console.log('\nScreenshots saved to:', OUT);
})().catch(err => {
  console.error('SCRIPT ERROR:', err.message);
  process.exit(1);
});
