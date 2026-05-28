# Viewport Manager Contract

File:
src/viewport-manager.js

Status:
PLANNED

Layer:
Presentation Layer

---

# 1. Purpose

ViewportManager owns:
- zoom state
- pan state
- fullscreen state
- viewport transforms
- orientation awareness

ViewportManager does NOT own:
- playback timing
- notation semantics
- renderer logic
- event lifecycle

---

# 2. Authority

ViewportManager is the ONLY owner of:
- viewport scaling
- viewport transforms
- viewport camera state

No other module should directly manipulate:
- notation-camera transforms
- viewport scale state

---

# 3. Required Responsibilities

ViewportManager MUST support:
- fit-width mode
- fit-height mode
- manual zoom
- pan
- fullscreen mode
- orientation updates

---

# 4. Forbidden Responsibilities

ViewportManager MUST NOT:
- rerender notation
- regenerate SVG
- modify song.json
- modify renderer semantics
- modify RuntimeEngine state
- modify playback timing

---

# 5. Integration Boundaries

ViewportManager MAY interact with:
- index.html
- CSS layout
- gesture layer
- overlay controls

ViewportManager MUST NOT interact directly with:
- runtime-engine internals
- renderer internal maps
- notation semantics

---

# 6. Zoom Rules

Zoom implementation MUST use:
- transform: scale()
- transform: translate()

Zoom implementation MUST NOT:
- resize noteheads individually
- recompute notation layout
- regenerate renderer output

---

# 7. Performance Rules

ViewportManager should:
- minimize layout thrashing
- use requestAnimationFrame for smooth transforms
- avoid unnecessary DOM reads
- preserve playback smoothness

---

# 8. Future Expansion

Future optional features:
- smart follow camera
- playback focus mode
- animated transitions
- minimap navigation
- adaptive focus regions

These must remain additive.