# Learning Segment Architecture — MyKey Music Labs

**File:** `docs/learning-segment-architecture.md`
**Authored:** 2026-05-22 (Session 46)
**Status:** Design document — no implementation yet
**Prerequisite reading:** `docs/runtime-contract.md`, `docs/runtime-integration-roadmap.md`

> This document designs the learning segment system as a pedagogical layer on top of the existing
> part navigation system. Segments enable authored practice units (e.g., "just the chorus,
> treble hand only, three times") without modifying RuntimeEngine, NotationRenderer, or the
> existing song.json parts schema.

---

## §1 — Current Part System Analysis

### What Parts Are

Parts are structural navigation units generated at song-authoring time. Each part covers a
contiguous range of whole bars and corresponds to a musical section (intro, verse A, chorus, etc.).

**Current schema:**
```json
"parts": [
  {
    "part_id": "intro",
    "label": "Intro",
    "bars": [1, 2, 3, 4],
    "has_pickup": false
  }
]
```

**Current authority chain:**
- `data.parts` → `SongLoader._rebuildPartsBar()` → renders part buttons in the UI
- User clicks a part button → `songLoader.setSelectedPart(partId)`
- Play → `runtime.play({ partId })` → RuntimeEngine computes `{ start_ms, end_ms }` from `data.parts`

**Scope:** RuntimeEngine resolves `partId` to a t_ms range internally, using the events in that
part's bar range. This mechanism already exists and is stable.

### What Parts Are Not

Parts are not:

- Pedagogically sequenced — there is no "learn this before that" ordering
- Authored with instructor intent — they are structural, not educational
- Capable of restricting to a single clef (right or left hand only)
- Sub-bar granular — they snap to whole bar boundaries
- Repeatable in a structured way — no suggested repeat count

**The part system solves navigation. The segment system solves teaching.**

### Part System Stability Guarantee

The part system is stable and complete for Stage 1 (Explore mode). No changes to the
parts schema, parts UI, or parts-to-runtime wiring are required for the segment system.
**Segments are additive — they do not replace or modify parts.**

---

## §2 — The Segment Concept

A **learning segment** is a pedagogically authored unit of guided practice. It differs from a
part in five key dimensions:

| Dimension | Part | Segment |
|-----------|------|---------|
| Granularity | Whole bars only | Bar + beat (sub-bar) |
| Author | Auto-generated | Manually authored by Fay (instructor) |
| Purpose | Navigation — "jump to section X" | Teaching — "practice this phrase" |
| Clef scope | Full grand staff always | May restrict to treble only or bass only |
| Repetition | User-controlled, no suggestion | May carry a suggested repeat count |

**Example segment concept (not final schema):**
> "Bars 5–8, beat 1 to beat 3, right hand only, practice 3 times before advancing."

Segments are purpose-authored for the student, not auto-derived from song structure.

### What Segments Are Not (Scope Exclusions)

These are explicitly out of scope for this architecture document:

- Scoring or evaluation of note accuracy (Checkpoint 2 gameplay layer)
- Microphone / pitch detection (Stage 3)
- Adaptive retry logic ("repeat if student made mistakes")
- Segment-to-segment progression rules or gating
- Visual notation overlays marking segment ranges in the score
- Any change to RuntimeEngine, NotationRenderer, or LearningModeState API

---

## §3 — Authoring Model Evaluation

Three models were evaluated for how `learning_segments` values are authored in `song.json`
and consumed at runtime.

---

### Model A — t_ms Direct Authoring

Author specifies `start_ms` and `end_ms` directly in `song.json`.

```json
{ "start_ms": 4800, "end_ms": 12600 }
```

**Pros:** Trivial for RuntimeEngine — receives clean t_ms directly.

**Cons:**
- Fragile — any tempo change or bar-structure edit invalidates all authored timestamps.
- Unreadable by a non-programmer instructor (Fay cannot author this by hand).
- No tool currently exists to generate these values.
- Breaks every time a song is re-arranged or a bar is inserted.

**Verdict: Rejected.** Human-authored fields must be human-readable. Timestamps are an
implementation detail, not an authoring surface.

---

### Model B — Bar-Only Authoring

Author specifies `start_bar` and `end_bar` (integers). No beat granularity.

```json
{ "start_bar": 5, "end_bar": 8 }
```

**Pros:**
- Human-readable and easy to author.
- Simple conversion to t_ms using bar start timestamps already present in `song.json`.

**Cons:**
- Cannot express "start from beat 3 of bar 7" — insufficient for common pedagogical needs.
- Many piano exercises begin mid-bar (e.g., an upbeat pattern starting on beat 3).
- Segments that cover a specific rhythmic motif require beat-level precision.

**Verdict: Insufficient.** Sub-bar start precision is a fundamental authoring requirement.

---

### Model C — Bar+Beat Authoring → t_ms Conversion at Load Time  ✓ RECOMMENDED

Author specifies `start_bar`, `start_beat`, `end_bar`, `end_beat` (all human-readable integers).
`song-loader.js` converts these to `start_ms` / `end_ms` at song-load time, by looking up
the actual event timestamps in the loaded score data.
RuntimeEngine **never** sees bar or beat values — it receives only t_ms.

```json
{
  "start_bar": 5, "start_beat": 1,
  "end_bar":   8, "end_beat":   4
}
```

**Pros:**
- Human-readable and author-friendly for Fay.
- Beat-level precision (sub-bar).
- RuntimeEngine contract is completely unchanged.
- Conversion is deterministic — uses event timestamps already loaded from `song.json`.
- Backwards compatible — `learning_segments` is an **optional** field; its absence is ignored.
- Robust to future tempo changes at playback time (tempo scaling happens in RuntimeEngine,
  not in t_ms values; segments point to positions in song-time, which is invariant).

**Cons:**
- Requires a `_resolveSegmentMs(data, bar, beat)` lookup function in `song-loader.js`.
- Beat numbering convention must be documented and consistent (see §6.3).
- If bars are reordered in the score, authored segments are invalidated — same as Model A,
  but the invalidation is structural (bar numbers change), not invisible (timestamp drift).

**Verdict: Recommended.** Clean separation between authoring (bar+beat) and runtime (t_ms).
The conversion is a one-time lookup at song-load time, not a repeated computation.

---

## §4 — Recommended Architecture (Model C)

### 4.1 Authoring-to-Runtime Data Flow

```
song.json (learning_segments[])
    │  bar+beat values authored by Fay (instructor)
    │
    ▼
song-loader.js: _resolveSegments(data)
    │  converts bar+beat → t_ms using score event timestamps
    │  produces: resolvedSegments = [{ id, label, start_ms, end_ms, visible_clefs, repeat }]
    │
    ▼
UI shell (index.html) — segment navigation
    │
    ├──► runtime.play({ start_ms, end_ms })    — RuntimeEngine only receives t_ms scope
    └──► learningState.setClefFilter(clef)     — existing API, unchanged
```

### 4.2 Conversion Function (Sketch)

```javascript
// In song-loader.js — resolves a bar+beat position to t_ms
// Returns the t_ms of the first event at or after (bar, beat).
// Falls back to the bar's own start time if no event matches exactly.
_resolveSegmentMs(data, bar, beat) {
  for (const b of data.score.bars) {
    if (b.bar_number !== bar) continue;
    for (const ev of b.events) {
      if (ev.beat >= beat) return ev.t_ms;
    }
    return b.t_ms;  // no event at or after this beat — use bar start
  }
  return null;  // bar not found — segment is invalid
}

_resolveSegments(data) {
  if (!data.learning_segments) return [];
  return data.learning_segments.map(seg => ({
    id:            seg.segment_id,
    label:         seg.label,
    start_ms:      this._resolveSegmentMs(data, seg.start_bar, seg.start_beat),
    end_ms:        this._resolveSegmentMs(data, seg.end_bar,   seg.end_beat),
    visible_clefs: seg.visible_clefs || ['treble', 'bass'],
    repeat:        seg.suggested_repeats || 1,
    order:         seg.order ?? 999,
  })).filter(s => s.start_ms !== null && s.end_ms !== null);
}
```

### 4.3 RuntimeEngine Boundary (Critical Constraint)

**RuntimeEngine does not know about segments. It never will.**

The segment system sits entirely outside RuntimeEngine's authority boundary:
- `song-loader.js` performs the bar+beat → t_ms conversion
- The UI shell (index.html) selects which segment is active
- RuntimeEngine receives only `runtime.play({ start_ms, end_ms })`

This preserves the runtime contract (runtime-contract.md) completely. No new runtime methods,
no new runtime callbacks, no new runtime state.

### 4.4 Play Dispatch (Correct Pattern)

```javascript
// In index.html — when user activates a segment:
const seg = songLoader.resolvedSegments[selectedSegmentIndex];
learningState.setClefFilter(clefFilterFromVisibleClefs(seg.visible_clefs));
runtime.play({ start_ms: seg.start_ms, end_ms: seg.end_ms, tempoScale: currentTempoScale });
```

`clefFilterFromVisibleClefs` is a small mapping function in the UI shell:
```javascript
function clefFilterFromVisibleClefs(clefs) {
  if (clefs.includes('treble') && clefs.includes('bass')) return 'both';
  if (clefs.includes('treble')) return 'treble';
  if (clefs.includes('bass'))   return 'bass';
  return 'both';
}
```

---

## §5 — Ownership and Authority Map

```
song.json (learning_segments)       — authored truth (bar+beat, label, visible_clefs, repeat)
         │
         ▼
song-loader.js (_resolveSegments)   — conversion authority (bar+beat → t_ms at load time)
         │ exposes: get resolvedSegments()
         │
         ▼
UI shell (index.html)               — navigation authority (which segment is active)
         │
         ├──► runtime.play({ start_ms, end_ms })  — temporal scope
         └──► learningState.setClefFilter(clef)   — clef restriction
```

**Authority table — what each layer owns:**

| Layer | Owns | Does NOT own |
|-------|------|--------------|
| `song.json` | Authoring values (bar, beat, label, visible_clefs, repeat count) | t_ms values |
| `song-loader.js` | Bar+beat → t_ms conversion, segment registry | Segment navigation, playback control |
| UI shell (index.html) | Segment selection, repeat counting, clef dispatch | Timing, conversion |
| RuntimeEngine | t_ms playback scope — unchanged | Segment concept entirely |
| LearningModeState | Clef filter state via existing `setClefFilter()` | Segment definition |
| NotationRenderer | Nothing — renders full song always | Segment-aware display |

**NotationRenderer always renders the full song score.** Segments affect playback scope and
clef filter state only. The notation display does not change when a segment is active.

---

## §6 — Song.json Schema Extension

### 6.1 Backwards Compatibility

`learning_segments` is an **optional** array. Songs without it work exactly as before.
Its absence causes `resolvedSegments` to return `[]`. No null guards are needed in the
UI shell — an empty array simply means "no segment navigation available."

### 6.2 Proposed Schema (Placeholder — Not Final)

```json
{
  "meta": { "title": "Für Elise", "bpm": 120, ... },
  "score": { ... },
  "parts": [ ... ],
  "learning_segments": [
    {
      "segment_id":       "seg_a_rh",
      "label":            "Frasa A — Tangan Kanan",
      "start_bar":        1,
      "start_beat":       1,
      "end_bar":          4,
      "end_beat":         4,
      "visible_clefs":    ["treble"],
      "suggested_repeats": 3,
      "order":            1
    },
    {
      "segment_id":       "seg_a_lh",
      "label":            "Frasa A — Tangan Kiri",
      "start_bar":        1,
      "start_beat":       1,
      "end_bar":          4,
      "end_beat":         4,
      "visible_clefs":    ["bass"],
      "suggested_repeats": 3,
      "order":            2
    },
    {
      "segment_id":       "seg_a_both",
      "label":            "Frasa A — Kedua Tangan",
      "start_bar":        1,
      "start_beat":       1,
      "end_bar":          4,
      "end_beat":         4,
      "visible_clefs":    ["treble", "bass"],
      "suggested_repeats": 2,
      "order":            3
    }
  ]
}
```

### 6.3 Beat Numbering Convention

Beats are **1-indexed** (beat 1 = first beat of the bar). This matches:
- Standard music notation convention
- The `beat` field already present on events in `song.json`

Example: in 4/4 time, beats are 1, 2, 3, 4. In 3/4 time, beats are 1, 2, 3.

### 6.4 `visible_clefs` Mapping

The `visible_clefs` array maps to `LearningModeState.setClefFilter()` as follows:

| `visible_clefs` value | `clefFilter` value | Meaning |
|-----------------------|--------------------|---------|
| `["treble"]` | `"treble"` | Right hand only |
| `["bass"]` | `"bass"` | Left hand only |
| `["treble", "bass"]` | `"both"` | Both hands |

The mapping is performed in the UI shell (`clefFilterFromVisibleClefs`). `song-loader.js`
preserves the `visible_clefs` array verbatim in the resolved segment — it does not interpret it.

### 6.5 `suggested_repeats`

Optional. Defaults to 1 (play once). The UI shell tracks repetition count and optionally
advances to the next segment or returns to segment selection when the count is reached.

**`suggested_repeats` is a suggestion, not a constraint.** The student may always stop early
or repeat more. Enforcement is a UX decision, not an architecture decision.

This field is **not implemented in Stage 1**. It is reserved for Checkpoint 2.

### 6.6 `order`

Optional. Defaults to insertion order. Used to sort segments in the navigation UI.
Lower values appear first. Non-unique orders are allowed (segments with equal order
appear in their insertion order within the tie).

---

## §7 — Rendering Implications

### 7.1 No Renderer Changes Required

`NotationRenderer.render(data, scoreEl)` renders the full score. This does not change.
Segments affect only:
1. Runtime playback scope (`runtime.play({ start_ms, end_ms })`)
2. LearningModeState clef filter (`learningState.setClefFilter(clef)`)
3. Keyboard visualization — through LearningModeState, unchanged

**The renderer does not know about segments. No new renderer API is needed.**

### 7.2 No Segment Range Visual Indicator (Stage 1)

Rendering a visual indicator of the active segment's bar range in the score (e.g., a bracket
or shading overlay) is a future Checkpoint 2 feature. It would require a new renderer API
(currently frozen under engraving-standards.md §10). It is **not designed here**.

