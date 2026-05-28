# SightPlay — Mobile Viewport Architecture Roadmap

## Living Documentation (Update Continuously)

**Project:** MyKey Music Labs — SightPlay
**Document Type:** Living Architecture & Progress Roadmap
**Status:** ACTIVE
**Created:** 2026-05-25
**Architecture State:** Stabilization + Mobile UX Evolution Phase

---

# 1. Purpose of This Document

This document tracks the evolution of the new mobile-first viewport architecture for SightPlay.

This is NOT a rewrite plan.

This roadmap exists to ensure:

* renderer stability remains protected
* RuntimeEngine contracts remain untouched
* viewport/mobile UX evolves safely
* all future work follows architectural boundaries
* implementation remains additive and reversible

This document should be updated continuously as implementation progresses.

---

# 2. Core Philosophy

## IMPORTANT PRINCIPLE

SightPlay is evolving into:

> an interactive mobile piano practice workspace

NOT:

* a normal website
* a dashboard app
* a desktop-first notation viewer

Therefore:

* notation viewport becomes the primary experience
* controls become contextual overlays
* landscape becomes a first-class mode
* fullscreen practice becomes central UX

---

# 3. Frozen Core (Do Not Rewrite)

These systems are now considered architecture-stable.

Any modification must require explicit architectural justification.

---

## 3.1 Runtime Layer (Frozen)

Files:

```txt
src/runtime-engine.js
```

Authority:

* timeline progression
* playback lifecycle
* event enter/exit
* playback scope
* active events
* timing authority

DO NOT:

* rewrite callbacks
* alter enter/exit ordering
* modify event semantics
* change playback ownership

Reference:

* runtime-contract.md
* runtime-integration-roadmap.md

---

## 3.2 Renderer Layer (Frozen)

Files:

```txt
src/notation-renderer.js
```

Authority:

* notation rendering
* SVG generation
* stem direction
* beams
* ties
* spacing
* highlighting
* engraving semantics

DO NOT:

* rewrite engraving logic
* alter semantic interpretation
* modify tie rules
* modify beam rules
* manually position notes

Reference:

* engraving-standards.md
* engraving-validation-checklist.md
* music-notation-semantics.md

---

## 3.3 Semantic Layer (Frozen)

Files:

```txt
song.json
docs/music-notation-semantics.md
```

Authority:

* event identity
* timing truth
* tie semantics
* chord semantics
* note semantics

DO NOT:

* reinterpret semantics in viewport layer
* derive timing from SVG
* derive state from UI

---

# 4. Strategic Direction

Current project direction:

```txt
Architecture Freeze
        ↓
Stabilization
        ↓
Mobile Viewport Layer
        ↓
Overlay UX
        ↓
Immersive Practice Mode
        ↓
Advanced Mobile Interaction
```

Renderer evolution is NOT the current priority.

Viewport experience IS the current priority.

---

# 5. New Architecture Layer

## New Layer Philosophy

Instead of modifying:

```txt
RuntimeEngine
Renderer
Notation Semantics
```

We add:

```txt
Viewport Layer
Interaction Layer
Overlay UI Layer
```

This preserves:

* runtime integrity
* renderer integrity
* semantic integrity

while improving:

* usability
* readability
* mobile immersion
* piano practice workflow

---

# 6. Planned New Modules

---

## 6.1 viewport-manager.js

Status:

```txt
PLANNED
```

Responsibilities:

* zoom
* pan
* fit-width
* fit-height
* viewport transforms
* camera state
* fullscreen handling
* orientation awareness

Must NOT:

* know notation semantics
* know playback timing
* know runtime state internals

Architecture rule:
Viewport manager manipulates ONLY container transforms.

---

## 6.2 mobile-layout.css

Status:

```txt
PLANNED
```

Responsibilities:

* portrait layout
* landscape layout
* tablet layout
* fullscreen layout
* responsive spacing
* overlay positioning

Must NOT:

* alter renderer SVG logic
* manually resize note elements

---

## 6.3 mobile-gesture.js

Status:

```txt
OPTIONAL / FUTURE
```

Responsibilities:

* pinch zoom
* drag pan
* double tap zoom
* gesture smoothing

Must interact ONLY with viewport manager.

---

## 6.4 overlay-controls.js

Status:

```txt
FUTURE PHASE
```

Responsibilities:

* floating controls
* collapsible controls
* contextual UI
* auto-hide controls

Inspired by:

* MuseScore mobile
* video player overlays
* piano practice apps

---

## 6.5 performance-mode.js

Status:

```txt
FUTURE PHASE
```

Responsibilities:

* immersive notation mode
* fullscreen practice
* minimal UI
* piano stand mode

---

# 7. Viewport Architecture

Required structure:

