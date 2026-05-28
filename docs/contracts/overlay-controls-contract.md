# Overlay Controls Contract

File:
src/overlay-controls.js

Status:
FUTURE

---

# 1. Responsibilities

OverlayControls owns:
- floating controls
- overlay visibility
- overlay layout
- overlay transitions

---

# 2. Allowed Responsibilities

OverlayControls MAY:
- show/hide controls
- reposition overlays
- collapse controls
- manage overlay animations

---

# 3. Forbidden Responsibilities

OverlayControls MUST NOT:
- modify renderer semantics
- manipulate runtime timing
- regenerate notation
- own playback state

---

# 4. Philosophy

Overlay controls are:
> temporary presentation elements

NOT:
> architectural authorities