The frozen renderer surface (§10.1 of engraving-standards.md) covers 19 systems. None are
affected by the segment architecture defined in this document.

---

## §8 — Migration Notes

### 8.1 What Changes When Segments Are Implemented

| Component | Change Required |
|-----------|----------------|
| `song-loader.js` | Add `_resolveSegments(data)`, `_resolveSegmentMs(data, bar, beat)`, `get resolvedSegments()` |
| `index.html` | Add segment navigation bar, segment-aware play dispatch, repeat counter |
| `song.json` (authored songs) | Add optional `learning_segments: []` field |
| `LearningModeState` | No change — `setClefFilter()` already handles clef restriction |
| `RuntimeEngine` | No change |
| `NotationRenderer` | No change |
| `KeyboardViz` | No change |

### 8.2 Suggested Implementation Sequence

1. Add `_resolveSegments()` + `get resolvedSegments()` to `song-loader.js`
2. Add `learning_segments` to one test song (verify conversion produces correct t_ms)
3. Add a minimal segment navigation bar in index.html (list of segments, click to activate)
4. Wire segment activation: `learningState.setClefFilter()` + `runtime.play({ start_ms, end_ms })`
5. Add repeat counting (UI counter, not runtime-driven)

Scoring, evaluation, and adaptive retry are Checkpoint 2 concerns. Not part of this sequence.

