# Engraving Quality Audit — MyKey Music Labs

**Date:** 2026-05-31  
**Scope:** Notation rendering stack, font pipeline, and engraving quality baseline  
**Method:** Static source audit — index.html, notation-renderer.js, package.json, all CSS files, VexFlow 5.0.0 ESM source  
**Status:** Audit only — no fixes applied

---

## 1. VexFlow Version

| Field | Value |
|---|---|
| Version | **5.0.0** |
| Load method | CDN — `https://cdn.jsdelivr.net/npm/vexflow@5.0.0/build/cjs/vexflow.js` |
| Bundle format | CJS/UMD (single-file, browser global `window.VexFlow`) |
| Bridge | `window.Vex = { Flow: window.VexFlow }` (one-liner shim, index.html:249) |
| Package dependency | **None** — not in package.json; loaded exclusively via CDN |
| VexFlow in node_modules | Absent |

The CDN load is pinned to the exact `5.0.0` patch, which avoids inadvertent upgrades. The CJS bundle is the older CommonJS format; VexFlow 5 also ships an ESM build (`/build/esm/`) which is unused.

---

## 2. Music Fonts Loaded at Runtime

### Font initialization code

There is **no font initialization code** anywhere in the project:

- No call to `VF.setMusicFont()`
- No call to `Vex.Flow.DEFAULT_FONT_STACK`
- No `@font-face` declarations in any CSS file
- No `<link rel="stylesheet">` pointing to a font CDN
- No font files in the repository

### What VexFlow 5.0.0 uses by default

VexFlow 5.0.0's CJS bundle **embeds glyph path data** directly as JavaScript arrays (compiled into the bundle at build time). It does **not** load external font files at runtime. This is a path-based rendering approach — glyphs are drawn as SVG `<path>` elements, not as `<text>` elements using a loaded font.

The default font stack in VexFlow 5.0.0 is:

| Priority | Font | Description |
|---|---|---|
| 1 | **Gonville** | Default. VexFlow's own engraving font, pre-SMuFL, embedded in bundle |
| 2 | **Bravura** | SMuFL-compliant. Also embedded in bundle as fallback |
| 3 | **Petaluma** | Handwritten-style. Also embedded |

Since no `setMusicFont()` call is made, **Gonville is the active font** for all path-rendered glyphs (noteheads, stems, clefs, key signatures, rests, articulations, flags, beams, time signatures).

### Exceptions — text-based rendering (not path-based)

Two rendering paths in the project bypass the path-based glyph system entirely and use SVG `<text>` elements instead:

| Element | Rendering method | Font used |
|---|---|---|
| Dynamics (pp, p, mp, mf, f, ff) | Custom SVG `<text>` DOM injection (`_drawDynamic`, notation-renderer.js:1184) | **Times New Roman, Georgia, serif** — hardcoded |
| Navigation text (Coda, Fine, D.C., D.S., etc.) | VexFlow `Repetition.drawSymbolText()` via `ctx.fillText` | `Metrics.getFontInfo('Repetition.text')` — VexFlow internal, likely Gonville text style |
| Segno glyph | VexFlow `Repetition.drawSegnoFixed()` via `ctx.fillText` with `Glyphs.segno` | Requires music font PUA Unicode character to be available as a web font — **not guaranteed** |

---

## 3. Rendering Mode

**Path-based (embedded glyph outlines)** — VexFlow's modern rendering path.

This is **not** legacy bitmap or SVG-font rendering. All notation elements go through VexFlow's `Glyph` class which emits `<path d="...">` SVG elements using pre-compiled outline data from the Gonville font. This is functionally equivalent to SVG font rendering in terms of visual output, but does not depend on the browser having the Bravura web font installed.

**SMuFL status:** Partial.  
- Gonville is a pre-SMuFL font. It predates the SMuFL standard and does not cover all 3,000+ SMuFL code points.  
- Bravura (embedded but inactive) is fully SMuFL-compliant.  
- No `setMusicFont('Bravura')` call is made anywhere, so the SMuFL-compliant font is never activated.

---

