# Navigation Symbol Audit

**Scope:** `src/notation-renderer.js` — navigation symbol rendering path.
**Date:** 2026-05-31

---

## Status

| Layer | Status |
|---|---|
| Import | **Supported.** `mxl_to_song.py` emits `segno`, `coda`, and `navigation` fields. |
| Renderer | **Learning Aid only.** Symbols are displayed for musical literacy. Known coordinate bugs affect some symbols (see §2). |
| Playback | **Not supported by design.** Navigation symbols do not control playback. Runtime remains strictly linear. |

**Navigation symbols do not control playback. They are literacy objects and learning aids.**

See [`docs/import/linear_learning_path_generator.md`](../import/linear_learning_path_generator.md) for the approved architecture: repeat and navigation expansion occurs during import, producing a linear learning path. The runtime never executes repeat jumps, D.C. jumps, D.S. jumps, coda routing, or Fine termination logic.

---

## 1. Song.json Fields

| Field | Value | Renderer action |
|---|---|---|
| `segno: true` | bar has Segno sign | Adds `VF.Repetition(T.SEGNO_LEFT)` to treble stave |
| `coda: true` | bar has Coda sign | Adds `VF.Repetition(T.CODA_LEFT)` to treble stave |
| `navigation: "Fine"` | Fine marker | Adds `VF.Repetition(T.FINE)` |
| `navigation: "D.C."` | Da Capo marker | Adds `VF.Repetition(T.DC)` |
| `navigation: "D.S."` | Dal Segno marker | Adds `VF.Repetition(T.DS)` |
| `navigation: "D.C. al Fine"` | D.C. al Fine | Adds `VF.Repetition(T.DC_AL_FINE)` |
| `navigation: "D.S. al Coda"` | D.S. al Coda | Adds `VF.Repetition(T.DS_AL_CODA)` |

Code path: `_addNavModifiers()` — `notation-renderer.js:1150`.

---

## 2. Rendering Status Per Symbol

| Symbol | Renders | Root Cause |
|---|---|---|
| **Coda** | Yes (by coincidence) | `drawSymbolText` CODA_LEFT case uses `textX = stave.getVerticalBarWidth()` — a small hardcoded value that places text within the viewport. Latin word "Coda" renders with any system font even if the ⊕ glyph is missing. |
| **Segno** | No | `drawSegnoFixed` uses `ctx.fillText(Glyphs.segno)` — a PUA Unicode code point requiring a music web font. No `@font-face` declaration exists; glyph renders as empty. |
| **Fine** | No | `drawSymbolText` default formula: `textX = x - (stave.getNoteStartX() - this.x) + stave.getWidth() - …`. With `this.x = 0` (passed to `new VF.Repetition(T.FINE, 0, 0)`), `textX` evaluates to a large negative value for any bar beyond the first column. Off-canvas left. |
| **D.C.** | No | Same coordinate bug as Fine. |
| **D.S.** | No | Same coordinate bug as Fine. |
| **D.C. al Fine** | No | Same coordinate bug as Fine. |
| **D.S. al Coda** | No | Same coordinate bug as Fine. |

These are **pre-existing rendering bugs**, not regressions. Fixing them is a future engraving quality task. The symbols do not affect playback regardless of whether they render visibly.

---

## 3. Test Asset

`songs/test_navigation_symbols.json` covers: Segno (bar 1), Fine (bar 4), Coda (bar 5), D.S. al Coda (bar 6), D.C. (bar 7).

Missing from test asset: `D.S.` and `D.C. al Fine` — these two values exist in `NAV_TYPE` in the renderer but are not present in the test file.
