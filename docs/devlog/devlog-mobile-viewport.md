# Devlog — Mobile Viewport

Status: ACTIVE

---

# Purpose

Tracks:
- implementation progress
- architectural decisions
- regressions
- rollback history
- future tasks

---

# Update Template

## YYYY-MM-DD

### Task / Milestone

Status:
PLANNED / IN PROGRESS / COMPLETE / ROLLED BACK

Files Added:
- ...

Files Modified:
- ...

Architecture Notes:
- ...

Safety Validation:
- RuntimeEngine unchanged ✓
- Renderer semantics unchanged ✓
- No SVG regeneration ✓

Known Issues:
- ...

Next Step:
- ...

---

# 2026-05-25

### Initial Mobile Viewport Architecture Planning

Status:
COMPLETE

Completed:
- viewport roadmap
- viewport foundation architecture
- overlay controls architecture
- performance mode architecture
- safe integration boundaries
- contracts
- implementation checklist

Architecture Decision:
Viewport evolution will be additive and isolated from RuntimeEngine and notation-renderer.

---

# 2026-05-26

### Phase 1 — Viewport Foundation Implementation

Status:
COMPLETE

---

## Files Added

- `src/viewport-manager.js` — ViewportManager class (presentation layer only)
- `styles/mobile-layout.css` — Viewport DOM styles, controls overlay, responsive layouts

## Files Modified

- `index.html`
  - Added `<link>` for `styles/mobile-layout.css`
  - Added `<script>` for `src/viewport-manager.js`
  - Wrapped `#score` with `#notation-viewport > #notation-camera` DOM structure
  - Added `.has-viewport` class to `.score-card`
  - Added viewport controls overlay (`#vpControls`)
  - Wired `ViewportManager` instance in inline script
  - Added `viewportManager.fitWidth()` call on initial load and after each song load

## DOM Structure Implemented

```html
<div class="score-card has-viewport">
  <div id="notation-viewport">      <!-- clip area + scroll container -->
    <div id="notation-camera">      <!-- transform layer (scale/translate) -->
      <div id="score"></div>        <!-- renderer output, unchanged -->
    </div>
  </div>
  <div class="viewport-controls">  <!-- floating controls overlay -->
    ↔ − 100% + 1× ⛶
  </div>
</div>
```

---

## Architecture Decisions

### Scroll container
`#notation-viewport` is the scroll container (`overflow-y: auto`).
`.score-card` becomes `overflow: hidden` via `.has-viewport` class.
This moves scroll from score-card to viewport, compatible with `scrollIntoView`.

### Transform approach
`#notation-camera` receives `transform: scale(s) translate(px, 0)`.
`transform-origin: top left` anchors zoom to score's top-left corner.
`will-change: transform` promotes to GPU layer for smooth animation.
All transforms go through `requestAnimationFrame` to avoid layout thrashing.

### Camera width
`#notation-camera` is fixed at `width: 960px` — matching `CANVAS_W` in notation-renderer.js.
This ensures `transform-origin: top left` scales from the correct origin.

### Fit-width behavior
`fitWidth()` computes `scale = viewportEl.clientWidth / 960`.
Applied on: page load, song load, window resize, fullscreen toggle, fit-width button.
Pan resets to 0 on fit-width.

### Pan implementation
Pan is stored in pre-scale camera coordinates (`_panX`).
`panBy(dx)` converts screen pixels: `panX += dx / scale`.
Applied in `scale(s) translate(panX, 0)` form — translate is in camera space.
Pan clamped so score never scrolls past its edges.
Pan only activates when `scale > 1.05` (avoids accidental pan at fit-width).

### Fullscreen
Requests fullscreen on `.score-card` element (contains both viewport and controls).
No renderer rerender on enter/exit.
No playback restart.
Fit-width re-applied after fullscreen resize via `fullscreenchange` event.

### Renderer isolation
`notation-renderer.js` is completely unaware of viewport state.
Renderer continues rendering into `#score` exactly as before.
`renderer.scrollToBar()` calls `scrollIntoView` on SVG elements — works against
`#notation-viewport` (the new scroll container) as the nearest scrollable ancestor.

### RuntimeEngine isolation
`runtime-engine.js` is untouched. No timing changes.

---

