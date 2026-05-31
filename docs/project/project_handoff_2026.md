# MyKey SightPlay — Project Handoff 2026

**Document type:** Primary onboarding reference for new engineer sessions  
**Date:** 2026-05-31  
**Phase:** Stabilization + Product Shaping  
**Reading time:** ~10 minutes  

---

## 1. Project Overview

**MyKey Music Labs** is a guided piano learning platform. Students learn to read and play real piano music — from first notes through independent musicianship.

### Pipeline

```
MuseScore (composition)
    ↓ Export MusicXML (.mxl / .xml)
tools/mxl_to_song.py
    ↓ Produces
songs/*.json  (song.json)
    ↓ Loaded by
NotationRenderer  →  SVG score display
RuntimeEngine     →  timeline, event dispatch, playback timing
KeyboardEngine    →  note detection, highlight sync
```

### Core Philosophy

`song.json` is the **single source of semantic truth** for the entire system.

- The renderer reconstructs MuseScore-quality notation from `song.json`.
- The runtime consumes timing and pitch data from `song.json`.
- No engine modifies `song.json` at runtime.
- No engine infers pitch or timing from audio or SVG geometry.

---

## 2. Current Project Phase

**Stabilization + Product Shaping — ACTIVE**

The engraving stabilization initiative is **complete**. The renderer now supports the full standard notation set required for beginner-through-intermediate piano repertoire.

The next focus is **Song Management / Content Scalability** (Phase 2 of the product roadmap).

### What is complete

- Notation renderer: all standard engraving features implemented and verified
- Import pipeline: MusicXML → song.json with full repeat, navigation, ottava, and slur support
- Learning path generator: automatic segment expansion with bar-level granularity
- Architecture: frozen — all layers have stable contracts

### What is not started

- Song browser UI
- Student progress persistence
- Mastery tracking
- Audio/microphone integration (Phase 4+)

---

## 3. Architecture Freeze

The following systems are **stable and frozen**. Do not redesign, refactor, or extend without a formal product decision recorded in `docs/product/DECISION_LOG.md`.

| System | Location | Contract |
|---|---|---|
| RuntimeEngine | `src/runtime-engine.js` | `docs/runtime-contract.md` |
| NotationRenderer | `src/notation-renderer.js` | `docs/music-notation-semantics.md` |
| song.json schema | `songs/*.json` | `docs/music-notation-semantics.md` §4 |
| Learning path generator | `tools/linear_learning_path_generator.py` | `docs/import/linear_learning_path_generator.md` |
| Authoring workflow | `tools/mxl_to_song.py` | `docs/import/` sprint notes |

### Frozen architecture invariants

**RuntimeEngine authority**
- Owns `currentTime`, `state`, `activeEvents`, `scopeStart/scopeEnd`
- Only source of timing truth — no other engine reads or writes these
- All communication is one-directional: RuntimeEngine → callbacks → other engines

**Passive renderer**
- Renderer is a pure visual interpreter. It receives song data and renders it.
- Renderer does not own timing, pitch truth, or playback state
- Renderer calls: `render(songData, containerEl, opts)`, `highlight(eventId, style)`, `clearAll()`

**Guided learning segments**
- Segments are authored at import time via `linear_learning_path_generator.py`
- Each segment is a contiguous bar range in `song.json → learning_path.bars[]`
- Runtime selects a segment by resolving `partId → bar range → t_ms window`

**PracticeLoop / note-event selection**
- RuntimeEngine emits `onEventEnter` / `onEventExit` for each event crossing the playhead
- UI layers subscribe to these callbacks; they do not inspect or advance the timeline

**Keyboard sync**
- KeyboardEngine receives `activeEvents` from RuntimeEngine callbacks
- Keyboard highlight state is driven by event data, never by audio pitch detection

**Note-name overlays**
- Note name display is driven by `song.json notes[]` (sounding pitch)
- Overlay position is driven by VexFlow SVG element coordinates from `_noteElMap`

**Focused rendering**
- `render(data, el, { visibleBars: [...], visibleClefs: [...] })` renders a filtered subset
- Filtering happens inside the renderer — RuntimeEngine is unaware of visual filtering

**Playback timing**
- `t_ms` values in `song.json` are computed at import time via the tempo map
- RuntimeEngine uses `t_ms` directly — no re-computation at runtime

