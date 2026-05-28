# Overlay Controls Architecture

Status: PLANNED  
Layer Type: Presentation Layer  
Priority: HIGH

---

# 1. Purpose

This document defines the overlay controls system for SightPlay.

The overlay system exists to:
- reduce UI clutter
- maximize notation visibility
- support immersive practice
- improve mobile usability
- support fullscreen workflows

---

# 2. Philosophy

Controls are NOT the primary focus.

Notation is the primary focus.

Overlay controls should feel:
- lightweight
- temporary
- contextual
- non-intrusive

Inspired by:
- MuseScore mobile
- video player overlays
- digital sheet music readers

---

# 3. Overlay Principles

## 3.1 Temporary Visibility

Controls should eventually support:
- auto-hide
- fade-in
- contextual appearance

---

## 3.2 Minimal Screen Occupancy

Controls should minimize:
- vertical space usage
- notation obstruction
- persistent chrome

---

## 3.3 Mobile-First Interaction

Controls must be:
- touch friendly
- reachable
- landscape compatible
- tablet scalable

---

# 4. Planned Overlay Types

---

## Floating Playback Controls

Examples:
- play
- pause
- replay
- next segment

---

## Floating Zoom Controls

Examples:
- zoom in
- zoom out
- fit width
- reset zoom

---

## Floating Practice Controls

Examples:
- hand filter
- tempo
- segment selection
- practice loop

---

## Bottom Sheet Controls

Future:
- advanced settings
- debug tools
- practice settings
- playback options

---

# 5. Overlay Layering

Overlay controls should exist ABOVE:
- notation viewport
- notation SVG
- keyboard layer

WITHOUT modifying renderer output.

---

# 6. Overlay Isolation Rule

Overlay systems MUST NOT:
- modify notation semantics
- manipulate RuntimeEngine internals
- regenerate SVG
- control renderer logic

Overlay systems are presentation-only.

---

# 7. Future Evolution

Future features may include:
- contextual overlays
- smart controls
- gesture-triggered overlays
- adaptive controls
- immersive fullscreen overlays

These remain additive systems.