## Safety Validation

- RuntimeEngine unchanged ✓
- Renderer semantics unchanged ✓
- No SVG regeneration ✓
- No renderer internal access ✓
- No playback lifecycle changes ✓
- Additive implementation (removable by reverting 3 files) ✓

---

## Known Issues / Phase 1 Limitations

### scrollToBar accuracy at non-1.0 scale
`renderer.scrollToBar()` uses `element.scrollIntoView()` which targets the element's
layout (pre-transform) position. At fit-width scale < 1, the scroll amount may be
slightly larger than necessary (browser scrolls to layout position, not visual position).
In practice the target bar IS visible after scroll — accuracy is approximate, not broken.

A future enhancement can provide a viewport-aware scroll adapter that intercepts
bar-change events and scrolls to the precise visual position.

### Fullscreen on iOS Safari
`requestFullscreen` is not supported on iOS Safari. Fullscreen button is safe to press
(call is caught) but will have no effect. Screen-lock landscape workaround is the
current iOS full-screen option.

### Pan is horizontal-only
Phase 1 pan only handles horizontal (`panX`). Vertical navigation uses native
overflow-y scroll on `#notation-viewport`. This is intentional — horizontal pan
is only needed when zoomed in beyond viewport width.

---

## Next Steps (Phase 2)

- Overlay controls (floating play/pause, segment selector)
- Auto-hide controls after inactivity
- Pinch-to-zoom gesture support (via `src/mobile-gesture.js`)
- Landscape immersive mode (hide header / compress chrome further)

---

# 2026-05-26

### Phase 1.5 — Viewport Refinement & Stabilization

Status:
COMPLETE

---

## Files Modified

- `src/viewport-manager.js`
- `styles/mobile-layout.css`
- `index.html`

---

## Fixes Applied

### 1. Padding bug in `fitWidth()` and `_clampPanX()`
**Problem**: `viewportEl.clientWidth` included the viewport's horizontal padding
(8px per side = 16px total). At a 400px viewport, `fitWidth()` produced
scale = 400/960 = 0.417, causing the camera to visually extend 16px beyond
the viewport's content area. The rightmost barlines of each row were partially
clipped by `overflow-x: hidden`.

**Fix**: Introduced `_usableWidth()` helper that calls `getComputedStyle` to
read `paddingLeft + paddingRight` and subtracts from `clientWidth`.
Both `fitWidth()` and `_clampPanX()` now use `_usableWidth()` instead of
raw `clientWidth`.

### 2. Bottom padding buffer for controls overlay
**Problem**: No bottom padding on `#notation-viewport` — the floating viewport
controls overlay (`bottom: 12px`) could visually overlap the last bar row
of the score on short scores or zoom states.

**Fix**: Changed `#notation-viewport` padding from `16px 8px` to `12px 0 50px`.
The 50px bottom buffer ensures the last row of notation clears the overlay
height (~38px) with comfortable margin.

### 3. Horizontal padding removed from viewport
**Related to Fix 1**: The horizontal padding (`8px`) was removed from
`#notation-viewport` as part of the padding fix. Horizontal breathing room
is provided by the renderer's internal `MARGIN_X = 10px` in the SVG.
This makes the viewport width equal to the usable content width, simplifying
all width calculations.

### 4. Resize handler debounced
**Problem**: The `resize` event fires many times during window drag-resize.
Each event called `requestAnimationFrame(() => this.fitWidth())`, creating
multiple RAF callbacks that bypassed the existing `_rafPending` guard.

**Fix**: Added 80ms debounce to the resize handler using `clearTimeout` /
`setTimeout`. Rapid resize events are collapsed into a single `fitWidth()` call.
The `_resizeTimer` is properly cleaned up in `destroy()`.

### 5. Fullscreen button state feedback
**Problem**: The fullscreen button showed `⛶` in both enter and exit states.
No visual indication that pressing it would EXIT fullscreen.

**Fix**: Added `onFullscreenChange(fn)` callback to ViewportManager.
In `index.html`, added `_vpSyncFullscreenBtn()` which toggles the `vp-active`
class and updates the `title` attribute: "Fullscreen" → "Exit Fullscreen".
The callback fires from `onFSChange` inside ViewportManager (same handler
that updates `_isFullscreen`).