**Segment playback**
- RuntimeEngine resolves `partId` to `{ scopeStart, scopeEnd }` in ms, not bars
- Bar numbers are not used by RuntimeEngine at playback time

---

## 4. Completed Milestones

### Engraving Stabilization (Phase 1 — Complete)

| Feature | Status | Notes |
|---|---|---|
| Bravura font migration | Complete | VexFlow 5.0.0 + Bravura SMuFL paths via CDN |
| Grand staff layout | Complete | Brace, single-left, single-right connectors; portrait/landscape row height |
| Accidentals | Complete | Per-bar carry rules; key-signature defaults; natural cancellation |
| Key signatures | Complete | All major and minor keys; per-bar reset |
| Stem direction | Complete | Gould furthest-note rule; beamed group unification |
| Beaming | Complete | Beat-grouped beams; flag suppression invariant |
| Dotted notes | Complete | Dot modifier per notehead; duration map |
| Ties | Complete | Same-row StaveTie; cross-row half-tie; chord tie per pitch |
| Rests | Complete | All standard durations; whole rest fallback for empty bars |
| Dynamics | Complete | pp / p / mp / mf / f / ff; grand-staff gap placement |
| Staccato | Complete | Opposite-stem placement; explicit VF position flag |
| Slur rendering | Complete | Custom SVG Bezier lens-shape path |
| Cross-row slur | Complete | Split arcs at row boundary via `_rowBounds` Map |
| Repeat barlines | Complete | Forward and backward repeat; `repeat_start / repeat_end` |
| Volta brackets | Complete | 1./2. brackets via `VF.Volta`; BEGIN / MIDDLE / END type detection |
| Navigation symbols | Complete | Segno (VF.Glyph path), Coda, Fine, D.C., D.S., D.C. al Fine, D.S. al Coda |
| Ottava 8va / 8vb | Complete | Import: Sprint 8A. Renderer: Sprint 8B. See §5 below. |

### Import Pipeline (Complete)

| Sprint | Deliverable |
|---|---|
| Sprint 1A | Basic MusicXML → song.json; note/rest/chord events |
| Sprint 2A | Key signature, time signature, BPM; tempo map |
| Sprint 2B | Ties; pickup bar detection |
| Sprint 3A | Repeats, volta; `build_repeat_map()` |
| Sprint 4A | Learning path generator integration; `lp_bar` segments |
| Sprint 7A | Slur flags; `slur_start / slur_stop` per event |
| Sprint 8A | Ottava import; `notes[]` (sounding), `written_notes[]` (written), `octave_mark_start / _stop` |

---

## 5. Ottava Architecture

Ottava brackets (8va / 8vb) require two parallel pitch representations because the same note has different meanings in two contexts:

| Context | Pitch used | Field |
|---|---|---|
| Notation (what is written on the staff) | Written pitch | `written_notes[]` |
| Runtime (what key the student presses) | Sounding pitch | `notes[]` |

### song.json event fields

```json
{
  "id": "ev_000001",
  "type": "note",
  "notes": ["C6"],           // sounding pitch — used by RuntimeEngine, keyboard, audio
  "written_notes": ["C5"],   // written pitch — used by NotationRenderer for staff position
  "octave_mark_start": "8va", // first note of span
  ...
}
```

```json
{
  "id": "ev_000004",
  "notes": ["F6"],
  "written_notes": ["F5"],
  "octave_mark_stop": true,  // last note of span
  ...
}
```

### Renderer behavior

- `_buildNotes()` uses `ev.written_notes || ev.notes` for VexFlow key construction
- Notes appear at written pitch position on the staff
- `_drawOttava()` renders `VF.TextBracket` brackets from `octave_mark_start` → `octave_mark_stop`
- RuntimeEngine is **not modified** — it continues to use `notes[]` (sounding pitch) for event matching

### Importer behavior

- `tools/mxl_to_song.py` pre-parses `score.spannerBundle` for `music21.spanner.Ottava`
- 8va: `semitones = +12`; 8vb: `semitones = -12`
- `notes[]` = `written_pitch.transpose(semitones)` (sounding)
- `written_notes[]` = `written_pitch` (as notated)

### Non-ottava events

Events without `written_notes` (all existing songs) fall back to `notes` in the renderer — backward compatible.

---

## 6. Known Remaining Edge Cases

These are **low priority** and do not affect standard piano repertoire for beginner-intermediate learners.