---

## §9 — What Must Not Change

These constraints must be respected by any segment implementation:

1. **RuntimeEngine never receives bar or beat values.** It receives `{ start_ms, end_ms }` only.
2. **NotationRenderer renders the full song score always.** It is not segment-aware.
3. **`setClefFilter()` is the only clef-restriction mechanism.** No new "segment filter" bypass.
4. **`learning_segments` must be optional in song.json.** Its absence must not cause errors or warnings.
5. **Bar+beat → t_ms conversion happens only in `song-loader.js`.** Never in runtime-engine.js.
6. **Segment playback uses the existing scoped-play mechanism** — `runtime.play({ start_ms, end_ms })` — already specified in runtime-contract.md §3.2. No new runtime API.
7. **The engraving freeze (engraving-standards.md §10) is not affected by segments.**
8. **The part system is not modified.** Segments are additive. Parts continue to work as before.

---

## §10 — SPEC Open Topics

These questions are not resolved by this document. They require a SPEC.md revision or
product decision before implementation:

1. **Authoring tool:** Will Fay author `learning_segments` by hand in JSON, or will there be
   a segment editor in an admin/teacher UI? This affects schema verbosity tolerance.

2. **Segment-to-segment transitions:** Does completing a segment automatically advance to the
   next, or does the student manually select the next segment? (UX question.)