### 6. Fullscreen CSS simplified
**Problem**: `:fullscreen .score-card` used `width: 100vw !important;
height: 100vh !important; max-width: none !important;` — redundant overrides
with unnecessary `!important` flags. The browser's fullscreen UA styles
already handle element sizing.

**Fix**: Removed the `width`, `height`, and `max-width` declarations from
the fullscreen rule. Only cosmetic properties remain:
`max-width: none; border-radius: 0; border: none; background: #fff;`

### 7. `_applyTransform` cleanup
When `panX = 0`, the transform is now emitted as `scale(s)` instead of
`scale(s) translate(0px, 0px)`. Keeps the transform string minimal.

### 8. Landscape `song-meta` overflow
Added `flex-wrap: nowrap; overflow: hidden` to `.song-meta` in the landscape
media query. Prevents meta chips from wrapping to a second line and consuming
extra vertical space in landscape mode where height is precious.

---

## Architecture Validation

- RuntimeEngine unchanged ✓
- Renderer semantics unchanged ✓
- No SVG regeneration ✓
- Architecture boundaries preserved ✓
- All changes remain additive / reversible ✓

---

## scrollToBar — Clarification

The Phase 1 devlog noted `scrollIntoView` as a "known limitation" at non-1.0 scale.
Further analysis shows: in modern browsers (Chrome, Firefox), `scrollIntoView`
internally uses `getBoundingClientRect()` which returns post-transform visual
coordinates. This means `scrollIntoView` correctly targets the visual position
of bar elements, even when `#notation-camera` is scaled.

The Phase 1 limitation was conservative and applies only to edge cases in older
or non-standard browser environments. For the target platforms (modern mobile
browsers), bar scroll behavior is correct.

Status: **non-issue on target platforms**. No viewport-aware scroll adapter needed.

---

## Known Limitations (Remaining)

### Simultaneous touch pan + vertical scroll at zoom > 1
When scale > 1.05 and the user touches the viewport, both horizontal pan
(handled by ViewportManager) and vertical scroll (native overflow-y) can
activate simultaneously. Touch gesture disambiguation (angle-based lock
to one axis) requires `{ passive: false }` on touchmove and is Phase 2
territory.

### Fullscreen on iOS Safari
`requestFullscreen` is not supported on iOS Safari. The button is safe to
press (promise rejection is caught) but has no effect. Current workaround:
lock device orientation to landscape manually.

### Pinch-to-zoom not yet implemented
Two-finger pinch gesture for zoom is Phase 2 scope (`src/mobile-gesture.js`).

---

## Next Steps (Phase 2)

- Overlay controls (floating play/pause, segment selector)
- Auto-hide controls after inactivity
- Pinch-to-zoom gesture support (`src/mobile-gesture.js`)
- Landscape immersive mode (reduce header, compress chrome further)

---

# 2026-05-26

### Phase 1.6 — Landscape Mode Refinement & Safe Area

Status:
COMPLETE

---

## Files Added

- `src/landscape-coordinator.js` — LandscapeViewportCoordinator class

## Files Modified

- `styles/mobile-layout.css`
- `index.html`

---

## Changes Applied

### 1. LandscapeViewportCoordinator (new file)
Additive coordinator class that owns orientation-aware CSS class state only.

Responsibilities:
- Toggle `.vp-landscape` / `.vp-portrait` on `.score-card` on resize events
- Toggle `.vp-fullscreen-active` on `.score-card` on fullscreen change events
- Apply `.vp-transitioning` on `#notation-camera` for 380ms on orientation rotation events, to smooth ViewportManager's debounced `fitWidth()` recalculation

Architecture: zero coupling to renderer, runtime, or ViewportManager internal state.
Revert path: remove `src/landscape-coordinator.js` + remove script tag + remove coordinator init.

### 2. Safe area insets (CSS)
Added `:root { --vp-safe-bottom, --vp-safe-right, --vp-safe-left }` custom properties
bridging `env(safe-area-inset-*)` values with `0px` fallback.

All positioning values that were previously hardcoded (`bottom: 12px`) now use
`calc(Npx + var(--vp-safe-bottom))` / `calc(Npx + var(--vp-safe-right))`.
Affected rules: `.viewport-controls`, `#notation-viewport` padding-bottom,
portrait/landscape/fullscreen/touch media query overrides.