| Case | Description | Current behavior |
|---|---|---|
| Multi-row slur | Slur spanning more than one system break | Silently discarded; no arc drawn |
| Multi-row ottava | 8va/8vb bracket spanning more than one system break | Silently discarded; first-row segment still renders |
| 15ma / 15mb | Double-octave marks | Not imported; warning emitted by importer |

To implement: slur would need an additional half-arc per middle row in `_drawSlurs`; ottava would need additional continuation segments in `_drawOttava`.

---

## 7. Current Product Priorities

Engraving is no longer the primary focus. The renderer has reached the quality threshold required to support real repertoire — further engraving work should only happen when a specific song requires a feature not yet present.

**Priority order (Phase 2 — Song Management):**

1. **Song Management** — The app currently has a small set of test songs. Real content needs to be added, organized, and discoverable.
2. **Content Scalability** — The import pipeline produces correct `song.json` files, but no tooling exists to manage a growing library. Song index, metadata, and update workflows need to scale.
3. **Song Browser** — Students need a UI to find songs by level, style, or recent activity.
4. **Metadata System** — Each song needs level, style, composer, and duration metadata for filtering.
5. **Difficulty Categories** — Level system (early beginner → advanced) must be consistently applied to all songs.
6. **Learning Hub** — A home screen that guides students to what to practice next.
7. **UI Refinement** — Portrait/landscape transitions, touch target sizes, and visual polish.

**Why not more engraving:** The renderer can now faithfully represent standard beginner-through-intermediate piano notation. Remaining edge cases (multi-row slurs, 15ma) appear in advanced repertoire that is not in the current content scope. Investing in engraving at this stage produces diminishing returns against the much larger gap: no real content for students to learn.

---

## 8. Important Documentation Index

### Product

| Document | Path | Purpose |
|---|---|---|
| Product Vision | `docs/product/PRODUCT_VISION.md` | Why the product exists; target users; educational philosophy |
| Product Roadmap | `docs/product/PRODUCT_ROADMAP.md` | Phase sequence; what each phase delivers |
| Decision Log | `docs/product/DECISION_LOG.md` | Rationale for major architectural and product decisions |

### Architecture & Runtime

| Document | Path | Purpose |
|---|---|---|
| Music Notation Semantics | `docs/music-notation-semantics.md` | Layer authority; song.json contract; semantic invariants |
| Runtime Contract | `docs/runtime-contract.md` | RuntimeEngine public API; what it owns; callback contract |
| Runtime Integration Roadmap | `docs/runtime-integration-roadmap.md` | How layers integrate; integration sequence |
| Learning Segment Architecture | `docs/learning-segment-architecture.md` | Segment system design; part navigation; lp_bar schema |

### Engraving

| Document | Path | Purpose |
|---|---|---|
| Engraving Standards | `docs/engraving-standards.md` | Renderer implementation law; all engraving decisions |
| Engraving Validation Checklist | `docs/engraving-validation-checklist.md` | Regression acceptance criteria |
| Known VexFlow Behaviors | `docs/engraving/known_vexflow_behaviors.md` | VexFlow 5.0.0 quirks; Repetition anchor fix; Segno path rendering; TextBracket applyStyle issue |
| Engraving Audit | `docs/engraving/ENGRAVING_AUDIT.md` | Feature completeness audit |
| Repository Feature Inventory | `docs/engraving/repository_feature_inventory.md` | What features exist in the codebase |
| Engraving Quality Audit | `docs/engraving/engraving_quality_audit.md` | Visual quality pass results |
| Repeat Import Audit | `docs/engraving/repeat_import_audit.md` | Repeat/volta import fidelity findings |
| Navigation Audit | `docs/engraving/navigation_audit.md` | Navigation symbol audit results |

### Import Pipeline

| Document | Path | Purpose |
|---|---|---|
| Learning Path Generator | `docs/import/linear_learning_path_generator.md` | How lp_bar expansion works; segment schema |
| Ottava Import | `docs/import/ottava_import.md` | 8va/8vb import; notes[] vs written_notes[] contract |
| Sprint 1A–4A Notes | `docs/import/sprint_*.md` | Historical implementation notes per sprint |

### UI / Layout

