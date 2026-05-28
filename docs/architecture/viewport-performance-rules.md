# Viewport Performance Rules

Status: CRITICAL  
Priority: HIGH

---

# 1. Purpose

Defines performance constraints for viewport systems.

The goal is to ensure:
- smooth playback
- stable rendering
- responsive mobile interaction

---

# 2. Critical Rule

Viewport interaction MUST NOT trigger:
- notation rerender
- SVG regeneration
- note recomputation

---

# 3. Approved Techniques

Allowed:
- transform: scale()
- transform: translate()
- requestAnimationFrame
- lightweight CSS transitions

---

# 4. Forbidden Techniques

Forbidden:
- continuous layout recalculation
- note-by-note resizing
- SVG regeneration during zoom
- runtime timing manipulation

---

# 5. Performance Goals

Target:
- smooth zoom
- smooth pan
- stable playback
- low mobile CPU usage

---

# 6. Mobile Stability

Viewport systems must remain stable on:
- Android phones
- iPad/tablets
- mid-range devices

---

# 7. Renderer Protection

Renderer should behave as:
> a stable visual canvas

Viewport systems wrap the renderer.
They do not modify renderer behavior.