Requires `viewport-fit=cover` in the viewport meta tag (also applied in this phase).

### 3. Fullscreen CSS selector bug fix
**Problem**: `:fullscreen .score-card` is a descendant selector — selects `.score-card`
children *inside* the fullscreen element. Since `.score-card` IS the fullscreen element,
this selector never matched. Fullscreen cosmetic overrides (border-radius, border, etc.)
were silently no-ops since Phase 1.

**Fix**: Changed to `.score-card:fullscreen` (element-level pseudo-class form).
All nested selectors updated to `.score-card:fullscreen #notation-viewport` etc.

### 4. Orientation transition guard (CSS)
Added `#notation-camera.vp-transitioning { transition: transform 0.28s ease-out }`.
Applied by LandscapeViewportCoordinator for 380ms on orientation change events.
Smooths the scale recalculation jump from ViewportManager's debounced `fitWidth()`.
No transition applied during normal zoom/pan (class is absent).

### 5. `viewport-fit=cover` meta tag
Updated `<meta name="viewport">` to include `viewport-fit=cover`.
Without this, `env(safe-area-inset-*)` always returns 0 on iOS notched devices.
This is harmless on non-notched devices and required for correct safe area behavior.

---

## Architecture Validation

- RuntimeEngine unchanged ✓
- Renderer semantics unchanged ✓
- No SVG regeneration ✓
- Architecture boundaries preserved ✓
- All changes additive / reversible ✓

---

## Known Limitations (Remaining)

### Simultaneous touch pan + vertical scroll at zoom > 1
When scale > 1.05 and the user touches the viewport, both horizontal pan
(handled by ViewportManager) and vertical scroll (native overflow-y) can
activate simultaneously. Touch gesture disambiguation (angle-based axis lock)
requires `{ passive: false }` on touchmove and is Phase 2 scope.

### Fullscreen on iOS Safari
`requestFullscreen` is not supported on iOS Safari. The button is safe to
press (promise rejection is caught) but has no effect. `viewport-fit=cover`
still benefits non-fullscreen notched layouts.

### Pinch-to-zoom not yet implemented
Two-finger pinch gesture for zoom is Phase 2 scope (`src/mobile-gesture.js`).

---

## Next Steps (Phase 2)

- Overlay controls (floating play/pause, segment selector)
- Auto-hide controls after inactivity
- Pinch-to-zoom gesture support (`src/mobile-gesture.js`)
- Touch gesture axis disambiguation (angle-based scroll lock)

---

# 2026-05-27

### Task 2A — Context-Aware Musical Reading Window

Status:
COMPLETE

---

## Files Added

- `src/reading-window.js` — ContextAwareReadingWindow class

## Files Modified

- `index.html`
  - Added `<script src="src/reading-window.js">`
  - Added `readingWindow` instance (after `landscapeCoordinator`)
  - Replaced `renderer.scrollToBar(ev.bar)` in `onEventEnter` with
    `readingWindow.scrollToBar(ev.bar, scoreEl)`

---

## Problem Addressed

The previous viewport scrolled reactively: `renderer.scrollToBar()` used
`scrollIntoView({ block: 'nearest' })`, which brings the active bar into view
at the closest edge of the visible area. This meant:

- The active bar was often at the bottom 20% of the viewport
- Upcoming bars were cut off or barely visible
- Scroll triggered on every bar change (no dead zone)
- No anticipatory offset — eyes always catching up, never reading ahead

---

## Architecture

### Additive integration pattern
`readingWindow.scrollToBar()` is used ONLY in the `onEventEnter` playback path.
All other `renderer.scrollToBar()` calls (segment nav, loop nav) are unchanged —
they are intentional "jump to" operations that warrant immediate precise scroll.

### Coordinate system
`#notation-viewport` (the scroll container) is itself unscaled. Therefore:
`scrollTop` (CSS layout pixels) and `getBoundingClientRect()` values (visual pixels)
are in the same coordinate space. The scroll delta equals the visual delta:
`targetScrollTop = scrollTop + (barVisualTop − targetVisualTop)`.
No scale factor conversion is needed, regardless of the zoom level set on
`#notation-camera` by ViewportManager.

