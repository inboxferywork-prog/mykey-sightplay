# Responsive Layout Strategy

Status: ACTIVE  
Priority: HIGH

---

# 1. Purpose

This document defines responsive layout strategy for SightPlay.

Responsive strategy must prioritize:
- notation readability
- piano usability
- landscape workflows
- tablet scalability

---

# 2. Core Principle

Responsive layout is:
> capability-first

NOT:
> desktop-first shrinkage

---

# 3. Primary Device Modes

---

## Portrait Phone

Goals:
- compact controls
- fit-width notation
- vertical flow
- reduced clutter

---

## Landscape Phone

Goals:
- maximize notation width
- immersive practice
- floating controls
- piano workflow support

This becomes the PRIMARY practice mode.

---

## Tablet Landscape

Goals:
- immersive notation experience
- advanced practice workflow
- large viewport usability

---

## Desktop

Goals:
- compatibility
- optional advanced layout
- maintain renderer stability

---

# 4. Responsive Rules

Responsive systems should:
- preserve notation readability
- avoid unnecessary reflows
- avoid SVG regeneration
- maintain stable playback

---

# 5. Layout Priorities

Priority order:
1. notation visibility
2. playback usability
3. touch ergonomics
4. secondary controls

---

# 6. Future Expansion

Future possibilities:
- adaptive layouts
- dynamic overlay density
- tablet-specific UX
- immersive desktop mode