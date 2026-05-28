# Phase 1 Checklist — Viewport Foundation

Status: ACTIVE

---

# Goals

Build viewport foundation safely WITHOUT modifying:
- RuntimeEngine semantics
- notation-renderer semantics
- song.json semantics

---

# Checklist

## Foundation

- [x] Create viewport-manager.js
- [x] Create mobile-layout.css
- [x] Create viewport DOM structure
- [x] Preserve existing renderer integration

---

## Responsive Layout

- [x] Portrait layout
- [x] Landscape layout
- [x] Tablet layout
- [x] Fullscreen support

---

## Zoom System

- [x] Zoom in/out
- [x] Fit width
- [x] Zoom persistence (scale held in ViewportManager state)
- [x] Smooth transforms (requestAnimationFrame + will-change: transform)

---

## Pan System

- [x] Horizontal pan (transform-based, touch + mouse)
- [x] Vertical pan (native overflow-y scroll on #notation-viewport)
- [x] Pan boundaries (clamped to score edges in ViewportManager._clampPanX)

---

## Stability Validation

- [x] Renderer visually unchanged (renderer renders into #score, unmodified)
- [x] Playback stable (RuntimeEngine untouched)
- [x] No SVG regeneration (transform: scale only)
- [x] No runtime regression (zero RuntimeEngine changes)

---

## Documentation

- [x] Update devlog (docs/devlog/devlog-mobile-viewport.md)
- [ ] Update roadmap (Phase 1 marked complete — future task)
- [x] Document modified files

---

## Phase 1 Complete — 2026-05-26

Implementation: additive, isolated, reversible.
Revert path: remove 2 files (viewport-manager.js, mobile-layout.css) + revert index.html.

---

# Phase 1.5 Checklist — Refinement & Stabilization

## Fixes

- [x] fitWidth padding bug — _usableWidth() subtracts horizontal padding
- [x] _clampPanX padding bug — uses _usableWidth() consistently
- [x] Bottom padding buffer — 50px clears controls overlay
- [x] Horizontal viewport padding removed — simplifies width math
- [x] Resize handler debounced — 80ms, prevents RAF accumulation
- [x] Fullscreen button state — vp-active class + title update on enter/exit
- [x] onFullscreenChange callback — added to ViewportManager
- [x] Fullscreen CSS cleaned — removed !important, removed redundant size overrides
- [x] _applyTransform cleanup — omit translate when panX = 0
- [x] Landscape song-meta overflow — flex-wrap: nowrap prevents line wrap

## Stability Validation

- [x] No renderer changes
- [x] No RuntimeEngine changes
- [x] Architecture boundaries clean
- [x] All changes additive / reversible

## Deferred to Phase 2

- [ ] Pinch-to-zoom gesture (mobile-gesture.js)
- [ ] Touch gesture axis disambiguation
- [ ] Auto-hide overlay controls
- [ ] Landscape immersive mode (reduced header)

## Phase 1.5 Complete — 2026-05-26

---

# Phase 1.6 Checklist — Landscape Mode Refinement & Safe Area

## Landscape Coordinator

- [x] Create `src/landscape-coordinator.js` — LandscapeViewportCoordinator
- [x] Orientation class toggling (.vp-landscape / .vp-portrait on .score-card)
- [x] Fullscreen class toggling (.vp-fullscreen-active on .score-card)
- [x] Rotation transition guard (.vp-transitioning on #notation-camera, 380ms)
- [x] Wire coordinator in index.html (after viewportManager init)

## Safe Area Insets

- [x] Add `viewport-fit=cover` to viewport meta tag in index.html
- [x] Add `:root { --vp-safe-bottom, --vp-safe-right, --vp-safe-left }` CSS vars
- [x] Update .viewport-controls positioning to use calc() + var()
- [x] Update #notation-viewport padding-bottom to include safe area
- [x] Update portrait / landscape / fullscreen / touch media query overrides

## Fullscreen Selector Fix

- [x] Fix `:fullscreen .score-card` → `.score-card:fullscreen` (descendant → element)
- [x] Fix `:-webkit-full-screen .score-card` → `.score-card:-webkit-full-screen`
- [x] Update all nested fullscreen child selectors accordingly

## Transition Guard CSS

- [x] Add `#notation-camera.vp-transitioning { transition: transform 0.28s ease-out }`

## Stability Validation

- [x] RuntimeEngine unchanged
- [x] Renderer semantics unchanged
- [x] Architecture boundaries clean
- [x] All changes additive / reversible

## Documentation

- [x] Update devlog (Phase 1.6 entry)
- [x] Update checklist

## Phase 1.6 Complete — 2026-05-26

---

# Task 2A Checklist — Context-Aware Musical Reading Window

## Core Implementation

- [x] Create `src/reading-window.js` — ContextAwareReadingWindow class
- [x] Dead zone logic ([deadZoneTop, deadZoneBottom] prevents constant recentering)
- [x] Anticipatory vertical positioning (readingPosition = 30% from top)
- [x] Scroll coalescing (100ms debounce absorbs rapid bar changes)
- [x] Coordinate derivation (scroll container unscaled → no scale factor needed)
- [x] `_findBarEl()` using `data-bar` attribute tagged by notation-renderer

## Integration

- [x] Add `<script src="src/reading-window.js">` to index.html
- [x] Initialize ContextAwareReadingWindow after ViewportManager
- [x] Replace `renderer.scrollToBar(ev.bar)` in onEventEnter with `readingWindow.scrollToBar()`
- [x] Keep all other `renderer.scrollToBar()` calls unchanged (segment/loop jump-to)

## Architecture Safety

- [x] RuntimeEngine unchanged
- [x] Renderer semantics unchanged (scrollToBar still exists, used for non-playback nav)
- [x] No SVG regeneration
- [x] Additive / reversible

## Documentation

- [x] Devlog entry (Task 2A)
- [x] Tuning parameters documented
- [x] Future extension points documented (Task 2B)
- [x] Checklist updated

## Task 2A Complete — 2026-05-27

---

# Task 2B Checklist — Zoom-Aware Viewport Follow Tuning

## Core Implementation

- [x] Add `_viewportScale = 1.0` state to ContextAwareReadingWindow
- [x] Add `setViewportScale(scale)` public method
- [x] Zoom-aware `effectiveBottom` in `_execute()` (shrinks 0.12/unit, floor 0.42)
- [x] Zoom-aware `effectiveReadPos` in `_execute()` (shifts 0.04/unit, floor 0.20)
- [x] Base tuning values unchanged (scale 1.0 behavior fully preserved)

## Integration

- [x] Composite `onScaleChange` callback in index.html (UI label + readingWindow)
- [x] Placed after `readingWindow.init()` (ensures both consumers are in scope)

## Architecture Safety

- [x] RuntimeEngine unchanged
- [x] ViewportManager unchanged
- [x] Renderer semantics unchanged
- [x] No new architectural systems
- [x] Additive / reversible

## Documentation

- [x] Devlog entry (Task 2B) — problem, changes, balancing rationale
- [x] Tuning tables documented (effectiveBottom and effectiveReadPos by scale)
- [x] Checklist updated

## Task 2B Complete — 2026-05-27

---

# Task 2C Checklist — Orientation Stabilization: Left-Side Reading Anchor

## Core Implementation

- [x] Add `#notation-camera.vp-orientation-reset { transition: transform 0.35s ease-out }` CSS rule
- [x] Add `get panX()` getter to ViewportManager
- [x] Add `softOrientationReset()` to ViewportManager
  - [x] Adds `.vp-orientation-reset` class for smooth transition
  - [x] Resets `_panX = 0`, applies transform
  - [x] Removes class via 400ms fallback timeout
  - [x] No-op if `_panX >= -4` (negligible drift)
- [x] Pan-start clears `.vp-orientation-reset` (touch + mouse) — user pan never delayed
- [x] Add `_viewportManager = null` state to ContextAwareReadingWindow
- [x] Add `orientationThreshold = 50` tuning param (pre-scale px)
- [x] Add `setViewportManager(vm)` public method
- [x] Orientation reset call in `_execute()` — gated behind vertical reframe

## Integration

- [x] `readingWindow.setViewportManager(viewportManager)` in index.html
- [x] Placed after `readingWindow.init()` (scope safe)

## Architecture Safety

- [x] RuntimeEngine unchanged
- [x] Renderer semantics unchanged
- [x] No new architectural systems
- [x] Additive / reversible
- [x] Task 2A and 2B behavior fully preserved

## Documentation

- [x] Devlog entry (Task 2C) — problem, changes, design rationale, behavior table
- [x] `orientationThreshold` tuning range documented
- [x] Checklist updated

## Task 2C Complete — 2026-05-28