### Reading model
```
Viewport (300px example):
┌────────────────────────────┐  ← top
│  [dead zone top 10%]       │
│  ────────────────────      │
│  ▶ active bar (30%)        │  ← readingPosition
│                            │
│  next bar (visible)        │
│  next bar (visible)        │  ← reading horizon
│  ────────────────────      │
│  [dead zone bottom 65%]    │
│                            │
└────────────────────────────┘
```

### Dead zone behavior
If the active bar is already within [10%, 65%] of viewport height, no scroll
is issued. On a typical portrait phone (300px viewport, 87px visual row height):
- Row changes trigger a scroll approximately every 2 rows
- Within a row, no scroll (all bars at same vertical position)
- Result: calmer, less nervous movement that matches musical phrase pacing

### Scroll coalescing
Rapid bar changes (tempo bursts, high-speed passages) are absorbed by a 100ms
debounce window. Only the last bar in the window triggers a scroll. Eliminates
scroll bursts during tempo changes or passages with short notes.

### Smooth scroll
`scrollTo({ top: T, behavior: 'smooth' })` on the native scroll container.
Same mechanism used by renderer.scrollToBar() (scrollIntoView smooth). Supported
on all target platforms (Chrome, Firefox, Safari 15+). Falls back to instant on
older Safari.

---

## Tuning Parameters

Exposed as public properties on the `ContextAwareReadingWindow` instance:

| Parameter        | Default | Range       | Effect                                             |
|-----------------|---------|-------------|-----------------------------------------------------|
| readingPosition | 0.30    | 0.20 – 0.40 | Active bar vertical position (fraction from top)   |
| deadZoneTop     | 0.10    | 0.05 – 0.25 | Upper comfort boundary (near top = already good)   |
| deadZoneBottom  | 0.65    | 0.55 – 0.80 | Lower comfort boundary (triggers re-centering)     |
| coalesceMs      | 100     | 60 – 250    | Debounce window for rapid bar changes (ms)         |

These can be adjusted at runtime without page reload:
```javascript
readingWindow.readingPosition = 0.25;  // more aggressive top-positioning
readingWindow.deadZoneBottom  = 0.70;  // tolerate active bar lower before scrolling
```

---

## Architecture Validation

- RuntimeEngine unchanged ✓
- Renderer semantics unchanged ✓
- No SVG regeneration ✓
- renderer.scrollToBar() unchanged (still used for segment/loop jump-to) ✓
- All changes additive / reversible ✓

---

## Future Extension Points (Task 2B)

### Phrase-aware scroll horizon
Instead of a fixed readingPosition, compute the target based on phrase structure
from song.json (e.g., position active bar at phrase start, scroll at phrase end).
Requires phrase metadata in song.json — no renderer or runtime changes.

### Tempo-adaptive coalescing
At high tempos, increase coalesceMs to reduce scroll frequency further.
At slow tempos, reduce coalesceMs for more immediate response.
`readingWindow.coalesceMs = Math.max(60, Math.min(200, 120000 / bpm))` — no new API needed.

### Row-aware positioning
Compute actual visual row height from the DOM and adjust dead zone dynamically.
Avoids the current heuristic that works for standard 4/4 but may over-scroll
for songs with very large or very small bars.

### Fullscreen override
In fullscreen, adjust readingPosition slightly (e.g., 0.25) to maximize the
reading horizon in the larger viewport. Read from `viewportManager.isFullscreen`.

---

# 2026-05-27

### Task 2B — Zoom-Aware Viewport Follow Tuning

Status:
COMPLETE

---

## Problem Addressed

During zoomed playback (`scale > 1.0`), the viewport was reacting too late.
Active notes drifted toward the lower portion of the screen before a scroll
fired, temporarily weakening playback guidance and readability.

Root cause: `ContextAwareReadingWindow` used constant `deadZoneBottom = 0.65`
and `readingPosition = 0.30` regardless of zoom level. At higher zoom, bars
are visually taller in screen pixels — so the constant 65% boundary sits
progressively closer to the lower edge of the bar row as scale increases.
The viewport "felt passive" because the trigger threshold was too late relative
to actual visual content height.

---

## Files Modified

- `src/reading-window.js`
- `index.html`