| Document | Path | Purpose |
|---|---|---|
| UI Design System | `docs/ui-design-system.md` | Color tokens; typography; spacing |
| UI Theme Architecture | `docs/UI_THEME_ARCHITECTURE.md` | CSS custom properties; theme system |
| Authoring Workflow | `docs/authoring-workflow.md` | Song authoring; segment editor; index update |
| Authoring Pedagogy Guide | `docs/authoring-pedagogy-guide.md` | How to choose difficulty; segment sizing |
| Viewport Foundation | `docs/architecture/viewport-foundation.md` | Responsive layout; portrait/landscape modes |
| Safe Integration Boundaries | `docs/architecture/safe-integration-boundaries.md` | What is safe to modify without breaking the runtime |

### Mobile / Architecture

| Document | Path | Purpose |
|---|---|---|
| Mobile Viewport Roadmap | `docs/architecture/mobile-viewport-roadmap.md` | Mobile layout phase plan |
| Responsive Layout Strategy | `docs/architecture/responsive-layout-strategy.md` | Breakpoint strategy |
| Overlay Controls Architecture | `docs/architecture/overlay-controls-architecture.md` | FAB / overlay control design |
| Performance Mode Architecture | `docs/architecture/performance-mode-architecture.md` | Performance mode design |
| Mobile Gesture Architecture | `docs/architecture/mobile-gesture-architecture.md` | Touch gesture handling |

### Handoffs

| Document | Path | Purpose |
|---|---|---|
| Engraving Audit Phase Handoff | `docs/handoffs/HANDOFF_ENGRAVING_AUDIT_PHASE.md` | Status at end of engraving audit sprint |
| Portrait Reading Mode Handoff | `docs/handoffs/portrait-reading-mode-handoff.md` | Portrait layout implementation state |

### Debug

| Document | Path | Purpose |
|---|---|---|
| Mobile Debug Screenshots | `docs/debug/` | iPhone/Android layout comparison images |
| Engraving Screenshots | `docs/engraving/screenshots/` | Bravura screenshot audit outputs |

---

## 9. Important Test Fixtures

All fixtures in `songs/` are visual or functional verification files. They test isolated notation topics and are not production songs.

### Engraving verification

| File | Purpose |
|---|---|
| `songs/simple_test.json` | Basic clefs, noteheads, grand staff layout |
| `songs/test_rests.json` | All rest durations; whole-rest fallback |
| `songs/test_accidentals.json` | Sharp, flat, natural, double-sharp, double-flat; bar carry rules |
| `songs/test_key_signatures.json` | All major/minor key signatures |
| `songs/test_dynamics.json` | pp/p/mp/mf/f/ff; grand-staff gap placement |
| `songs/test_staccato_slur.json` | Staccato dots; same-row slurs |
| `songs/test_cross_system_slurs.json` | Cross-row slurs — Cases A (same-row), B (1 break treble), C (1 break bass) |
| `songs/test_cross_system_slur_single_clef.json` | Cross-row slur in single-clef mode (ROW_H=120 verification) |
| `songs/test_octave_marks.json` | 8va / 8vb brackets; bracket placement above/below stave |
| `songs/test_stem_direction.json` | Gould furthest-note stem direction |
| `songs/test_dotted_notes.json` | Dotted note durations |
| `songs/test_beaming.json` | Beat-grouped beams; 8th and 16th note groups |
| `songs/test_ties_slurs.json` | Tie arcs; chord ties |
| `songs/test_tuplets.json` | Triplet notation (import only — renderer renders as fallback) |
| `songs/test_pedal_markings.json` | Pedal notation (schema exists; renderer pending) |
| `songs/test_articulations.json` | Staccato; future articulations |

### Repeat / navigation verification

| File | Purpose |
|---|---|
| `songs/test_endings.json` | Repeat barlines; volta brackets |
| `songs/test_navigation_symbols.json` | Segno, Coda, D.C., D.S., Fine |
| `songs/test_navigation_symbols_full.json` | All navigation combinations |
| `songs/test_segno_placement.json` | Segno position: middle, last, first-of-row |

### Linearization verification

| File | Purpose |
|---|---|
| `songs/test_repeat_linearization.json` | Simple repeat unrolling |
| `songs/test_volta_linearization.json` | Volta bracket linearization |
| `songs/test_dc_linearization.json` | D.C. linearization |
| `songs/test_dc_al_fine_linearization.json` | D.C. al Fine linearization |
| `songs/test_ds_linearization.json` | D.S. linearization |
| `songs/test_ds_al_coda_linearization.json` | D.S. al Coda linearization |
| `songs/test_import_verification.json` | General import fidelity check |

