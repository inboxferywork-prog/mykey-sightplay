# Known VexFlow Behaviors

**Scope:** VexFlow 5.0.0 CJS/UMD bundle — verified behaviors, limitations, and implementation notes discovered during MyKey-SightPlay engraving development.

This document is the canonical internal reference for VexFlow quirks. When implementing new notation features, check here before assuming VexFlow behavior matches its public API surface. All entries are verified against screenshots and the bundle loaded from `https://cdn.jsdelivr.net/npm/vexflow@5.0.0/build/cjs/vexflow.js`.

---

## Behavior 1: Repetition Symbol Anchor Positioning

**Feature:** `VF.Repetition` — affects all text-family navigation symbols:
- D.C. (`T.DC`)
- D.S. (`T.DS`)
- Fine (`T.FINE`)
- D.C. al Fine (`T.DC_AL_FINE`)
- D.S. al Coda (`T.DS_AL_CODA`)

**Does not affect:** Coda (`T.CODA_LEFT`) and Segno (`T.SEGNO_LEFT`) — those have separate issues documented below.

### Observation

`VF.Repetition(type, x, yShift)` — the `x` constructor parameter is an **absolute canvas X coordinate**, not a position relative to the stave or bar.

VexFlow internally uses `this.x` in the draw formula:

```
textX = x - (stave.getNoteStartX() - this.x) + stave.getWidth() - adj
```

When `this.x` does not match the stave's actual canvas X position, the formula produces an incorrect (often negative or far-left) result.

### Incorrect assumption

```javascript
// x = 0 (measure-relative offset)
stave.addModifier(new VF.Repetition(t, 0, 0));
```

Symbols attached to any bar other than the first bar of the first row will render near or beyond the left edge of the canvas.

### Correct implementation

```javascript
// x = stave.getX() — absolute canvas anchor
stave.addModifier(new VF.Repetition(t, stave.getX(), 0));
```

Pass the stave's own X position as the anchor. This is resolved before `stave.draw()` is called, so `stave.getX()` is reliable at the point of modifier attachment.

### Symptoms

- Symbol renders at far left edge regardless of which bar it is attached to
- Symbol overlaps with the treble clef or brace on all non-first-column bars
- Negative computed X in VexFlow internals (no thrown error — silent misplacement)

### Resolution

Implemented in `_addNavModifiers()` — `src/notation-renderer.js`. The fix passes `stave.getX()` as the second argument to every `VF.Repetition` constructor call for text-family symbols.

**Reference files:**
- `src/notation-renderer.js` — function `_addNavModifiers()`
- `docs/engraving/navigation_audit.md`

---

## Behavior 2: Volta Bracket Anchor Positioning

**Feature:** `VF.Volta` — affects all ending brackets:
- First ending (`volta: 1`)
- Second ending (`volta: 2`)
- Any multi-bar ending sequence

### Observation

`VF.Volta(type, label, x, yShift)` — the `x` constructor parameter is an **absolute canvas X coordinate**, not a bar-relative offset.

This is the same class of behavior as Behavior 1. Despite `VF.Volta` being a different class (`StaveModifier`), it uses `this.x` as an absolute position anchor during draw, not as an offset from the stave.

### Incorrect assumption

```javascript
// x = 0 (assumed to mean "start of this bar")
treble.addModifier(new VF.Volta(voltaType, '1.', 0, 0));
```

The bracket renders at canvas X ≈ 0 regardless of which bar the stave occupies. A volta on bar 4 of a row (stave.getX() ≈ 927) will appear at the far left edge of the canvas.

### Correct implementation

```javascript
// x = current bar's absolute X position (loop variable `x` in _drawScore)
treble.addModifier(new VF.Volta(voltaType, voltaLabel, x, 0));
```

Pass the bar's actual canvas X position. In `_drawScore`, the loop variable `x` tracks the current bar's left edge and equals `stave.getX()`, making either form correct.

### Symptoms

- Volta bracket appears at the start of the row instead of over its target bar
- All volta brackets in a row cluster at the left edge
- Bracket width looks approximately correct but position is wrong
- No VexFlow error — silent misplacement

### Resolution

