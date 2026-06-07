/**
 * Portrait notation screenshot tool.
 * Usage: node tools/portrait_screenshot.js <label>
 * Saves to: tools/screenshots/portrait_<label>.png
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const label = process.argv[2] || 'snapshot';
const outDir = path.join(__dirname, 'screenshots');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  // Portrait phone viewport: 390x844 (iPhone 14 Pro equivalent)
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await page.goto('http://localhost:3977/', { waitUntil: 'networkidle', timeout: 15000 });

  // Wait for app JS to finish initializing
  await page.waitForTimeout(2500);

  // Load first song via JS (songSelect may be hidden in portrait CSS)
  await page.evaluate(() => {
    const sel = document.getElementById('songSelect');
    if (sel && sel.options.length > 1) {
      sel.value = sel.options[1].value;
      sel.dispatchEvent(new Event('change'));
    }
  });
  await page.waitForTimeout(2500);

  // Force portrait + fab mode
  await page.evaluate(() => {
    document.body.classList.add('nk-portrait');
    document.body.classList.add('nk-fab-mode');
  });
  await page.waitForTimeout(600);

  // Screenshot full page
  const outPath = path.join(outDir, `portrait_${label}.png`);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log('Saved:', outPath);

  // Also screenshot just the notation viewport area
  const vp = page.locator('#notation-viewport, .score-card').first();
  const vpVisible = await vp.isVisible().catch(() => false);
  if (vpVisible) {
    const outPath2 = path.join(outDir, `portrait_${label}_notation.png`);
    await vp.screenshot({ path: outPath2 });
    console.log('Saved notation crop:', outPath2);
  }

  await browser.close();
})();
