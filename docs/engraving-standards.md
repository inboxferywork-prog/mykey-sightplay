# Engraving Standards — MyKey Music Labs Notation Renderer

**File:** `src/notation-renderer.js`
**Renderer:** VexFlow 5.0.0 (CJS UMD bundle via CDN)
**Last audited:** 2026-05-21 (Sessions 9–17 + notation audit pass + Session 18 tie rendering + Session 28 dotted note audit + Session 29 dot fix + Session 30 accidental carry rules + Session 31 consolidation freeze pass + Session 32 staccato/slur semantic architecture + Sessions 33–37 staccato/slur implementation + Session 38 Layer 3 freeze)

> This document is the authoritative renderer semantics reference.
> Read this before starting any Layer 3 notation work.
> It complements SPEC.md §9 (Notasi Rendering) and DEVLOG.md (implementation history).

---

## 1. Renderer Philosophy

### Core principle

The renderer is an **educational realtime notation renderer**, not a professional publishing engine. Its output must be:

- **Educationally readable** — a beginner piano student can follow along
- **Optically balanced** — score feels like music, not a data grid
- **Visually stable** — layout does not shift unpredictably between bars or rows
- **Lightweight and maintainable** — future sessions can understand and extend it without an engraving PhD

### VexFlow as primary formatter

VexFlow is the rendering engine and the primary notation formatter. All note position arithmetic is delegated to VexFlow's `Formatter`. Custom logic in this renderer exists only to:

- Provide bar width allocation guidance (row-level, not note-level)
- Provide optical alignment cues to the formatter (GhostNote for pickup bars)
- Reserve a trailing optical margin before barlines (10% of `noteAreaW`)
- Correct behaviors that VexFlow gets wrong by default (beam flag suppression draw order, stem direction)

**Not allowed:** replacing VexFlow's formatter with a custom spacing engine, manual note x-positioning, duration-based mathematical overfitting, or song-specific pixel hacks.

### Non-goals

The renderer does not aim to replicate:

- Dorico / Sibelius / LilyPond optical spacing algorithms
- ~~Full accidental carry rules (show once per measure per pitch)~~ — ✓ Implemented Session 30 (§2.10)
- Collision detection and notehead collision resolution
- Cross-staff beaming
- Advanced grace note or ornament rendering
- Multi-voice per staff (voice 1 only in the current architecture)

These are out of scope for a realtime educational tool. If a behavior is deferred, it is because the educational cost of implementing it now is not justified by the learning value it provides.

### Priority order (from SPEC §9.1.2)

1. Educational readability
2. Standard notation correctness
3. Visual stability
4. Maintainable implementation
5. Engraving perfection (optional)

---

## 2. Standards-Aligned Behaviors

These behaviors follow established music engraving conventions (Gould, MuseScore) and are correctly implemented as of the last audit.

---

### 2.1 Stem Direction

**Rule (Gould §4 / MuseScore default):** Stem direction is determined by note position relative to the staff middle line.

- Notes **below** the middle line → stem **up** (`stem_direction: 1`)
- Notes **on or above** the middle line → stem **down** (`stem_direction: -1`)

**Middle line references (staff step encoding):**

Staff step = `letterIndex + octave × 7`, with C=0, D=1, E=2, F=3, G=4, A=5, B=6. Accidentals are ignored — they don't change the staff line/space position.

| Clef | Middle line | Step value | Constant |
|------|-------------|-----------|----------|
| Treble | B4 | 6 + 4×7 = 34 | `_TREBLE_MID = 34` |
| Bass | D3 | 1 + 3×7 = 22 | `_BASS_MID = 22` |

**Boundary convention:** Notes exactly on the middle line (step == middle) get stem-down. The condition is `step < middle ? up : down`. This matches MuseScore's default.

**Validation table:**

| Note | Step | Treble result | Bass result |
|------|------|--------------|------------|
| C4 | 28 | UP (28 < 34) ✓ | — |
| A4 | 33 | UP (33 < 34) ✓ | — |
| B4 | 34 | DOWN (34 = 34, not <) ✓ | — |
| D5 | 36 | DOWN (36 > 34) ✓ | — |
| G2 | 18 | — | UP (18 < 22) ✓ |
| B2 | 20 | — | UP (20 < 22) ✓ |
| D3 | 22 | — | DOWN (22 = 22, not <) ✓ |
| F3 | 24 | — | DOWN (24 > 22) ✓ |
| G3 | 25 | — | DOWN (25 > 22) ✓ |

**Chords:** The note furthest from the middle line determines the direction for the whole chord — Gould §4 furthest-note rule. `_furthestStepFrom(noteNames, middle)` is used. Tie-break: when two notes are equidistant, the note above middle wins → stem down. For 2-note chords this is mathematically equivalent to average-step; for 3+ note groups it is more accurate (prevents long-stem artifacts in mixed-register groups).

**Rests:** Receive `stemDir` in construction but rests have no visible stems. The value is irrelevant but harmless.

**Implementation:** `_buildNotes()` computes `stemDir` and passes `stem_direction: stemDir` to the `VF.StaveNote` constructor. However, `Formatter.format()` auto-computes stem directions during layout and overwrites the constructor value. Therefore, `_drawBarNotes()` calls `note.setStemDirection()` on every non-rest item immediately after `format()`, before beam creation. This post-format explicit call is what actually commits the stem direction to the rendered note. `_beatGroupedBeams()` then overrides beam-group notes with a unified `groupDir` via the same `setStemDirection()` mechanism. See §2.2 for the beamed-group stem rule.

---

### 2.2 Beam Grouping

**Rule (Gould §4):** In simple meter, beams must not cross primary beat boundaries. In 4/4, each beat (quarter note duration) is an independent beam group. Two eighth notes on beat 1 beam together; the first eighth on beat 1 and the first eighth on beat 2 do not.

**Implementation:** `_beatGroupedBeams(VF, items, beats, barStartMs, msPerBeat, clef)`.