```html
<div id="notation-viewport">
    <div id="notation-camera">
        <div id="notation-container"></div>
    </div>
</div>
```

Meaning:

| Layer              | Responsibility  |
| ------------------ | --------------- |
| notation-viewport  | clipping area   |
| notation-camera    | transform layer |
| notation-container | renderer output |

Renderer still renders normally into:

```txt
notation-container
```

Viewport layer handles:

* scale
* translate
* zoom
* pan

ONLY.

---

# 8. Critical Architecture Rules

---

## Rule 1 — Renderer Isolation

Renderer MUST remain unaware of:

* zoom state
* orientation
* mobile mode
* fullscreen mode

Renderer should continue behaving exactly as before.

---

## Rule 2 — Runtime Isolation

RuntimeEngine MUST remain unaware of:

* viewport
* gestures
* fullscreen
* camera movement

Playback architecture remains unchanged.

---

## Rule 3 — No SVG Regeneration During Zoom

Zoom must use:

```css
transform: scale()
translate()
```

DO NOT:

* rerender notation
* recreate SVG
* regenerate layout

---

## Rule 4 — Viewport Layer Is Presentation Only

Viewport is:

```txt
presentation architecture
```

NOT:

```txt
notation semantics
```

---

# 9. UX Direction

---

## 9.1 Landscape-First Practice Mode

Landscape is now considered:

```txt
PRIMARY PERFORMANCE MODE
```

Reason:

* piano usage alignment
* larger notation area
* natural reading flow
* tablet scalability

Portrait remains supported but secondary for performance usage.

---

## 9.2 Floating Overlay Philosophy

Future controls should become:

* contextual
* temporary
* collapsible
* auto-hide

Notation should dominate the screen.

---

## 9.3 Fullscreen Practice Philosophy

Future immersive mode:

* notation-first
* minimal distractions
* piano-stand optimized

Inspired by:

* MuseScore mobile
* digital sheet music readers
* video playback UX

---

# 10. Phase Planning

---

# PHASE 1 — VIEWPORT FOUNDATION

Status:

```txt
ACTIVE
```

Goals:

* responsive notation viewport
* orientation support
* fit-width
* zoom controls
* fullscreen support

No renderer changes.

---

# PHASE 2 — OVERLAY UX

Status:

```txt
PLANNED
```

Goals:

* floating controls
* collapsible sections
* bottom sheet controls
* reduced UI chrome

---

# PHASE 3 — IMMERSIVE PERFORMANCE MODE

Status:

```txt
PLANNED
```

Goals:

* fullscreen notation
* minimal UI
* piano stand workflow
* immersive practice

---

# PHASE 4 — ADVANCED MOBILE INTERACTION

Status:

```txt
FUTURE
```

Goals:

* smart follow camera
* adaptive zoom
* gesture navigation
* notation focus modes

---

# 11. Explicit Non-Goals (For Now)

DO NOT IMPLEMENT YET:

* renderer rewrite
* notation virtualization
* adaptive barsPerRow rendering
* semantic overlays
* gameplay overlays
* scoring overlays
* playback-follow camera logic
* auto-scroll intelligence
* SVG re-generation zooming

These belong to future phases.

---

# 12. Safety Principles

Every implementation step must be:

| Principle     | Meaning                     |
| ------------- | --------------------------- |
| Additive      | new layers only             |
| Isolated      | no core rewrites            |
| Reversible    | easy rollback               |
| Stable        | preserve renderer output    |
| Runtime-safe  | preserve playback integrity |
| Semantic-safe | preserve notation meaning   |

---

# 13. Success Criteria

Implementation is successful if:

* mobile usability improves significantly
* renderer visuals remain identical
* playback remains stable
* no semantic regression
* no timing regression
* no renderer rewrite required
* landscape experience becomes practical
* notation viewport becomes the main focus

---

# 14. Current Progress Log

## 2026-05-25

### Architecture Direction Established

Completed:

* mobile-first UX analysis
* MuseScore mobile comparison
* viewport-layer strategy
* overlay-control strategy
* landscape-first direction
* immersive notation concept
* architecture safety boundaries

Decision:
Viewport architecture will be additive and isolated from RuntimeEngine and notation-renderer.

---

# 15. Future Update Template

Use this structure for future updates:

```md
## YYYY-MM-DD
### Feature / Milestone Name

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
```

---

# 16. Final Strategic Note

The current renderer and runtime architecture are already strong.

The next major quality leap for SightPlay is NOT:

* deeper renderer complexity
* more notation semantics

The next leap is:

```txt
viewport experience quality
```

The future of SightPlay depends heavily on:

* readability
* mobile immersion
* piano workflow comfort
* fullscreen notation experience
* landscape usability

Therefore:

> viewport architecture is now a first-class system.