## 4. How Each Element Type Is Rendered

### Clefs
Path-based via VexFlow's `Clef` stave modifier. Glyph outlines from Gonville. Added via `stave.addClef('treble'/'bass')`. Quality: functional, readable, pre-SMuFL proportions.

### Noteheads
Path-based via `VF.StaveNote`. Gonville notehead outlines. Stem direction is explicitly set post-format via `setStemDirection()` (notation-renderer.js:331–335) using the furthest-note-from-middle-line rule (Gould §4). Quality: correct musically, Gonville notehead shapes are slightly rounder than Bravura/Leland.

### Accidentals
Path-based via `VF.Accidental`. Custom carry logic in `_resolveAccidental()` suppresses redundant accidentals within a bar (notation-renderer.js:420–428). Natural sign insertion is implemented. **Known gap:** natural signs that cancel a key-signature accidental (e.g. F♮ in G major) are not inserted — latent correctness bug for non-C-major songs.

### Articulations (staccato)
Path-based via `VF.Articulation('a.')`. Explicit placement via `setPosition(4 or 3)` opposite the stem direction (notation-renderer.js:445–448). Standard for: staccato only. Tenuto, accent, marcato, fermata not implemented.

### Dynamics
**Custom SVG text injection** (notation-renderer.js:1184–1206). Not VexFlow. Direct `document.createElementNS` call producing `<text>` with `font-family: Times New Roman, Georgia, serif; font-style: italic; font-weight: bold; font-size: 13`. This is entirely outside the VexFlow path pipeline. Quality: readable but visually inconsistent with notation glyphs (serif text vs Gonville paths).

### Navigation Symbols
VexFlow `VF.Repetition` via `stave.addModifier()`. Rendering path diverges by symbol type:

| Symbol | VF method | Actual output | Status |
|---|---|---|---|
| Coda | `drawSymbolText` → `fillText('Coda ')` | Latin text 'Coda' visible | **Renders** (by coincidence — see §7) |
| Segno | `drawSegnoFixed` → `fillText(Glyphs.segno)` | PUA glyph, font-dependent | **Does not render** |
| Fine | `drawSymbolText` → default formula | textX = large negative | **Does not render** |
| D.C. | `drawSymbolText` → default formula | textX = large negative | **Does not render** |
| D.S. | `drawSymbolText` → default formula | textX = large negative | **Does not render** |
| D.C. al Fine | `drawSymbolText` → default formula | textX = large negative | **Does not render** |
| D.S. al Coda | `drawSymbolText` → default formula | textX = large negative | **Does not render** |

---

## 5. Missing VexFlow Font Initialization

The following standard VexFlow 5 initialization is absent:

```javascript
// Not present anywhere in index.html or notation-renderer.js:

// Option A — activate Bravura (full SMuFL)
VexFlow.setMusicFont('Bravura');

// Option B — explicit Gonville (current default, made explicit)
VexFlow.setMusicFont('Gonville');

// Option C — Bravura with Gonville fallback (recommended for coverage)
VexFlow.setMusicFont('Bravura', 'Gonville');
```

Without this call, rendering relies on VexFlow 5's implicit default (Gonville). This works for basic notation but:
- Excludes access to Bravura's superior glyph quality
- Excludes SMuFL-compliant proportions (staff line relationships, notehead size ratios)
- Leaves the font choice implicit and fragile across VexFlow version upgrades

---

## 6. Baseline Comparison

