'use strict';
// Playwright screenshot script — Bravura font activation verification.
// Usage: node tools/screenshot_bravura.js
// Output: docs/engraving/screenshots/bravura_*.png

const { chromium } = require('playwright');
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT = 8765;
const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'docs', 'engraving', 'screenshots');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.css':  'text/css',
};

function serveStatic(req, res) {
  const parsed   = url.parse(req.url);
  const filePath = path.join(ROOT, parsed.pathname === '/' ? '/tools/screenshot_harness.html' : parsed.pathname);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found: ' + filePath); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const SONGS = [
  { file: 'simple_test.json',             label: 'clefs_noteheads',    desc: 'Clefs and noteheads (simple_test)' },
  { file: 'test_rests.json',              label: 'rests',              desc: 'Rests' },
  { file: 'test_accidentals.json',        label: 'accidentals',        desc: 'Accidentals' },
  { file: 'test_dynamics.json',           label: 'dynamics',           desc: 'Dynamics' },
  { file: 'test_staccato_slur.json',      label: 'staccato_slur',      desc: 'Staccato and slur' },
  { file: 'test_endings.json',            label: 'repeat_symbols',     desc: 'Repeat barlines' },
  { file: 'test_navigation_symbols.json',      label: 'navigation_symbols',      desc: 'Navigation symbols' },
  { file: 'test_navigation_symbols_full.json', label: 'navigation_symbols_full', desc: 'Navigation symbols — full coverage' },
  { file: 'test_segno_placement.json',         label: 'segno_placement',         desc: 'Segno placement — middle, last, first-of-row' },
  { file: 'test_cross_system_slurs.json',           label: 'cross_system_slurs',          desc: 'Cross-system slurs — Cases A, B, C' },
  { file: 'test_cross_system_slur_single_clef.json', label: 'cross_row_slur_treble_only',  desc: 'Cross-row slur — treble only (ROW_H check)', opts: { visibleClefs: ['treble'] } },
  { file: 'test_cross_system_slur_single_clef.json', label: 'cross_row_slur_bass_only',    desc: 'Cross-row slur — bass only (ROW_H check)',   opts: { visibleClefs: ['bass']   } },
  { file: 'test_octave_marks.json',                  label: 'octave_marks',                desc: '8va / 8vb bracket rendering audit' },
  { file: 'test_tuplets_source.json',               label: 'tuplets_source',              desc: 'Tuplet rendering — 8th triplet, quarter triplet, 16th quintuplet (importer-generated)' },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const server = http.createServer(serveStatic);
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  console.log(`Static server: http://127.0.0.1:${PORT}`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${PORT}/tools/screenshot_harness.html`);
    await page.waitForFunction(() => typeof window.renderSong === 'function', { timeout: 15000 });

    for (const { file, label, desc, opts } of SONGS) {
      try {
        await page.evaluate(({ f, o }) => window.renderSong('/songs/' + f, o || undefined), { f: file, o: opts || null });
        await page.waitForTimeout(600);

        const scoreEl = page.locator('#score');
        const outPath = path.join(OUT, `bravura_${label}.png`);
        await scoreEl.screenshot({ path: outPath });
        console.log(`  ✓  ${label}  —  ${desc}`);
      } catch (err) {
        console.error(`  ✗  ${label}  —  ${err.message}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\nScreenshots saved to:\n  ${OUT}`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
