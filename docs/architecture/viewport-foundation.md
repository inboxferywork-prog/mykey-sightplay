# Viewport Foundation Architecture

Status: ACTIVE  
Layer Type: Presentation Layer  
Risk Level: LOW (additive architecture only)

---

# 1. Purpose

This document defines the viewport architecture layer.

The viewport layer exists to:
- improve mobile usability
- improve notation readability
- support zoom and pan
- support fullscreen interaction
- support landscape piano usage

WITHOUT modifying:
- RuntimeEngine
- notation-renderer
- notation semantics

---

# 2. Core Principle

The viewport layer is:

> a presentation wrapper around the renderer

NOT:
- a renderer replacement
- a semantic layer
- a timing layer

---

# 3. Required DOM Structure

```html
<div id="notation-viewport">
    <div id="notation-camera">
        <div id="notation-container"></div>
    </div>
</div>
```

---

# 4. Layer Responsibilities

| Layer | Responsibility |
|---|---|
| notation-viewport | clipping area |
| notation-camera | transform layer |
| notation-container | renderer output |

---

# 5. Renderer Isolation Rule

notation-renderer.js MUST remain unaware of:
- zoom state
- viewport state
- orientation state
- fullscreen state

Renderer should continue rendering exactly as before.

---

# 6. Runtime Isolation Rule

RuntimeEngine MUST remain unaware of:
- viewport
- gestures
- fullscreen
- camera state

Playback flow remains untouched.

---

# 7. Zoom Strategy

Zoom must use:
- CSS transforms
- scale()
- translate()

DO NOT:
- regenerate SVG
- rerender notation
- recompute note positions

---

# 8. Viewport Responsibilities

The viewport layer may control:
- scale
- pan
- clipping
- fullscreen
- orientation handling

The viewport layer must NOT control:
- timing
- notation semantics
- playback logic
- event lifecycle

---

# 9. Future Expansion

Future systems may build on top of the viewport layer:
- gesture system
- follow camera
- immersive mode
- smart auto-scroll
- minimap navigation

These are additive systems.

---

# 10. Success Criteria

Viewport foundation is considered successful if:
- renderer output remains visually identical
- playback remains stable
- zoom is smooth
- no SVG regeneration occurs
- landscape mode improves usability