Beat index is derived from `t_ms` arithmetic:
```
beatIdx  = floor((note.t_ms − barStartMs) / msPerBeat)
msPerBeat = 60000 / bpm × (4 / beatValue)
```

One `VF.Beam.generateBeams()` call per beat group. Groups with fewer than 2 beamable notes are skipped — the note keeps its individual flag (correct standard behavior).

**Beamable durations:** `8`, `16`, `32`. Quarter notes and longer are never beamed. Rests are never beamed.

**Unified beam stem direction:** All notes in a beam group must share one stem direction (required by VexFlow to draw a straight beam). The group direction is computed using the furthest-note rule (Gould §4) across all group members: the note most removed from the middle line determines direction. Tie-break: equidistant notes → note above middle wins → stem down. Each note's direction is overridden via `setStemDirection(groupDir)` before `generateBeams`. See `_beatGroupedBeams()` for implementation.

**Coverage:** Simple meter (2/4, 3/4, 4/4) at any BPM. The `t_ms`-based indexing is tempo-agnostic.

**Beat-boundary epsilon fix (Session 28):** `msPerBeat = 60000 / bpm × (4 / beatValue)` is a float. When song data stores `t_ms` as an integer, a note whose true position is exactly on a beat boundary rounds to 1ms short of `n × msPerBeat`. Without correction, `Math.floor(0.9996)` = 0 places the note in the wrong beat group. Fix: `+ 0.001` epsilon before flooring. This tolerance (0.833ms) absorbs integer rounding without affecting genuine mid-beat positions. The defect was confirmed with dotted eighth + sixteenth patterns whose notes land at exact beat boundaries.

**Out of scope:** Compound meter (6/8, 9/8) uses dotted quarter as the primary beat unit — the current `msPerBeat` formula gives the wrong grouping. All current test songs are simple meter. Compound meter is deferred.

---

### 2.3 Beam Flag Suppression

**VexFlow pipeline rule:** `VF.Beam.generateBeams(notes)` sets `note.beam = this` on each note in the group. `StaveNote.draw()` checks for `note.beam`: if set, the individual flag is suppressed; if not set, the flag renders.

**Critical draw order:**

1. Format voices (`Formatter.format`)
2. Create beam objects — `_beatGroupedBeams()` called here, returns `Beam[]`
3. Draw voices — `tv.draw(ctx, treble)`, `bv.draw(ctx, bass)` — flags suppressed on beamed notes
4. Draw beam lines — `beams.forEach(b => b.setContext(ctx).draw())`

Steps 2 and 3 cannot be swapped. If beam objects are created after voice draw, the flags have already rendered and will appear as double-flags behind the beam line.

**Result:** Beamed eighth notes show clean shared beam line only. Standalone eighth notes (single in beat group) show their individual flag.

---

### 2.4 Pickup Measure (Anacrusis) Handling

**Standard behavior:** A pickup note at beat 4 of a 4/4 bar should sit at the 3/4 position across the bar — not at the left edge. VexFlow left-justifies notes by default, which would place a single pickup quarter at beat 1 visually.

**Implementation:** VexFlow `GhostNote` spacers prepended to the voice.

`GhostNote` is VexFlow's invisible spacer tickable. It consumes beat time in the voice and participates in Formatter layout without rendering. By prepending GhostNotes for the missing leading beats, the Formatter sees a complete bar's worth of tickables and distributes all notes at their correct proportional positions.

**Computation:**
```
fullBarQL = numBeats × 4 / beatValue        // 4/4 → 4.0, 3/4 → 3.0
usedQL    = _sumBarQL(clef events)
missQL    = fullBarQL − usedQL
```

`_qlToDurations(missQL)` decomposes the missing quarter-length into a list of VexFlow duration strings via greedy longest-first matching. Each becomes one `GhostNote`.

**Guards:**
- If a clef has no real events (uses whole-rest fallback), `usedQL` is set to `fullBarQL` → `missQL = 0` → no ghosts. The whole rest stays centered.
- `missQL > 0.1` threshold prevents floating-point drift from creating spurious ghosts on full bars.

**Generic behavior:** Triggers for any incomplete bar, not just bar 1 or bars with `has_pickup: true`. Works for 1-beat, 2-beat, and 3-beat pickups in any simple meter time signature.

**This is formatter guidance, not pixel math.** VexFlow does all positioning arithmetic.

---

### 2.5 Grand Staff Alignment

**Formatter call for grand staff:**
```javascript
new VF.Formatter()
  .joinVoices([tv])    // treble voice joins treble stave context
  .joinVoices([bv])    // bass voice joins bass stave context
  .format([tv, bv], formatW);  // both formatted together — shared horizontal grid
```

This is the correct grand-staff pattern. `joinVoices([tv, bv])` (incorrect — would treat both as voices within one stave) is not used.

**Result:** Beat 1 in treble aligns vertically with beat 1 in bass. Simultaneous events with matching `t_ms` land at the same x position on both staves.

**Fallback:** If combined formatting throws, each voice is re-formatted independently. Vertical alignment degrades but the bar renders.

**Stave Y offsets:** Treble at `rowY + 20`, bass at `rowY + 110`. Grand-staff connectors (BRACE + SINGLE_LEFT) drawn at leftmost bar of each system row.

---

### 2.6 Dotted Note Rendering

**Parsing:** `_parseDur(dur)` strips the trailing `.` and returns `{ base, dots }`.

| Input | base | dots |
|-------|------|------|
| `"q"` | `"q"` | 0 |
| `"q."` | `"q"` | 1 |
| `"h."` | `"h"` | 1 |
| `"8."` | `"8"` | 1 |

`dots` is passed to `VF.StaveNote({ dots })` for tick arithmetic only — it sets the note's internal duration so voices allocate the correct time slot. **It does NOT attach visual `Dot` modifier objects.**

**Visual dot attachment (required):** After `new VF.StaveNote(...)`, `_buildNotes` explicitly attaches a `Dot` modifier for each key index:
```javascript
if (dots > 0) {
  for (let i = 0; i < keys.length; i++) {
    note.addModifier(new VF.Dot(), i);
  }
}
```
This is required for all note types (melody, chord, rest). Without it, VexFlow 5.0.0 renders no augmentation dot glyph despite receiving `dots: 1` in the constructor. Confirmed against VexFlow source and visual output (Session 29, defect fix).

