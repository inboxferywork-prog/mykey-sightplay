'use strict';
// Diagnostic script — dumps actual VF.Beam and VF.Tuplet inputs for Bar 1 tuplet.
// Verification only — no renderer changes. Run: node tools/debug_beam_dump.js
// Output: stdout only, no files written.

const { chromium } = require('playwright');
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT = 8766;  // different port to avoid conflict with screenshot harness
const ROOT = path.resolve(__dirname, '..');

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

(async () => {
  const server = http.createServer(serveStatic);
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    // Capture all console messages from the page
    const consoleLogs = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${PORT}/tools/screenshot_harness.html`);
    await page.waitForFunction(() => typeof window.renderSong === 'function', { timeout: 15000 });

    // Inject monkey-patches BEFORE renderSong is called.
    // These intercept VF.Beam.generateBeams and VF.Tuplet constructor and dump
    // the note arrays to console. The renderer itself is NOT modified.
    await page.evaluate(() => {
      const VF = window.VexFlow;

      // ----------------------------------------------------------------
      // Patch 1: VF.Beam.generateBeams — dump every call's note list
      // ----------------------------------------------------------------
      const origGenerateBeams = VF.Beam.generateBeams.bind(VF.Beam);
      let beamCallIdx = 0;
      VF.Beam.generateBeams = function(notes, config) {
        const idx = ++beamCallIdx;
        const noteInfo = notes.map((n, i) => {
          let name = '?';
          try {
            const keys = n.getKeys ? n.getKeys() : (n.keys || []);
            name = keys.join('+');
          } catch (_) {}
          let stemDir = '?';
          try { stemDir = n.getStemDirection(); } catch (_) {}
          return `[${i}]${name}(stem:${stemDir > 0 ? 'UP' : stemDir < 0 ? 'DN' : stemDir})`;
        });
        console.log(`BEAM_CALL #${idx} (${notes.length} notes): ${noteInfo.join(', ')}`);
        const result = origGenerateBeams(notes, config);
        console.log(`  → produced ${result.length} Beam object(s)`);
        return result;
      };

      // ----------------------------------------------------------------
      // Patch 2: VF.Tuplet — dump each constructor call
      // ----------------------------------------------------------------
      const OrigTuplet = VF.Tuplet;
      let tupletCallIdx = 0;
      VF.Tuplet = function(notes, opts) {
        const idx = ++tupletCallIdx;
        const noteInfo = notes.map((n, i) => {
          let name = '?';
          try {
            const keys = n.getKeys ? n.getKeys() : (n.keys || []);
            name = keys.join('+');
          } catch (_) {}
          return `[${i}]${name}`;
        });
        const ratio  = opts ? `${opts.num_notes}:${opts.beats_occupied}` : '?';
        const loc    = opts?.location;
        console.log(`TUPLET_CALL #${idx} ratio=${ratio} loc=${loc} (${notes.length} notes): ${noteInfo.join(', ')}`);
        return new OrigTuplet(notes, opts);
      };
      // Copy static members over (LOCATION_TOP, LOCATION_BOTTOM, etc.)
      Object.setPrototypeOf(VF.Tuplet, OrigTuplet);
      Object.assign(VF.Tuplet, OrigTuplet);
      VF.Tuplet.prototype = OrigTuplet.prototype;

      console.log('PATCHES_INSTALLED');
    });

    // Render the tuplet test song
    await page.evaluate(() => window.renderSong('/songs/test_tuplets_source.json'));
    await page.waitForTimeout(800);

    // Print all captured logs
    console.log('\n=== BEAM / TUPLET DIAGNOSTIC DUMP ===');
    for (const line of consoleLogs) {
      console.log(line);
    }
    console.log('=== END DUMP ===\n');

  } finally {
    await browser.close();
    server.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
