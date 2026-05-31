# Project Handoff — Engraving Audit Phase

**Date:** 2026-05-30
**Session context:** Stabilization + Product Shaping phase

---

## 1. Project Overview

**MyKey Music Labs — Guided Piano Learning Platform**

Primary goals:

- Home practice companion
- Support teacher-guided learning
- Improve lesson preparation
- Long-term musicianship development

Core philosophy: MyKey is a home practice companion, not a teacher replacement. Teacher-guided learning is a foundational product principle.

---

## 2. Documentation Status

Documentation foundation is considered **complete and frozen** unless major product direction changes occur.

| Document | Location |
|---|---|
| SPEC.md | `docs/` |
| DEVLOG.md | `docs/devlog/` |
| PRODUCT_VISION.md | `docs/product/` |
| PRODUCT_ROADMAP.md | `docs/product/` |
| DECISION_LOG.md | `docs/product/` |

Do not add new top-level documentation unless a major product direction change warrants it.

---

## 3. Current Product Phase

**Stabilization + Product Shaping**

### Recently completed work

- Portrait reading card refinement
- Android readability improvements
- Grand staff bracket fix
- Right-side system barline fix

### Architecture constraints

The renderer architecture is **frozen**. Do not begin:

- Runtime rewrites
- Renderer rewrites
- Viewport rewrites

Stabilization discipline must be preserved through this phase.

---

## 4. Current Engraving Audit Initiative

### Purpose

Audit renderer completeness using dedicated `song.json` test assets. Each file isolates one engraving topic for visual validation.

### Existing audit files

Located in the songs directory alongside other test assets:

| File | Topic |
|---|---|
| `test_accidentals.json` | Accidentals |
| `test_stem_direction.json` | Stem direction |
| `test_dotted_notes.json` | Dotted notes |

### Current task — create additional audit files

One engraving topic per file. Visual validation only — no automated assertions.

**Tier 1 (highest priority)**

- Rests
- Ties / slurs
- Beaming
- Key signatures

**Tier 2**

- Dynamics
- Articulations
- Tempo markings
- Endings

**Tier 3**

- Tuplets
- Octave markings
- Navigation symbols
- Pedal markings

Work through tiers in order. Each file should expose a range of cases for that topic so rendering gaps are immediately visible on screen.

---

## 5. Important Product Decisions

| Concept | Layer |
|---|---|
| Learning States | Teaching Layer |
| Reports | Assessment Layer |
| Certificates | Assessment Layer |
| Stars / Unlocks / Achievements | Motivation Layer |

**Reading Comfort > Notation Density** — layout decisions should favor legibility over information density, especially on small screens.

---

## 6. Next Planned Phase

**Song Management Discovery** — begins only after engraving audit is complete.

Topics to explore during discovery:

- Song browser
- Continue learning
- Favorites
- Recently played
- Metadata
- Teacher song assignment workflow
- Unlisted content workflow

**Do not begin implementation.** Discovery and planning only.

---

## 7. Session Goal

The current objective is **not** feature expansion.

The current objective is:

- Renderer audit completeness
- Renderer validation
- Preserve stabilization phase discipline

Stay focused on creating the remaining Tier 1, 2, and 3 engraving audit song files and validating them visually in the app.

---

## 8. Approved Product Decisions — Repeat and Navigation Architecture

**Date approved:** 2026-05-31  
**Reference:** [`docs/import/linear_learning_path_generator.md`](../import/linear_learning_path_generator.md)

### Runtime is strictly linear

The RuntimeEngine will never execute:

- Repeat jumps
- D.C. (Da Capo) jumps
- D.S. (Dal Segno) jumps
- Coda routing
- Fine termination logic

Students always experience a simple, linear sequence of segments. No navigation processing occurs at runtime.

### Repeat symbols are Learning Aids

Repeat barlines and volta brackets are displayed by the renderer for musical literacy. They are visual notation objects only. They have no effect on playback order.

### Navigation symbols are Learning Aids

Segno, Coda, Fine, D.C., D.S., D.C. al Fine, D.S. al Coda are displayed by the renderer for musical literacy. They are literacy objects only. They do not control playback.

### Expansion occurs during import

All repeat and navigation structures are resolved at import time by the Linear Learning Path Generator. The generator produces a flat, ordered `learning_path.bars` sequence in `song.json`. The runtime reads this sequence directly.

### Exam mode

Many students practice for graded examinations where written repeats are not performed. The default expansion policy (`"full"`) expands all repeats for practice. A future `"none"` policy (no expansion, straight-through) is architecturally reserved. See the design document for details.