3. **Repeat behavior mechanics:** Does "repeat" mean the runtime loops (seek-on-end), or the
   UI re-triggers `runtime.play()` on each repetition? (Seek-on-end is simpler but loses
   the natural pause that helps learners reset their hand position.)

4. **Segment navigation vs part navigation:** Are segments shown in addition to parts, or do
   songs with segments hide the parts bar? (UX question — affects the navigation model.)

5. **Score visual indicator:** Should the active segment's bar range be highlighted in the
   notation (bracket, shading)? This would require a new renderer API, violating the
   current freeze boundary.

6. **Segment persistence:** Does progress through a segment sequence persist across page
   reloads or sessions? (Not an architecture question — requires a storage layer.)

---

## §11 — Summary Table

| Decision | Chosen | Alternatives Rejected |
|----------|--------|-----------------------|
| Authoring format | Bar+beat (Model C) | t_ms direct (A — fragile), bar-only (B — insufficient) |
| Conversion location | `song-loader.js` at load time | RuntimeEngine (breaks contract) |
| RuntimeEngine change | None | Any new method or callback |
| NotationRenderer change | None | Segment-aware rendering |
| LearningModeState change | None — `setClefFilter()` reused | New segment-specific filter API |
| Part system change | None — segments are additive | Replace parts with segments |
| Schema compatibility | `learning_segments` optional | Required field |
| Sub-bar granularity | Bar+beat (1-indexed) | Bar-only (insufficient for mid-bar starts) |
| Clef restriction mechanism | Existing `setClefFilter()` | New separate API |
| Repeat implementation location | UI shell (repeat counter) | RuntimeEngine loop |

---

*Companion documents: `docs/runtime-contract.md`, `docs/runtime-integration-roadmap.md`,
`DEVLOG.md Sessions 46+`*
