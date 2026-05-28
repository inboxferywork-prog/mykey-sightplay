# Safe Integration Boundaries

Status: CRITICAL  
Priority: HIGH

---

# 1. Purpose

This document defines:
- safe integration points
- frozen systems
- forbidden modifications
- architectural safety boundaries

The goal is to protect the stable SightPlay core while allowing mobile UX evolution.

---

# 2. Frozen Core

The following systems are considered architecture-stable.

---

## RuntimeEngine

Frozen responsibilities:
- timeline authority
- event lifecycle
- playback state
- active events
- playback scope

DO NOT:
- modify callback ordering
- modify enter/exit semantics
- alter playback ownership

---

## notation-renderer.js

Frozen responsibilities:
- notation rendering
- ties
- beams
- stems
- spacing
- highlighting

DO NOT:
- rewrite engraving logic
- manually position notes
- reinterpret semantics

---

## song.json Semantics

Frozen responsibilities:
- timing truth
- event identity
- tie semantics
- chord semantics

DO NOT:
- derive semantics from SVG
- derive timing from UI

---

# 3. Safe Integration Areas

The following areas are SAFE for refinement:

- CSS layout
- wrapper containers
- viewport transforms
- overlay controls
- fullscreen logic
- orientation handling
- gesture systems

---

# 4. Unsafe Integration Areas

The following areas are HIGH RISK:

- renderer internal maps
- runtime internal state
- SVG semantic generation
- timing lifecycle
- event ownership
- note semantic interpretation

---

# 5. Additive Architecture Rule

All mobile UX evolution must be:
- additive
- layered
- isolated
- reversible

Avoid:
- rewrites
- deep coupling
- cross-layer dependencies

---

# 6. Renderer Protection Rule

The renderer should be treated as:
> a stable music canvas

NOT:
> a mutable layout engine

Viewport systems should wrap the renderer, not replace it.

---

# 7. Runtime Protection Rule

RuntimeEngine remains:
> the sole temporal authority

Viewport systems must never:
- advance playback
- derive timing
- synchronize audio
- manage event state

---

# 8. Success Condition

Architecture remains healthy if:
- renderer stability is preserved
- runtime stability is preserved
- mobile UX improves independently
- future rollback remains possible