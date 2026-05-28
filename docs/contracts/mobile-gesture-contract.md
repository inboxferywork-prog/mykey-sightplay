# Mobile Gesture Contract

File:
src/mobile-gesture.js

Status:
PLANNED

---

# 1. Responsibilities

MobileGesture owns:
- touch gesture detection
- pinch state
- drag state
- gesture smoothing

---

# 2. Allowed Interactions

MobileGesture MAY interact with:
- viewport manager
- overlay controls

---

# 3. Forbidden Interactions

MobileGesture MUST NOT:
- modify RuntimeEngine
- modify renderer semantics
- rerender notation
- manipulate playback timing

---

# 4. Gesture Rules

Gestures should:
- feel smooth
- avoid accidental triggers
- preserve playback stability

---

# 5. Performance Constraints

Must:
- use requestAnimationFrame
- avoid layout thrashing
- minimize DOM reads