Implemented in `_drawScore` Pass 1 loop — `src/notation-renderer.js`. The loop variable `x` (current bar's left edge) is passed as the Volta constructor's third argument.

**Additional note:** Volta brackets are applied to the treble stave only. Standard engraving convention does not extend volta brackets across the bass staff, and VexFlow's `VF.Volta` is not designed to span a grand staff connector.

**Reference files:**
- `src/notation-renderer.js` — Pass 1 loop, `_getVoltaType()` helper
- `docs/engraving/repeat_import_audit.md`

---

## Behavior 3: Segno Glyph Rendering

**Feature:** `VF.Repetition.type.SEGNO_LEFT`

### Observation

`VF.Repetition(T.SEGNO_LEFT, x, yShift)` internally calls `ctx.fillText()` using the Bravura PUA Unicode codepoint U+E047 (𝄋). VexFlow's SVG backend renders music glyphs as **SVG path elements**, not as `@font-face` text. Because no `@font-face` declaration for Bravura is injected into the SVG context, `fillText()` with a PUA codepoint produces an invisible result — no error is thrown.

This is not a coordinate bug. Even with the correct `x` anchor, `SEGNO_LEFT` produces no visible output.

### Resolution

Bypass `VF.Repetition.SEGNO_LEFT` entirely. Render Segno post-stave using the path-based glyph API:

```javascript
VF.Glyph.renderGlyph(ctx, x, y, pointSize, 'segnoSerpent1');
```

`VF.Glyph.renderGlyph` uses VexFlow's internal glyph path table (SMuFL-mapped Bravura paths compiled into the bundle), so it is font-independent and works correctly with the SVG backend.

Fallback for environments where `VF.Glyph.renderGlyph` is unavailable:

```javascript
const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
el.textContent = ''; // Bravura PUA: Segno
// requires Bravura @font-face to be present in the page
```

**Implementation:** `_drawSegno()` in `src/notation-renderer.js`. Called after `stave.draw()` (post-draw injection into SVG).

**Reference files:**
- `src/notation-renderer.js` — function `_drawSegno()`
- `docs/engraving/navigation_audit.md` — §2 rendering status table

---

## Behavior 4: Coda Placement — Row-First Constraint

**Feature:** `VF.Repetition.type.CODA_LEFT`

### Observation

`CODA_LEFT` uses a hardcoded internal formula based on `stave.getVerticalBarWidth()`, a small fixed value that represents the width of the leading barline — not the stave's canvas X position. The effect is that the Coda glyph always renders near the row's left edge, regardless of which bar it is attached to.

Attaching Coda to a middle bar or last bar of a row causes it to render on top of bar 1's content (clef, key signature, notes). No error is thrown.

### Status

Known VexFlow 5.0.0 limitation. The internal positioning formula is not configurable via the public constructor API.

### Recommendation

- Place `coda: true` only on the first bar of a row in visual test fixtures and production songs.
- When a song's musical structure requires Coda mid-row, document the visual compromise explicitly.
- Do not attempt to correct Coda position via the `x` constructor parameter — it is ignored for `CODA_LEFT`.

**Reference files:**
- `docs/engraving/navigation_audit.md` — §2 rendering status table
- `songs/test_navigation_symbols_full.json` — Coda placed at bar 5 (first bar of row 2) by design

---

## Future Investigation Areas

The following features are not yet implemented in MyKey-SightPlay but are likely to exhibit the same absolute-X anchor behavior based on the pattern observed in `VF.Repetition` and `VF.Volta`. Verify the `x` constructor parameter semantics before assuming offset behavior:

| Feature | VexFlow class | Likely anchor behavior |
|---|---|---|
| Rehearsal marks | `VF.Repetition` (text family) | Absolute X — confirmed pattern |
| Tempo marks | `VF.StaveTempo` | Investigate |
| Ottava (8va/8vb) | `VF.Ottava` | Investigate |
| Text brackets | `VF.TextBracket` | Investigate |
| Pedal markings | `VF.PedalMarking` | Investigate |
| Hairpins (cresc/decresc) | `VF.StaveHairpin` | Investigate — uses note-based anchors, may differ |

**General rule:** Any `StaveModifier` subclass that accepts an `x` constructor parameter should be treated as expecting an absolute canvas X until verified otherwise.
