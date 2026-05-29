# Portrait Reading Mode — Session Handoff
**Date:** 2026-05-29  
**Session scope:** FAB overlay UX refinement — guidance strip, touch targets, draggable bar

---

## 1. Architecture Status

| Component | Status | Notes |
|---|---|---|
| `RuntimeEngine` | **Frozen** — do not touch | Single timeline authority. `src/runtime-engine.js`. |
| `NotationRenderer` | **Frozen** — do not touch | Layers 1–3 complete. `src/notation-renderer.js`. |
| `ViewportManager` | **Frozen** — do not touch | Pan/zoom/fullscreen. `src/viewport-manager.js`. |
| Playback / Web Audio | **Frozen** — do not touch | Triangle osc ADSR in index.html; future: example_audio MP3. |
| FAB overlay mode | **Active experiment** — being refined | `body.nk-fab-mode` always active (`FAB_CONTROLS = true`). |
| Portrait mode | **Active experiment** — being refined | `body.nk-portrait` set by `_syncPortrait()` JS. |
| Float controls | **Disabled experiment** | `FLOAT_CONTROLS = false`. `float-controls.css` preserved but inactive. |

---

## 2. Features Confirmed Working

- **FAB overlay mode** — `body.nk-fab-mode` hides all layout chrome (header, song-meta, stage-strip, progress-wrap, controls, status-bar, viewport-controls). Notation fills 100vh.
- **JS portrait detection** — `_syncPortrait()` toggles `body.nk-portrait` on `resize` + `orientationchange`. Reliable on mobile and DevTools emulation.
- **Keyboard suppression in portrait** — `body.nk-portrait .kb-wrap { display: none }` frees vertical space.
- **Note guidance strip visible** — `body.nk-portrait.nk-fab-mode .fab-ngr { display: flex }` — renders in portrait FAB mode only.
- **`onKeyHighlight` feed wired** — `_ngrUpdate()` stub replaced by `_initNoteGuidanceRow()` IIFE; LH/RH note names update in real time as song plays.
- **Note deduplication + MIDI sort** — chord tones sorted lowest → highest; octave duplicates removed.
- **Hand filter** — FAB tools panel ⚙ → Both/RH/LH. `dispatchEvent(new Event('change', { bubbles: true }))` required for parent delegate listener.
- **Song part select** — FAB tools panel synced via MutationObserver on `#segmentsBar`.
- **Song picker** — ♪ button opens song list panel above FAB bar.
- **Progress strip** — 3px bar at top of overlay; click to seek.
- **Tempo select** — synced bidirectionally with hidden original `#tempoScale`.

---

## 3. Features Partially Implemented

- **Draggable FAB bar** — `_initFabDrag()` IIFE implemented (pointer-capture on `#fabDragHandle`). Not yet tested on a real device; drag position resets on resize/orientationchange (intentional).
- **Note-name mode selector in strip** — `#fabNgrMode` select added (ABC / Do Re Mi / 1 2 3). Bidirectionally synced with `#noteNameMode` (main control). Wired but untested on device.

---

## 4. Known Issues / Not Yet Tested

- **Drag handle UX** — The `⠿` braille character may render inconsistently across Android fonts. Consider replacing with a custom SVG or CSS dots if it looks wrong.
- **Notation viewport `padding-top` on layout reflow** — `ViewportManager.fitWidth()` calls `_usableWidth()` which reads `clientWidth`. The `padding-top: 63px` does not affect width calculation, but if `fitWidth()` fires before the padding is applied (e.g. on first load), the score may scroll partly under the strip on the first frame. Likely minor; test on device.
- **`_syncKbHeight()` in landscape after song load** — `setTimeout(_syncKbHeight, 600)` is a heuristic. If keyboard renders slowly, FAB bar may start in wrong position briefly.
- **FAB bar position after orientation flip** — `_resetPos()` clears inline `bottom` style; CSS default takes over. No animation on reset. Acceptable but could feel abrupt.
- **Layer 3 notation — accidentals** — Natural sign insertion when a note cancels a key-signature accidental is a known latent bug (not triggered by current test songs).