---

## Changes Applied

### 1. Zoom-aware effective parameters in `_execute()` (`reading-window.js`)

Added `_viewportScale = 1.0` state field to `ContextAwareReadingWindow`.

In `_execute()`, base `deadZoneBottom` and `readingPosition` are now adjusted
by a proportional zoom formula before use:

```
zoomExcess       = Math.max(0, _viewportScale - 1.0)
effectiveBottom  = Math.max(0.42, deadZoneBottom  − zoomExcess × 0.12)
effectiveReadPos = Math.max(0.20, readingPosition − zoomExcess × 0.04)
```

**Effective dead zone bottom by scale:**

| Scale | effectiveBottom | Change vs 1.0 |
|-------|----------------|--------------|
| 1.0   | 0.65           | baseline     |
| 1.5   | 0.59           | −0.06        |
| 2.0   | 0.53           | −0.12        |
| 3.0   | 0.42 (floor)   | −0.23        |

**Effective reading position by scale:**

| Scale | effectiveReadPos | Change vs 1.0 |
|-------|-----------------|--------------|
| 1.0   | 0.30            | baseline     |
| 1.5   | 0.28            | −0.02        |
| 2.0   | 0.26            | −0.04        |
| 3.0   | 0.22            | −0.08        |

At scale 1.0: effective values equal base tuning values exactly — Task 2A
calm scrolling behavior is completely preserved.

### 2. `setViewportScale(scale)` public method (`reading-window.js`)

New method to receive scale updates from ViewportManager. Called on every
`onScaleChange` event. Zero overhead — stores a single float.

### 3. Composite `onScaleChange` callback (`index.html`)

The `.onScaleChange(_vpUpdateScaleLabel)` chain was separated from the
`viewportManager.init()` block. A composite callback replaces it:

```javascript
viewportManager.onScaleChange(s => {
  _vpUpdateScaleLabel(s);
  readingWindow.setViewportScale(s);
});
```

Placed after `readingWindow.init()` so both consumers are in scope.
Both behaviors preserved: UI scale label still updates on every zoom change.

---

## Balancing Rationale

**Why shrink deadZoneBottom at higher zoom?**
At scale 2.0, a bar row is visually ~2× taller. If the bar top reaches 53%
of viewport height (instead of 65%), the bar's lower edge is roughly at
53% + rowHeight%. At scale 2.0 with typical row height, this keeps the
active bar comfortably within the middle portion of the screen rather than
creeping toward the bottom third before triggering.

**Why shift readingPosition upward at higher zoom?**
Zoomed view shows fewer rows simultaneously. Positioning the active bar
slightly higher (26% at 2×) increases the count of fully visible upcoming
bars in the reading horizon, preserving musical readability.

**Why keep rates small (0.12, 0.04)?**
Larger rates would over-correct at moderate zoom (e.g., scale 1.5), causing
unnecessary scroll frequency. The gentle gradient keeps behavior natural
across the zoom range.

**Why not touch coalesceMs?**
Coalescing is tempo-driven, not zoom-driven. At higher zoom, bars still
change at the same musical rate. Reducing coalesceMs at high zoom would
increase scroll frequency without improving readability — the existing
100ms window remains correct.

---

## Architecture Validation

- RuntimeEngine unchanged ✓
- Renderer semantics unchanged ✓
- No SVG regeneration ✓
- ViewportManager unchanged ✓
- No new architectural systems ✓
- Changes additive / reversible ✓
- Task 2A calm scrolling fully preserved at scale 1.0 ✓

---

# 2026-05-28

### Task 2C — Orientation Stabilization: Left-Side Reading Anchor

Status:
COMPLETE

---

## Problem Addressed

During zoomed playback, users experienced spatial disorientation described as:
- "Piano reading orientation feels floating"
- "Grand staff continuity feels unstable"
- "Left-side musical anchoring becomes inconsistent"

Root cause: At scale > 1.0, `_panX` can be negative (viewport panned right to
follow specific notes). During playback, `ContextAwareReadingWindow` issued
vertical scrolls to keep the active bar in view, but never corrected horizontal
position. The score's left-side orientation anchors — clef, key signature, time
signature — remained off-screen across multiple bar changes. Without a visible
grand staff anchor, spatial context ("which staff am I reading?") weakened.