**Duration arithmetic:** `_sumBarQL` uses `(QL[base] ?? 1) * (dots ? 1.5 : 1)`. Dotted quarter = 1.5 QL, dotted half = 3.0 QL. Correct.

**Ghost note decomposition:** `_qlToDurations` does not produce dotted durations. A missing 1.5 QL becomes `['q', '8']` — two ghost notes summing to the same total. Invisible, so the split is undetectable visually.

**Dotted rests:** `_buildNotes` sets `duration = base + 'r'` and passes `dots` to the constructor. The `keys.length` for a rest is 1 (single position key), so one `Dot` modifier is attached at index 0.

**Dotted chords:** `keys.length` equals the chord's note count. The loop attaches one `Dot` per key, placing an augmentation dot beside each notehead.

**Dotted notes in beam groups:** A dotted eighth (`"8."`) has `base: "8"`, which passes `_isBeamable`. It beams normally. The augmentation dot appears to the right of the flagged notehead; the beam line connects above/below. Visual clearance is managed by VexFlow.

**Beam beat-boundary fix:** Dotted eighth + sixteenth patterns place notes at exact beat boundaries where integer t_ms rounding caused incorrect beam grouping. Fixed in Session 28 — see §2.2.

**Test song:** `songs/test_dotted_notes.json` covers all dotted rendering paths: dotted pickup, dotted quarter/half/eighth, dotted rests, dotted chords, dotted+beamed, cross-bar dotted tie, and treble+bass dotted combinations.

**Limitation:** Double-dotted notes (`"q.."`) are not supported. The generator does not currently produce double dots. Not a current issue.

---

### 2.7 Rest Positioning

**Key positions used:**
- Treble rests: `'b/4'` (B4 — treble middle line)
- Bass rests: `'d/3'` (D3 — bass middle line)

VexFlow positions rest glyphs based on these key strings:
- Whole rest: hangs from the 4th line (VexFlow handles automatically)
- Half rest: sits on the 3rd line (middle line — matches the key position)
- Quarter and shorter: centered near the middle of the staff

**Whole rest fallback:** When a clef has no events in a bar, `_wholeRest(VF, clef)` creates a `VF.StaveNote` with `duration: 'wr'`. VexFlow renders and centers it.

This is standard rest positioning per Gould and MuseScore conventions.

---

### 2.8 Bar Width Allocation

**Approach:** Bar widths are computed before drawing. VexFlow receives the allocated width and formats notes within it. No note-level manual x-positioning.

**`_barNoteWeight(barData)`** computes a rhythmic density weight per bar: groups events by `t_ms` into time slots, weights each slot by duration and accidentals, sums slot weights. Higher weight → wider bar allocation.

**`_computeRowWidths()`** applies three optical corrections:

1. **Rhythmic density weights** — bars with more/denser notes get proportionally more space
2. **Blend smoothing** (`WIDTH_BLEND = 0.40`) — each bar's raw weight is blended 40% toward itself, 60% toward `(rowAvg + globalAvg) / 2`. Prevents extreme width outliers while preserving some proportional variation.
3. **Proportional partial-row fill** — for rows with fewer than `barsPerRow` bars, width is scaled to `(barCount / barsPerRow) × available`, floored at `MIN_ROW_FILL = 0.45`. Keeps average per-bar width consistent across all row types.

**`_computeRowLayout()`** applies one-bar rebalancing: if the last row has ≤ `floor(barsPerRow / 2)` bars, one bar is moved from the penultimate row. Example: 9 bars → `[4, 4, 1]` → `[4, 3, 2]`. Never moves more than one bar.

**`_globalAvgBarW(bars)`** computes a score-wide average bar width. Used as global blend anchor so bars in different rows are compared against the same reference — the key mechanism for cross-row optical consistency.

**Formatter margin:** `formatW = noteAreaW * 0.90`. Notes occupy the leftmost 90% of the note area; 10% is reserved as trailing optical margin before the barline. Applies consistently to every bar regardless of content density.

---

### 2.9 Tie Rendering

**Rule (Gould §10):** A tie is a curved arc connecting two notes of identical pitch. The second tied note is not re-attacked — the player holds the first note for the combined duration. Ties curve on the opposite side from the stem (stem-up → tie below noteheads; stem-down → tie above).

**Implementation:** `_drawTies(ctx, VF)` — class method called once after all rows and all bars are drawn.

**Matching algorithm:** Events are walked in song order (all bars, all events). A `Map` keyed by `"clef:sortedPitches"` tracks pending tie-start notes. When `tie_stop: true` is encountered for a matching key, the pending source note is connected to the stop note. Processing stop before start on the same event handles chain ties cleanly.

**Chord ties:** Multiple pitches in a chord can be tied simultaneously. `_drawStaveTies` builds a pitch→source-index map and creates one `VF.StaveTie` per matching pitch pair.

**Same-row cross-bar ties:** Single `VF.StaveTie` arc from source note to destination note. VexFlow computes x/y from note positions set during `voice.draw()`.

**Cross-row ties:** `VF.StaveTie` with `last_note: null` draws a dangling arc from the source note to the right edge of its stave (end of system). A second `VF.StaveTie` with `first_note: null` draws a dangling arc from the left edge of the next stave row to the destination note (start of system). Row detection: `Math.floor(stave.getY() / 210)`.

**Draw timing:** `_drawTies` is called from `_drawScore` after the full row loop — after all voices, all beams, and all SVG elements are rendered. `VF.StaveTie.draw()` requires the connected notes to be already drawn (x/y positions set).

**No impact on spacing or stem direction.** Ties are purely visual overlays drawn after layout is complete. `_noteObjMap` (eventId → `{ note, stave }`) is populated in `_drawBarNotes` alongside the existing SVG element map.