### MuseScore (open source, desktop)
- **Font:** Leland (MuseScore's own full SMuFL implementation) or Bravura
- **Glyph rendering:** Platform native (Qt, FreeType) at print resolution; PDF/SVG export
- **Spacing:** Optical spacing engine with collision detection, Gould-compliant inter-note spacing
- **Navigation symbols:** Full support — all SMuFL symbols at correct sizes and positions
- **Dynamics:** SMuFL dynamic glyphs (same font family as notation), hairpin rendering
- **Slurs:** Full multi-system slur breaks with optical curvature per Gould
- **Ties:** Full cross-system, cross-voice, chord-tie support
- **Key cancellation:** Natural signs inserted automatically
- **Gap vs MyKey:** Significant. MuseScore's engraving engine is purpose-built with 20+ years of refinement.

### Soundslice (web, commercial)
- **Font:** Custom SMuFL-based font, embedded in their rendering pipeline
- **Glyph rendering:** Canvas or SVG, browser-native
- **Spacing:** Proportional spacing with full collision avoidance
- **Navigation symbols:** Full, correct positioning above right barline or start of bar
- **Dynamics:** SMuFL glyphs, correctly sized relative to staff
- **Slurs:** Multi-system, optically shaped
- **Gap vs MyKey:** Large. Soundslice is a production engraving system targeting professional display quality.

### Dorico (commercial, Steinberg)
- **Font:** Bravura (the SMuFL reference implementation), licensed
- **Glyph rendering:** Platform vector renderer at display and print resolution
- **Spacing:** Semantic spacing — considers note content, beams, articulations, lyrics simultaneously
- **Navigation symbols:** Fully typeset, with positioning rules per Gould §21
- **Dynamics:** SMuFL glyphs with hairpin interpolation, cresc./dim. text
- **Slurs:** Full multi-system, voice-aware, orientation-corrected
- **Gap vs MyKey:** Very large. Dorico targets professional music publishing quality.

### MyKey relative position
MyKey's rendering quality is approximately at the level of an **early-stage educational notation tool** — correct pitch and rhythm representation, serviceable for sight-playing exercises, but not production engraving quality. Appropriate for the current stage (beginner/early-beginner songs). Quality becomes inadequate at intermediate+ repertoire with complex articulations, multi-voice writing, or dense navigation.

---

## 7. Top 10 Engraving Quality Limitations

Listed in order of visual/functional impact for the target audience.

---

**#1 — Navigation text symbols do not render**  
Fine, D.C., D.S., D.C. al Fine, D.S. al Coda appear at a large negative absolute SVG x-coordinate (off-canvas left). Root cause: `new VF.Repetition(type, 0, 0)` passes `this.x = 0`; VexFlow's `drawSymbolText` default formula expects `this.x = stave.getX()`. The formula subtracts the absolute `getNoteStartX()` value instead of the relative note-start offset, producing coordinates like `x = -534` for bars in later columns. No workaround or fallback text appears.  
*Impact: Learning aid purpose of navigation symbols is completely lost.*

---

**#2 — Segno symbol does not render**  
`drawSegnoFixed` sets `this.text = Glyphs.segno` (a SMuFL/PUA Unicode code point) and renders via `ctx.fillText`. This requires a music font to be loaded as an accessible web font. Since MyKey loads VexFlow via a path-based CJS bundle without any web font declaration, the glyph renders as invisible/empty. Unlike Coda (which has the Latin word 'Coda' as a visible prefix), Segno is pure glyph — no Latin fallback.  
*Impact: Segno symbols are silent failures. Invisible to the student.*

---

**#3 — Gonville instead of Bravura**  
No `setMusicFont()` call is made. VexFlow 5.0.0 defaults to Gonville, a pre-SMuFL font with non-standard notehead proportions, clef designs, and glyph spacing. Bravura (the SMuFL reference font, embedded in the same VexFlow bundle) would produce noticeably sharper, more standard-compliant notation.  
*Impact: Notation looks older, less polished than comparable web-based tools. Visible in noteheads, clef glyphs, and rest shapes.*

---

**#4 — Dynamics use a different visual language than notation glyphs**  
Dynamic markings (pp, p, mp, mf, f, ff) are rendered as browser `<text>` SVG elements using `Times New Roman, Georgia, serif` — a completely different typeface and rendering pipeline from the Gonville path-based glyphs. In professional engraving, dynamic markings use the same music font as all other notation (SMuFL chars U+E520–U+E52F). The size (13px hardcoded) and baseline positioning (midpoint gap formula) are approximate and do not follow Gould's dynamic placement rules.  
*Impact: Visual inconsistency between dynamic text and notation. Most noticeable at different zoom levels where the two rendering paths scale differently.*

---

**#5 — No natural sign insertion for key-signature cancellation**  
When a note is naturalized in a non-C-major key (e.g. F♮ in G major, where F is sharpened by the key signature), the `_resolveAccidental` logic does not emit the natural sign. The accidental carry state tracks what has been shown in the measure, but does not account for the key signature's persistent sharps/flats outside the bar. This is a known latent bug (noted in project memory).  
*Impact: Incorrect notation for any non-C-major song with chromatic notes. Pitch-reading correctness is compromised for advanced songs.*

---

**#6 — Slurs limited to same-row only; cross-system slurs silently dropped**  
`_drawSlurs` checks `srcRow === dstRow` (notation-renderer.js:568–569) and silently discards cross-row slurs. No half-arc is drawn at the row boundary. In engraving, cross-system slurs require a trailing arc on the first system and a leading arc on the second.  
*Impact: All slurs that span across a row break disappear. Phrase groupings are lost for longer musical sentences.*

---

**#7 — No compound meter beam grouping**  
`_beatGroupedBeams` uses a quarter-note-based `msPerBeat` formula. In compound meters (6/8, 9/8, 12/8), this produces incorrect beat unit grouping — eighth notes are grouped in pairs (simple-meter grouping) rather than in triplets as the meter requires. A TODO exists in the source (notation-renderer.js:927).  
*Impact: Wrong beaming in 6/8 songs. Beams signal meter; incorrect beaming actively misteaches rhythm.*

---

**#8 — Highlight CSS overrides affect all SVG children with equal weight**  
The highlight classes (`.nk-active`, `.nk-note-active-rh`, etc.) apply `fill !important` and `stroke !important` to all child SVG elements: `path, rect, use, line, circle, polygon, text`. This colors stems, noteheads, beams, ties, slurs, accidentals, articulation dots, and stave lines all the same highlight color simultaneously. In professional notation players, only the notehead(s) of the active event change color; stems and beams remain neutral.  
*Impact: Active notes appear as large colored blobs rather than highlighted noteheads. Reduces readability at higher note densities.*

---

**#9 — Fixed 960px canvas width; no adaptive staff sizing**  
`CANVAS_W = 960` is hardcoded in `_drawScore` (notation-renderer.js:148). The bar-width algorithm distributes this fixed total. On mobile screens (≤400px), the canvas is wider than the viewport, requiring horizontal scroll or zoom. No staff line thickness, notehead size, or staff spacing adapts to display density.  
*Impact: On phones in portrait mode, notation requires pinch-zoom to read. Legibility degrades at the margins.*

---

**#10 — Staccato placement uses pre-format stem direction; may mismatch beamed notes**  
`setPosition(stemDir === 1 ? 4 : 3)` (notation-renderer.js:447) uses the stem direction computed from the furthest-note rule before `Formatter.format()` runs. For beamed groups, `_beatGroupedBeams` may override individual note stem directions post-format with a unified group direction. If the group direction differs from the per-note direction used to set the staccato position, the dot appears on the wrong side of the notehead.  
*Impact: Staccato dots can appear above stem-down notes (instead of below the notehead) in beamed passages.*

---

## Appendix: Source Inventory

| File | Role | Font/rendering relevance |
|---|---|---|
| `index.html:248` | VexFlow CDN load | Sole entry point for VexFlow; no font init |
| `index.html:249` | Vex bridge | `window.Vex = { Flow: window.VexFlow }` |
| `src/notation-renderer.js:129` | VexFlow entry | `const VF = Vex.Flow` — first use of bridge |
| `src/notation-renderer.js:1150` | Navigation rendering | `_addNavModifiers` — all 7 symbol paths |
| `src/notation-renderer.js:1184` | Dynamics rendering | Custom SVG text, Times New Roman |
| `src/notation-renderer.js:445` | Staccato rendering | `VF.Articulation('a.')` |
| `themes/base-ui.css:807` | Highlight CSS | `!important` overrides on all SVG child types |
| `package.json` | Dependencies | Only `playwright` devDependency; VexFlow absent |

No `@font-face` declaration exists in any file in the repository.