---

## Files Modified

- `styles/mobile-layout.css`
- `src/viewport-manager.js`
- `src/reading-window.js`
- `index.html`

---

## Changes Applied

### 1. CSS transition rule (`styles/mobile-layout.css`)

Added `.vp-orientation-reset` class — same pattern as the existing
`.vp-transitioning` class from LandscapeViewportCoordinator:

```css
#notation-camera.vp-orientation-reset {
  transition: transform 0.35s ease-out;
}
```

Enables smooth horizontal correction during a playback reframe without
adding transition to normal pan operations.

### 2. `ViewportManager.softOrientationReset()` (`src/viewport-manager.js`)

New public method that smoothly returns `_panX` to 0 (left origin):

- Adds `.vp-orientation-reset` class → sets `_panX = 0` → calls `_applyTransform()`
  (immediate, transition active via CSS class)
- Removes class after 400ms fallback timeout
- No-op if `_panX >= -4` (negligible drift)

Added `get panX()` getter so external callers can read current pan state.

**Pan-start class clearing**: Both `_attachTouchPan.onStart` and
`_attachMousePan.onDown` remove `.vp-orientation-reset` immediately, cancelling
any in-progress smooth transition. User pan interaction is never delayed.

### 3. Orientation threshold in `ContextAwareReadingWindow` (`src/reading-window.js`)

Added state:
- `_viewportManager = null` — reference set via `setViewportManager(vm)`
- `orientationThreshold = 50` — pre-scale px (≈5% of CANVAS_W = 960)

New method: `setViewportManager(vm)`.

In `_execute()`, **after** the vertical scroll fires, check:

```javascript
if (this._viewportManager &&
    this._viewportManager.panX < -this.orientationThreshold) {
  this._viewportManager.softOrientationReset();
}
```

Key design: orientation reset only fires when a **vertical scroll is already
being issued**. If the bar is within the dead zone (no vertical scroll), no
horizontal correction is issued. The viewport only adjusts when it was already
going to adjust.

### 4. Wiring (`index.html`)

Added: `readingWindow.setViewportManager(viewportManager);`

---

## Design Rationale

### Why only fire on vertical reframe?
Bar changes within the dead zone mean the viewport is comfortable — the user is
reading without interruption. Correcting horizontal position during comfortable
reading would be intrusive. Tying orientation reset to the reframe event means
corrections only happen at natural "phase change" moments.

### Why reset to panX = 0?
The start of a bar aligns with the left edge of the score row. panX = 0 places
the viewport at the score's left origin, ensuring the clef, key signature, and
time signature are fully visible — the maximal orientation context for a new bar.

### Why smooth (0.35s) rather than instant?
A vertical smooth scroll is already firing at the same time. An instant horizontal
jump during a smooth vertical scroll would be visually jarring. The 0.35s ease-out
completes faster than a typical bar duration at moderate tempo, keeping it snappy.

### Why orientationThreshold = 50?
The score's orientation zone (clef + key sig) occupies approximately the first
40-60 pre-scale px. At panX = -50, the left edge of the score (containing the
clef) is exactly off-screen. Values below 30 risk false positives on minor panning;
values above 80 risk missing meaningful drift.

### Why pan-start cancels the transition?
User pan begins at the exact moment they assert spatial intent. Their mental model
is that the pan starts responding immediately. A lingering 0.35s transition on the
camera transform would create input lag that breaks the pan feel.

---

## Behavior Summary

| State | Behavior |
|-------|----------|
| Scale 1.0 (fit-width) | No effect — panX is always 0 |
| Scale > 1, panX = 0 | No effect — already at origin |
| Scale > 1, pan < 50px | No effect — within threshold |
| Scale > 1, pan > 50px, bar in dead zone | No effect — no vertical reframe |
| Scale > 1, pan > 50px, bar exits dead zone | Smooth horizontal return to origin |
| User pans during a reset | Reset cancelled instantly |

---

## Architecture Validation

- RuntimeEngine unchanged ✓
- Renderer semantics unchanged ✓
- No SVG regeneration ✓
- No new architectural systems ✓
- Changes additive / reversible ✓
- All previous scrolling refinements (Task 2A, 2B) fully preserved ✓