---

## 5. Current Portrait Reading Mode Behavior

When `body.nk-portrait` + `body.nk-fab-mode` are both active:

```
┌─────────────────────────────────┐
│ ░░ 3px progress strip (top: 0)  │  fab-progress
│─────────────────────────────────│
│  LH  Do-Mi  │ ABC │  Sol  RH   │  fab-ngr (height: 60px, top: 3px)
│─────────────────────────────────│  padding-top: 63px on #notation-viewport
│                                 │
│         NOTATION AREA           │  score fills remaining height
│     (VexFlow SVG, scrollable)   │
│                                 │
│─────────────────────────────────│
│   ⠿  ♪ │ ▶ ⏹ │ 🚶 │ ⚙  ⊠    │  fab-bar (height: 66px)
│                                 │  bottom: calc(--fab-kb-h + 8px)
│  [piano keyboard hidden]        │  --fab-kb-h = 0 in portrait
└─────────────────────────────────┘
```

**Key CSS tokens in portrait:**
- `--fab-bar-h: 66px` (set by `_syncPortrait()` via inline style)
- `--fab-kb-h: 0px` (keyboard hidden, `_syncKbHeight()` reads 0)
- FAB bar: `bottom: calc(0px + 8px) = 8px`

---

## 6. Current Landscape Behavior

When `body.nk-portrait` is absent (landscape):

```
┌──────────────────────────────────────────────────────┐
│ ░░ 3px progress strip                                │  fab-progress
│──────────────────────────────────────────────────────│
│                                                      │
│              NOTATION AREA                           │  score fills height
│                                                      │
│──────────────────────────────────────────────────────│
│        [piano keyboard — full width]                 │  kb-wrap (layout flow)
│──────────────────────────────────────────────────────│
│            ⠿  ♪ │ ▶ ⏹ │ 🚶 │ ⚙  ⊠                │  fab-bar (height: 48px)
└──────────────────────────────────────────────────────┘
                                                          bottom: calc(--fab-kb-h + 8px)
                                                          --fab-kb-h = keyboard offsetHeight (~170px)
```

**Key CSS tokens in landscape:**
- `--fab-bar-h: 48px` (CSS `:root` default; JS sets `''` = reverts)
- `--fab-bar-h: 40px` for screens ≤900px landscape (media query override)
- `--fab-kb-h`: live value from `_syncKbHeight()` after layout
- Note guidance strip hidden (`body.nk-portrait` absent)

---

## 7. Refinements Completed This Session

### Guidance strip relocated to top
- **Before:** `bottom: 0`, height 40px, nearly invisible, covered by FAB bar at 8px above keyboard.
- **After:** `top: 3px` (below progress strip), height 60px, full-width, readable.
- Removed `--fab-ngr-h` token entirely — it previously offset FAB bar bottom from the strip; no longer needed.
- FAB bar + panel `bottom` calcs simplified: `calc(var(--fab-kb-h) + 8px)` / `+ var(--fab-bar-h) + 10px`.
- `portrait-mode.css`: added `body.nk-portrait.nk-fab-mode #notation-viewport { padding-top: 63px }`.

### Note-name mode selector in strip
- Added `<select id="fabNgrMode">` (ABC / Do Re Mi / 1 2 3) centered in `.fab-ngr` HTML.
- `.ngr-mode-select` CSS: `pointer-events: auto` inside the passive (`pointer-events: none`) strip.
- `_initNoteGuidanceRow()` wired bidirectionally: `#fabNgrMode` ↔ `_noteNameMode` ↔ `#noteNameMode` (main selector) ↔ keyboard labels.

### Larger touch targets
- Base `.fab-btn`: 38×38 → 42×42px, font 16→17px.
- Base `.fab-main-btn`: 40×40 → 46×46px, font 17→19px.
- Portrait `.fab-btn`: 44×44 → 50×50px, font 19→21px.
- Portrait `.fab-main-btn`: 46×46 → 54×54px, font 20→23px.
- Portrait `.fab-bar` height: 56px → 66px (CSS + `_syncPortrait()` token).
- Note text in strip: 13px → 18px, active state bold (font-weight 700).