**Unterminated tie_start (no matching tie_stop):** Silently discarded. Orphaned pending entries in the `Map` at the end of the event walk are dropped. No dangling arc is drawn for malformed song data. (`_drawHalfTieEnd` was removed in Session 27 stabilization pass — it had no callers after the adjacency-enforcement rewrite in Session 22.)

**Key functions:**
- `_drawTies(ctx, VF)` — class method, tie traversal and dispatch
- `_drawStaveTies(...)` — module-level, draws one or more arcs (same-row or cross-row)

---

### 2.10 Accidental Carry Rules and Natural Sign Insertion

*Implemented Session 30. Replaces the former §3.1 intentional simplification.*

**Rule (Gould §6):** An accidental is shown when a note deviates from what the current state implies — either the key signature or a previous accidental within the same measure. The state resets at each bar line. Tracking is per pitch letter (C–B), not per octave — standard for educational and simple-repertoire engraving.

**Three cases that require an accidental marker:**

| Situation | Example (G major) | Marker |
|-----------|-------------------|--------|
| Chromatic deviation: note differs from key-sig default | F natural in G major (`"F4"` with key F#) | `'n'` natural sign |
| Within-bar alteration: note differs from previously shown acc | Bb appearing in a measure with no prior B | `'b'` flat |
| Restoration: note returns to key-sig pitch after within-bar alteration | F# after F natural in same bar | `'#'` sharp |

**Two cases that suppress the accidental marker:**

| Situation | Example | Reason |
|-----------|---------|--------|
| Key-signature default | F# in G major, Bb in F major | State already matches key sig — no marker needed |
| Carry rule (same pitch, same bar) | Second Bb in a measure where Bb already appeared | State unchanged — no repeat marker |

**Implementation:** `_buildNotes` creates a fresh `accState` object at the start of each call (one per bar per clef). The state is initialized from `_KEY_SIG_NOTES[keySig]` — a static map of key names to per-letter defaults. As each note is processed, `_resolveAccidental(n, accState)` computes the marker (or null), `note.addModifier(new VF.Accidental(...), idx)` attaches it, and `_updateAccState(accState, n)` updates the state for subsequent notes.

**State resets at bar boundaries** because `_buildNotes` is called per bar — a fresh object every call. This matches the standard rule (accidentals carry within a measure only).

**Key functions:**
- `_KEY_SIG_NOTES` — static const, key name → `{ letter: accidental }` map covering all major and natural minor keys
- `_initAccState(keySig)` — returns `{ C:'', D:'', E:'', F:'#', G:'', A:'', B:'' }` (example: G major)
- `_parsePitch(n)` — `"F#4"` → `{ letter:'F', acc:'#' }`
- `_resolveAccidental(n, accState)` — returns VF accidental string or `null`
- `_updateAccState(accState, n)` — commits the note's state to the tracker

**Test song:** `songs/test_accidentals.json` (G major, 4/4):
- Bar 1: F#4, G4, F#5, A4 treble + G2, F#3, A3, B3 bass — all F# notes show NO accidental (key-sig suppression + carry)
- Bar 2: F4, G4, F4, A4 — first F4 shows natural sign; second F4 shows no sign (carry)
- Bar 3: F4, F#4, G4, A4 — F4 shows natural sign; F#4 shows `#` (restoration to key sig)
- Bar 4: Bb4, Bb4, C5, D5 — first Bb4 shows `b`; second Bb4 shows no `b` (carry)

**Scope note:** Tracking is per pitch letter only, not per octave (e.g., F#4 and F#5 in the same bar — once F state is set by the first note, the second does not repeat). This matches educational-engraving practice for simple repertoire. Strict per-octave tracking is an enhancement for advanced repertoire and is not currently needed.

---

## 3. Intentional Simplifications

These behaviors deviate from professional engraving conventions. Each deviation has an explicit educational or maintainability justification.

---

### 3.1 Optical Spacing Without Duration Proportionality

**Standard (Gould §5):** Professional engraving uses duration-proportional note spacing: a whole note occupies 4× the space of a quarter note. Shorter durations may be compressed slightly sub-linearly, but the ratio is preserved.

**Current behavior:** VexFlow's default formatter is used with a fixed `formatW = noteAreaW * 0.90`. VexFlow distributes notes using its own internal proportional logic, which approximates standard spacing. No custom duration-to-pixel formula is applied.

**Effect:** Spacing within bars is "good enough" — proportional, readable, and musically phrased. It does not achieve the exact spacing ratios of a professional engraving system.

**Justification:** An attempt in Session 7 to implement slot-based duration-proportional spacing was reverted (Session 8). The math produced visually over-compressed sparse bars that felt like a "physics simulation" rather than music. VexFlow's formatter produces better musical results when trusted with generous bar widths. The 10% trailing margin (Session 11) adds the phrasing feel that mathematical spacing would otherwise provide. This is a deliberate architectural choice per SPEC §9.1.1.

---

### 3.2 Simple Meter Beam Grouping Only

**Standard:** Compound meter (6/8, 9/8) requires beam groups based on dotted-quarter beats, not plain-quarter beats. The `msPerBeat` formula `60000 / bpm × (4 / beatValue)` computes quarter-note beat duration and is incorrect for compound meter.

**Current behavior:** Beat-indexed beaming uses quarter-note-based `msPerBeat`.

**Effect:** In 6/8 time, notes would be grouped per quarter note (3 sixteenths each) rather than per dotted-quarter beat (6 sixteenths as one group or 3+3). Incorrect beaming would result.

**Justification:** All current test songs are in simple meter (4/4 or 3/4). The compound meter case is not triggered. Fixing it requires detecting the meter type and selecting the appropriate beat unit. Deferred to Layer 3.

---

## 4. Deferred Layer 3 Features

These features are acknowledged, understood, and explicitly deferred. They do not block current functionality for the test song corpus.

---

### 4.1 Tie Rendering — ✓ IMPLEMENTED (Session 18)

Moved to §2.9. Tie rendering is fully implemented as of Session 18. See §2.9 for complete specification and implementation details.

---

### 4.2 Accidental Carry Rules and Natural Sign Insertion — ✓ IMPLEMENTED (Session 30)

Moved to §2.10. Both Component A (key-signature suppression) and Component B (natural sign insertion) are fully implemented as of Session 30. See §2.10 for complete specification and implementation details.

---

### 4.3 Collision Detection and Notehead Cleanup

No detection of horizontal notehead collisions is implemented. In dense chords (e.g., adjacent seconds like C4 and D4 in the same chord), VexFlow may position noteheads that visually overlap or crowd each other. The renderer does not intervene.

For early-beginner repertoire (simple melodic lines, basic chords), this is rarely a problem. For intermediate repertoire with wide-range chords or close intervals, collision handling may be needed.

---

### 4.4 Compound Meter Beam Grouping

See §3.2. The `beatIdx` formula uses quarter-note-based `msPerBeat`. For 6/8 or 9/8, this produces incorrect beat-boundary groupings. No current test song is in compound meter.

---

### 4.5 Rest Type Optimization

**Standard:** In some contexts, a half rest is preferable to a whole rest for a bar that is silent for exactly 2 beats. In other contexts (e.g., a bar with a voice rest), the rest type and position should adapt to the surrounding notation.

**Current behavior:** When a clef has no events in a bar, always uses a whole rest. VexFlow centers it.

For simple educational music, a whole rest for a fully-silent bar is unambiguously correct. This only becomes an issue in complex multi-voice notation, which is out of scope.

---

### 4.6 Staccato Rendering — ✓ Implemented Sessions 33–35

*Song.json schema established Session 32. Playback implemented Session 33. Rendering implemented Session 34. Placement refined Session 35. Contracts frozen Session 38.*

**Test source:** `test_scores/test_staccato_slur.mxl` — bars 1–2, 5–6 (treble single-note staccato), bars 1–4, 5–7 (bass chord staccato). F major, 2/4, MuseScore Studio 4.6.5.

**song.json field:** `"articulations": ["staccato"]` on note/chord events (omit when absent).

**Rendering (implemented):**
- `_buildNotes()` in `NotationRenderer`: `note.addModifier(new VF.Articulation('a.'), 0)`
- Placement: `art.setPosition(stemDir === 1 ? 4 : 3)` — explicit notehead-centric placement
  - stem-up (stemDir=1) → BELOW notehead (position 4)
  - stem-down (stemDir=-1) → ABOVE notehead (position 3)
- VexFlow 5.0.0 finding: `'a.'` does NOT auto-flip by stem direction — explicit `setPosition()` is required
- Chord staccato: one modifier at index 0, not per-notehead
- `stemDir` computed from `_furthestStepFrom()` — same formula as post-format `setStemDirection()` loop

**Playback (implemented):**
- `_playNote()` in `index.html`: `performedDurationMs = writtenDurationMs * 0.5` when staccato
- `writtenDurationMs` (= `ev.duration_ms`) is read-only — never mutated
- Sharp note-off envelope: `exponentialRampToValueAtTime(0.0001, now + dur + 0.06)`
- Timeline is unaffected: `onEventEnter` at `t_ms`, `onEventExit` at `t_ms + duration_ms`

**MuseScore MusicXML export format:**
```xml
<notations>
  <articulations>
    <staccato default-x="4.93" default-y="3.44"/>
  </articulations>
</notations>
```

**music21 extraction (implemented in `mxl_to_song.py`):**
```python
has_staccato = any(isinstance(a, m21_articulations.Staccato) for a in el.articulations)
if has_staccato:
    ev["articulations"] = ["staccato"]
```

**Regression boundaries (frozen Session 38):**
- `duration_ms` must never be altered by staccato
- `t_ms` and event dispatch timing must never change
- Placement must remain notehead-centric (not stem-tip-centric)
- `articulations` field must never appear on rest events

---

### 4.7 Slur Rendering — ✓ Implemented Sessions 36–37

*Song.json schema established Session 32. Rendering implemented Session 36. Geometry refined Session 37. Contracts frozen Session 38.*

**Test source:** `test_scores/test_staccato_slur.mxl` — bars 3–4 (A4 → G4 → F4 → G4 beam group slur start, A4 slur stop); bars 7–8 (A4 → G4 → F4 → E4 beam group slur start, D4 half-note slur stop spanning barline).

**song.json fields:** `"slur_start": true` / `"slur_stop": true` on note/chord events (omit when false/absent).

**Semantic constraints (non-negotiable):**
- `slur_stop: true` does NOT suppress audio attack — this is the fundamental difference from `tie_stop: true`
- Slur does NOT extend duration — `duration_ms` is unchanged
- Slur may span different pitches, beam groups, and barlines
- Slur rendering must NOT reuse `_drawStaveTies` or any tie rendering infrastructure

**Rendering (implemented):**
- `_drawSlurs(ctx, VF)` method on `NotationRenderer` — called after `_drawTies()` in `_drawScore()`
- Pair-walking algorithm: events traversed in bar order; `pending: Map<clef → {note, stave}>`; `slur_stop` processed before `slur_start` on the same event
- Same-system restriction: `Math.floor(stave.getY() / 210)` — cross-row slurs silently skipped
- Anchors: `getTieRightX()` / `getTieLeftX()` (geometry accessors, no tie infrastructure); `getYs()[0] + dir × 3`
- Direction: stem-up (getStemDirection()===1) → `dir=+1` (arc below noteheads); stem-down → `dir=-1` (arc above)
- `_drawSlurPath()`: cubic Bezier lens. `height = clamp(12, span×0.15, 26)`. `ctrlH = height × 4/3` (corrects Bezier ¾ midpoint shortfall). Control points at ⅓ and ⅔ span. Lens THICK = 2.5 px. Filled black, no stroke.

**MuseScore MusicXML export format:**
```xml
<notations>
  <slur type="start" number="1" bezier-x="29.24" bezier-y="-21.29"/>
</notations>
<!-- ... intervening notes ... -->
<notations>
  <slur type="stop" number="1" bezier-x="-29.24" bezier-y="-21.29"/>
</notations>
```

**music21 extraction (implemented in `mxl_to_song.py`):**
```python
from music21 import spanner as m21_spanner
for sp in el.getSpannerSites():
    if isinstance(sp, m21_spanner.Slur):
        if sp.isFirst(el): ev["slur_start"] = True
        if sp.isLast(el):  ev["slur_stop"]  = True
```

**Playback:** No audio effect. Slur is display-only. The runtime dispatches slur events normally; no suppression or duration modification occurs.

**Regression boundaries (frozen Session 38):**
- `slur_stop: true` must never suppress audio attack
- `_drawSlurs` and `_drawTies` must share no infrastructure
- Placement follows MuseScore source intent — no auto-flip heuristics
- Cross-system slurs remain out of scope (silently skipped)
- Slur playback shaping remains out of scope

**Supported scope (frozen Session 38):**
- Single-span slurs (one `slur_start` → one `slur_stop`)
- Same-staff, same-system
- Non-nested slurs

**Not yet supported (known non-goals for MVP):**
- Nested slurs (two slur openings before one close)
- Cross-system slurs (two half-arcs at row boundary)
- Collision engine escalation (slur vs. articulation, beam, or dynamic)
- Advanced phrase interpretation or direction override
- Slur playback shaping (legato audio envelopes)

---

## 5. Known Limitations

| Limitation | Severity | Trigger condition | Workaround |
|-----------|----------|------------------|------------|
| ~~Natural signs not inserted for chromatic naturals~~ | ~~Correctness bug~~ | ~~Fixed Session 30~~ | Fixed: §2.10 accidental carry rules |
| ~~Redundant accidentals on key-signature pitches~~ | ~~Visual clutter~~ | ~~Fixed Session 30~~ | Fixed: §2.10 key-sig suppression |
| Compound meter beam grouping incorrect | Correctness bug | Song with time signature 6/8, 9/8, 12/8 | Avoid compound meter until §4.4 is implemented |
| Cross-row tie half-tie rendering depends on VexFlow null-note StaveTie support | Possibly silent | Tie crossing a system break (row boundary) | Wrapped in try/catch; worst case: tie arc absent at system break |
| Double-dotted notes not parsed | Not triggered | Duration string ending `".."` | Generator does not produce double dots |
| ~~Beat-boundary integer rounding caused incorrect beam grouping~~ | ~~Fixed Session 28~~ | ~~Notes landing exactly on beat boundaries (e.g., dotted 8+16 patterns)~~ | Fixed: `+ 0.001` epsilon in `_beatGroupedBeams` |

---

## 6. Implementation Reference: Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `_drawScore()` | `NotationRenderer` class | Row layout, stave creation, pass 1 + pass 2 orchestration |
| `_drawBarNotes()` | `NotationRenderer` class | Per-bar note rendering, voice construction, formatter call, beam pipeline |
| `_buildNotes()` | `NotationRenderer` class | Event → VexFlow StaveNote; stem direction; Dot modifiers; accidental carry rules |
| `_computeRowLayout()` | Module-level | Conservative final-row rebalancing (`[4,4,1]` → `[4,3,2]`) |
| `_computeRowWidths()` | Module-level | Bar pixel widths: rhythmic weight + blend smoothing + partial-row fill |
| `_globalAvgBarW()` | Module-level | Score-wide average bar width — cross-row optical anchor |
| `_barNoteWeight()` | Module-level | Rhythmic density weight per bar for width computation |
| `_beatGroupedBeams()` | Module-level | Beat-indexed beam objects; unified group stem direction; returns `Beam[]` |
| `_buildNotes()` return value | — | `{ note, eventId, dur, step }` — `step` carries staff position for beam group use |
| `_sumBarQL()` | Module-level | Total quarter-length of clef events in one bar (for GhostNote computation) |
| `_qlToDurations()` | Module-level | Decompose missing QL float into VexFlow duration strings for GhostNotes |
| `_parseDur()` | Module-level | `"q."` → `{ base: 'q', dots: 1 }` |
| `_toVFKey()` | Module-level | `"F#3"` → `"f#/3"` |
| `_KEY_SIG_NOTES` | Module-level constant | Map of key name → per-letter default accidentals for all major and natural minor keys |
| `_initAccState(keySig)` | Module-level | Fresh per-measure accidental state from key signature defaults |
| `_parsePitch(n)` | Module-level | `"F#4"` → `{ letter:'F', acc:'#' }` |
| `_resolveAccidental(n, accState)` | Module-level | VF accidental string or `null` for this note given current measure state |
| `_updateAccState(accState, n)` | Module-level | Commit note's accidental to the measure tracker |
| `_noteStepOf()` | Module-level | Note name → staff step integer (letter + octave×7) |
| `_furthestStepFrom()` | Module-level | Step of the note most removed from the staff middle line (Gould §4 furthest-note rule, with tie-break) |
| `_drawTies()` | `NotationRenderer` class | Post-render tie traversal: walks all events, matches tie_start→tie_stop by clef+pitch, dispatches to draw helpers |
| `_drawStaveTies()` | Module-level | Draw one or more StaveTie arcs; same-row = single arc, cross-row = end+start half-ties |
| `_TREBLE_MID` | Module-level constant | 34 (B4 middle line, treble clef) |
| `_BASS_MID` | Module-level constant | 22 (D3 middle line, bass clef) |
| `_injectStyles()` | Module-level | Inject CSS for highlight classes (runs once per page) |

---

## 7. VexFlow 5.0.0 Compatibility Notes

**CDN bundle:** CJS UMD at `https://cdn.jsdelivr.net/npm/vexflow@5.0.0/build/cjs/vexflow.js`. Sets `window.VexFlow`.

**Bridge required:** `window.Vex = { Flow: window.VexFlow }`. The renderer uses `const VF = Vex.Flow`.

**API changes from 4.x:**
- `note.attrs.el` (4.x) → `note.getSVGElement()` (5.x) for SVG element lookup after draw
- `VF.StaveConnector.type.BRACE` — lowercase `type`, not `TYPE`
- VexFlow 5.x renders glyphs as `<text>` (SMuFL font), not `<path>`. CSS highlight rules must target `text` elements separately from `path`, `rect`, `line`, etc.

---

## 7b. Layer 3 Articulation/Slur Freeze — Regression Boundaries (Session 38)

This section documents the stable contracts for the Layer 3 articulation and slur feature set. These boundaries were established in Session 38 and must be preserved by all future work.

### Supported scope (frozen)

| Feature | Scope |
|---------|-------|
| Staccato dot rendering | Single notes, beamed groups, chords; both staves |
| Staccato placement | Notehead-centric: stem-up → below, stem-down → above |
| Staccato playback | ~50% audible sustain; written duration unchanged |
| Slur arc rendering | Same-staff, same-system, single-span slurs |
| Slur direction | Follows stem direction; MuseScore placement intent respected |
| Slur geometry | Cubic Bezier lens; height clamp(12, span×0.15, 26); ¼/3 control points |

### Not yet supported (known non-goals — do NOT implement without explicit scope approval)

| Feature | Reason deferred |
|---------|----------------|
| Cross-system slurs | Requires two half-arcs at row boundary; no test data yet |
| Nested slurs | Requires slur ID tracking (MusicXML `number` attribute) |
| Slur playback shaping | Legato audio envelopes not in MVP scope |
| Collision engine | Slur vs. articulation, beam, or dynamic clearance |
| Advanced phrase engraving | Direction inference, phrasing heuristics |
| Tenuto, accent, marcato | Deferred articulations — schema defined in music-notation-semantics.md §10.3 |
| Fermata | Requires runtime-engine pause extension before rendering |

### Regression protection rules

1. **Slur must never behave like tie.** `slur_stop: true` must never suppress audio attack. Any code that checks `slur_stop` in the audio path is a bug.

2. **Staccato playback must remain detached.** The 50% sustain rule must not be changed without an explicit contract revision. The `duration_ms` field must not be mutated.

3. **Renderer spacing must remain stable.** Slur and staccato are post-draw visual overlays. They must not influence note x-positions, bar widths, or formatter state.

4. **New MusicXML imports cannot silently alter established behavior.** A new test song that produces different staccato or slur rendering than the contracts above triggers a regression, not a feature. Investigate before accepting.

5. **Tie infrastructure must not be reused for slurs.** `_drawSlurs` and `_drawTies` are parallel systems. Merging them creates semantic ambiguity between attack suppression and phrase marking.

---

## 8. Reference Sources

These sources inform notation decisions. They are conceptual references, not runtime dependencies.

**Elaine Gould — *Behind Bars* (Faber Music, 2011)**
The authoritative English-language reference for music engraving conventions. Used for:
- §4: Stem direction rules, middle-line convention, beam direction
- §4: Beam grouping in simple and compound meter
- §5: Note spacing and proportionality principles
- §6: Accidental placement and carry rules
- §3: Rest positioning conventions

**MuseScore engraving behavior**
The practical open-source notation reference. MuseScore's default behavior for stem direction, beam grouping, and accidental suppression is used as a secondary validation when Gould is ambiguous or overly complex for implementation. Key references:
- Middle-line note convention (stem-down by default)
- Key-signature accidental suppression behavior
- Courtesy accidental display rules

**VexFlow documentation and source (v5.0.0)**
The renderer implementation reference. Used for:
- API correct usage (voice joining pattern, beam construction, GhostNote)
- Draw pipeline requirements (beam creation before voice draw)
- SMuFL glyph rendering in SVG
- Stave geometry methods (`getWidth`, `getNoteStartX`, `getX`)

**Important:** VexFlow is the rendering engine, not the source of engraving rules. When VexFlow's default behavior differs from Gould/MuseScore convention, the standard convention takes precedence and the renderer overrides VexFlow's default (stem direction, beam draw order).

---

## 9. How Future Layer 3 Work Should Use This Document

**Before implementing any notation feature:**

1. Check §2 to verify the feature isn't already implemented
2. Check §4 to find the specification for deferred features
3. Check §5 for known bugs that might interact with the new feature
4. Check §6 for the relevant functions to modify

**When implementing a deferred feature:**

- Implement in `notation-renderer.js` only
- Do not touch `runtime-engine.js`, `gameplay-engine.js`, or song.json schema
- Do not introduce manual x-positioning or pixel math
- Do not replace the VexFlow formatter — add guidance around it
- After implementation, move the item from §4 to §2 in this document and update §5 if a known limitation is resolved
- Write a DEVLOG entry with the session number, scope, root cause, changes, and behavioral effect

**Priority order for remaining Layer 3 work:**

1. ~~Tie rendering (§4.1)~~ — ✓ Implemented Session 18
2. ~~Accidental carry rules + natural sign insertion (§4.2)~~ — ✓ Implemented Session 30
3. ~~Staccato rendering + playback shortening (§4.6)~~ — ✓ Implemented Sessions 33–35; frozen Session 38
4. ~~Slur rendering (§4.7)~~ — ✓ Implemented Sessions 36–37; frozen Session 38
5. Compound meter beam grouping (§4.4) — required before adding 6/8 or 9/8 songs
6. Collision detection (§4.3) — only needed for advanced repertoire

---

## 10. Session 43–44 Baseline Freeze Checkpoint

*Established 2026-05-22, following the controlled rollback of the note-name annotation experiment (Session 43) and the formal stabilization audit (Session 44).*

> This section declares the formal stable baseline for the notation renderer and presentation layer.  
> Future work must treat this as the regression reference target.

---

### 10.1 Declared Stable Baseline

The following systems are declared stable and frozen as of 2026-05-22.

| System | Status | DEVLOG / Reference |
|--------|--------|--------------------|
| Stem direction — furthest-note rule (Gould §4) | ✓ Frozen | §2.1, Sessions 14–17 |
| Beam grouping — beat-indexed, ε boundary fix | ✓ Frozen | §2.2, Sessions 12–13, 28 |
| Beam flag suppression — draw-order contract | ✓ Frozen | §2.3, Session 13 |
| Pickup bar / GhostNote temporal alignment | ✓ Frozen | §2.4, Sessions 10–11 |
| Grand staff vertical beat alignment | ✓ Frozen | §2.5, Sessions 6–8 |
| Dotted note rendering — `Dot` modifiers explicit | ✓ Frozen | §2.6, Sessions 28–29 |
| Rest positioning — staff-middle-line keys | ✓ Frozen | §2.7 |
| Bar width optical allocation — blend smoothing | ✓ Frozen | §2.8, Sessions 7–11 |
| Tie rendering — chord tie, `_noteHeadProxy`, cross-row | ✓ Frozen | §2.9, §11b, Sessions 18–25 |
| Accidental carry rules + natural sign insertion | ✓ Frozen | §2.10, Session 30 |
| Staccato rendering — notehead-centric placement | ✓ Frozen | §4.6, Sessions 33–35, 38 |
| Staccato playback — 50% sustain, `duration_ms` read-only | ✓ Frozen | §4.6, Session 33 |
| Slur rendering — same-staff, lens Bezier geometry | ✓ Frozen | §4.7, Sessions 36–37, 38 |
| Hand-color identity — #4a9eff treble, #e06830 bass | ✓ Frozen | `learning-state.js`, Session 39 |
| Clef filter — audio gate + highlight gate | ✓ Frozen | `LearningModeState`, Sessions 39, 41 |
| Keyboard visualization — typed event protocol | ✓ Frozen | `keyboard-viz.js`, Sessions 40–42 |
| Tie-aware re-attack suppression (tie_stop flag) | ✓ Frozen | Sessions 41–42 |
| Sticky keyboard + scrollable score container layout | ✓ Frozen | Session 41 |
| Vertical scroll behavior — scrollToBar + scroll-padding | ✓ Frozen | Sessions 41–42 |

**To change anything on this list**, a session must:
1. Document an explicit scope decision in DEVLOG before touching code
2. Run all relevant sections of `engraving-validation-checklist.md` before and after
3. Record what changed, why, and regression results in a DEVLOG entry

---

### 10.2 Architectural Separation Principle

**The notation renderer is a semantic engine. Educational presentation systems are consumers of its output. These two layers must never be coupled.**

| Layer | Owns | Must not touch |
|-------|------|----------------|
| `notation-renderer.js` | SVG geometry, VexFlow pipeline, note layout | `LearningModeState`, `KeyboardViz`, any annotation overlay |
| `learning-state.js` | Clef filter, hand-color, level-derived hint rules | Renderer internals, `_noteElMap`, VexFlow note objects |
| `keyboard-viz.js` | Key highlight DOM rendering | song.json semantics, playback timing, renderer layout |
| Future annotation overlays | Float above SVG output, listen to presentation events | Must not read renderer-internal state directly |

**"Formally contracted" accessor rule:** Any future feature that needs data from the renderer must consume a public accessor that is:
- Documented in §6 (Key Functions) with its return type and valid-after condition
- Specified for null-return cases (rest events, pre-render calls, unmapped IDs)
- Explicitly listed in this document as a stable contract

The `getNoteElement(eventId)` accessor added in Sessions 40–42 and removed in Session 43 did not meet this bar — it exposed `_noteElMap` (a VexFlow implementation detail) without a formal contract. No future accessor should be added without meeting the above criteria.

---

### 10.3 Systems Allowed for Future Experimentation

These areas are NOT frozen and are appropriate targets for the next development phase.

| Area | Constraint |
|------|-----------|
| Note-name annotation overlay | Requires all four re-entry conditions in §10.4 |
| Fingering overlay | Same isolation requirement as note-name overlay |
| Stage 2 question/feedback highlights | May extend `LearningModeState`; must not touch renderer layout |
| Compound meter beam grouping | Notation feature — implement in renderer only (§4.4) |
| Cross-system slur half-arcs | Notation feature — extend `_drawSlurs` only |
| Dynamic marking rendering | Notation feature — extend renderer only |
| Grace note / ornament rendering | Notation feature — extend renderer only |
| Pedal marking rendering | Notation feature — extend renderer only |
| Multi-voice notation (voice 2) | Major renderer feature — requires dedicated design session |

**Rule:** Notation features → implemented in `notation-renderer.js` only. Educational presentation features → implemented in presentation-layer modules (`learning-state.js`, `keyboard-viz.js`, or new parallel modules) only. Neither may import from the other.

---

### 10.4 Re-entry Conditions for Note-Name Annotation Overlay

Before note-name annotation work can be re-attempted, ALL FOUR conditions must be satisfied:

**Condition 1 — Formally contracted element accessor**

`notation-renderer.js` must expose `getNoteElement(eventId)` as an explicit public method with:
- JSDoc `@returns` specifying element type and post-`render()` validity window
- Documented null-return cases (rest events, unmapped IDs, pre-render calls)
- An entry in §6 Key Functions table with the contract string

**Condition 2 — Enter-before-exit constraint in runtime-contract.md**

`docs/runtime-contract.md` must contain an explicit section stating:
- `_processEnters()` fires **before** `_processExits()` every tick
- Annotation modules must NOT call `clearAnnotation()` from `onEventExit` — doing so destroys the label placed by the next note's enter event at the same timestamp
- Correct lifecycle: annotations clear-then-replace on enter; explicitly cleared only by global reset (stop, song-change, end)

**Condition 3 — Isolated annotation regression test song**

`songs/test_note_labels.json` (minimal: 1–2 bars, stem-up and stem-down notes, one rest, treble only) must exist. `engraving-validation-checklist.md` must grow a §24 for annotation-specific regression criteria.

**Condition 4 — Layer 3 validation green**

All active sections of `engraving-validation-checklist.md` (§§1–23) must be verified passing on the test corpus before annotation is re-layered on top.

---

*Companion documents: `SPEC.md` §9, `DEVLOG.md` Sessions 7–15, `docs/runtime-contract.md`*