### Source files

| File | Purpose |
|---|---|
| `songs/source/test_ottava.xml` | MusicXML ottava fixture (4 cases: 8va same-bar, 8va cross-bar, 8vb same-bar, 8vb cross-bar) |

### Production songs

| File | Purpose |
|---|---|
| `songs/0101 Roti Panas-Piano.json` | First real song in the library |

### Screenshot harness

`tools/screenshot_bravura.js` — Playwright script that renders each test fixture and saves PNG screenshots to `docs/engraving/screenshots/`. Run with `node tools/screenshot_bravura.js` after renderer changes.

---

## 10. Recommended Next Sprint

**Song Management — Phase 2 Start**

The engraving phase established a renderer that can faithfully display real piano music. The next constraint is content: the app has one real song and many test fixtures. Students cannot learn on test fixtures.

**Recommended first tasks:**

1. **Import 5–10 real beginner songs** using `tools/mxl_to_song.py` and verify each with the screenshot harness
2. **Update `songs/index.json`** with metadata (title, composer, level, duration) using `tools/update_song_index.py`
3. **Build a minimal song browser** — a grid or list of available songs with level and title display
4. **Define the difficulty level system** consistently across all songs (early_beginner → advanced)

**Why not more engraving:**
The renderer handles all notation types present in standard beginner-through-intermediate repertoire. Remaining gaps (multi-row slurs, 15ma/15mb) appear only in advanced content that is not in the current scope. Spending sprint cycles on these features before the library exists produces notation quality for songs that don't exist yet.

---

## 11. Important Tool Reference

| Tool | Location | Usage |
|---|---|---|
| MusicXML importer | `tools/mxl_to_song.py` | `python tools/mxl_to_song.py input.mxl songs/output.json` |
| Song validator | `tools/validate_song.py` | `python tools/validate_song.py songs/output.json` |
| Song index updater | `tools/update_song_index.py` | Updates `songs/index.json` after adding new songs |
| Learning path generator | `tools/linear_learning_path_generator.py` | Auto-invoked by importer; standalone via `generate_learning_path(song_data)` |
| Screenshot harness | `tools/screenshot_bravura.js` | `node tools/screenshot_bravura.js` — saves PNGs to `docs/engraving/screenshots/` |
| Ottava inspector | `tools/inspect_ottava.py` | Feasibility/debug tool for ottava metadata in MusicXML |

---

## 12. New Engineer Quick Start

Read these files **in order** to understand the project in 10 minutes:

1. **`docs/product/PRODUCT_VISION.md`** — what the product is and is not
2. **`docs/music-notation-semantics.md`** — the three-layer authority model; song.json contract
3. **`docs/runtime-contract.md`** — RuntimeEngine API; what it owns; what it never touches
4. **`docs/engraving-standards.md`** — renderer implementation law; all engraving decisions
5. **`docs/import/ottava_import.md`** — most recent sprint; notes[] vs written_notes[] pattern

Then:

- Run `node tools/screenshot_bravura.js` to see the current renderer state in screenshots
- Open `index.html` in a browser and load `songs/test_octave_marks.json` to see a live render
- Read `docs/product/PRODUCT_ROADMAP.md` to understand Phase 2 priorities

**One-sentence project summary:**

MyKey SightPlay converts MuseScore notation to a guided piano learning experience; the engraving phase is complete and the next phase is building a real song library for students to use.

---

## 13. Documentation Gaps

The following areas lack dedicated documentation and would benefit from it before Phase 2:

| Gap | Recommendation |
|---|---|
| `index.html` architecture | Document the app shell: script load order, bridge setup, SongLoader role, event handler wiring |
| KeyboardEngine | No public contract document exists (compare: RuntimeEngine has `docs/runtime-contract.md`) |
| Song index schema | `songs/index.json` format is not formally documented; metadata fields are informal |
| Difficulty level definitions | The four levels (early_beginner → advanced) are named but not defined with criteria |
| Screenshot harness | `tools/screenshot_bravura.js` is self-documenting but has no companion doc explaining the audit process |
| Phase 2 technical spec | No implementation plan exists for the song browser or student progress system |

---

*This document was authored at the close of the engraving stabilization phase — 2026-05-31.*  
*Update when a new phase begins or a major architectural decision is made.*