### Draggable FAB bar
- `<span class="fab-drag-handle" id="fabDragHandle">⠿</span>` added as first child of `.fab-bar`.
- `_initFabDrag()` IIFE: pointer-capture drag on handle only; clamps between `kbH + 6` and `windowH - barH - ngrH - 10`; resets on resize/orientationchange.
- `.fab-drag-handle`: `touch-action: none; cursor: grab`.

---

## 8. Files Modified This Session

| File | What changed |
|---|---|
| `styles/fab-overlay.css` | Removed `--fab-ngr-h` token; moved `.fab-ngr` to top; increased heights; bigger buttons; added `.ngr-mode-select` + `.fab-drag-handle` styles |
| `styles/portrait-mode.css` | Added `body.nk-portrait.nk-fab-mode #notation-viewport { padding-top: 63px }` |
| `index.html` | Updated `_syncPortrait()` (removed `--fab-ngr-h`; portrait bar-h now 66px); updated `.fab-ngr` HTML (added `#fabNgrMode` select); added drag handle to `.fab-bar`; wired `#fabNgrMode` in `_initNoteGuidanceRow()`; added `_initFabDrag()` IIFE |

**Files NOT modified (stable):**
`src/runtime-engine.js`, `src/notation-renderer.js`, `src/viewport-manager.js`, `src/landscape-coordinator.js`, `src/learning-state.js`, `src/keyboard-viz.js`, `src/song-loader.js`, `src/reading-window.js`, `src/practice-loop.js`, `themes/base-ui.css`, `styles/float-controls.css`, `styles/mobile-layout.css`

---

## 9. Important Constraints for Future Work

1. **Never modify `src/runtime-engine.js`** — single timeline authority, frozen contract.
2. **Never modify `src/notation-renderer.js`** — Layer 3 rendering complete; tie/beam/stem logic is fragile.
3. **Never modify `ViewportManager` internals** — transform/zoom/fullscreen math is correct and stable.
4. **All FAB changes scoped to `body.nk-fab-mode`** — no rule should affect layout outside this class.
5. **Portrait rules use `body.nk-portrait` class** — never use CSS `orientation` media queries; they are unreliable on desktop DevTools and some mobile browsers.
6. **`dispatchEvent` must use `{ bubbles: true }`** — parent delegate listeners on `#learningRow` and `#segmentsBar` will silently miss events without it.
7. **`_syncKbHeight()` reads only `.kb-wrap.offsetHeight`** — do not add other elements into that measurement.
8. **VexFlow 5.0.0 compiled bundle only** — `new VF.StaveTie({ firstNote, lastNote, firstIndices, lastIndices })` camelCase. Never use master-branch TypeScript source as API reference.
9. **FAB overlay is experimental** — rollback path: `FAB_CONTROLS = false`. All FAB rules must stay scoped to `body.nk-fab-mode`.

---

## 10. Recommended Next Task

**Test on a real Android device in portrait and landscape, then:**

1. **Verify drag handle renders correctly** — the `⠿` braille pattern may need replacing with a CSS-drawn dots pattern if it renders as a box on some Android fonts. A 3×2 grid of `2px` dots via `background-image` is a reliable alternative.

2. **Verify `padding-top: 63px` on notation viewport** — confirm the first row of notes is fully visible below the guidance strip after `fitWidth()` fires. If the notation starts behind the strip on first load, call `viewportManager.fitWidth()` after a short delay post-load.

3. **Portrait `--fab-kb-h` fallback check** — in portrait, `.kb-wrap` is `display: none` so `offsetHeight = 0`. Confirm `_syncKbHeight()` returns 0 and FAB bar sits at `bottom: 8px` as expected.

4. **Accidental carry (Layer 3)** — next notation work item per `docs/engraving-standards.md §9`: natural sign insertion when a note cancels a key-signature accidental (e.g. F♮ in G major).
