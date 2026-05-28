# Music Notation Semantics — MyKey Music Labs

**Purpose:** Semantic architecture reference for the notation system. Defines layer authorities, event semantics, and invariants that all future notation feature work must respect.

**Scope:** Semantic architecture, event contract, tie/beam/stem/chord semantics, playback semantics, rendering semantics, invariants, and extension placeholders.

**Not:** An implementation document. For renderer implementation, see `engraving-standards.md`. For project architecture, see `SPEC.md §3`.

> **Document architecture:**
> `SPEC.md` → project constitution
> `engraving-standards.md` → renderer implementation law
> `engraving-validation-checklist.md` → practical regression acceptance
> **This file → semantic authority, event contract, and notation ontology**
> `DEVLOG.md` → historical implementation record

---

## 1. Semantic Philosophy

### 1.1 Layer Definitions

The notation system is built on four distinct layers, each with a single, non-negotiable authority:

| Layer | Authority | What it owns |
|-------|-----------|--------------|
| `song.json` | **Semantic truth** | Event identity, pitch, duration, timing, tie/rest flags, clef assignment |
| `runtime-engine.js` | **Temporal authority** | Timeline progression, event dispatch, playhead position, pause/resume |
| `notation-renderer.js` | **Visual interpreter** | SVG layout, note position, tie arcs, beam lines, highlight state |
| `playback / audio` | **Sound interpreter** | Attack suppression, sustain duration, audio output |

### 1.2 song.json as Semantic Truth

`song.json` is the single source of semantic truth for the entire runtime system. All engines read from it; no engine writes to it or reinterprets it.

**What song.json determines:**
- Whether an event is a note, chord, or rest
- The pitch content of every event (exact spelling, octave)
- The absolute timing of every event (`t_ms`, `duration_ms`)
- Whether a note begins or ends a tie (`tie_start`, `tie_stop`)
- Which treble and bass events are simultaneous (`pair_with_id`)
- Clef assignment for every event

**What song.json does not determine:**
- Visual x/y position of any notehead (renderer's domain)
- Whether a tie arc is drawn (renderer decision, constrained by semantic flags)
- Whether a note plays audio (playback engine decision, constrained by `tie_stop`)
- Timeline progression rate (runtime-engine's domain)

### 1.3 runtime-engine as Temporal Authority

The runtime-engine is the sole owner of time. No other engine may advance the playhead, alter event timing, or derive timing from any source other than `song.json`'s `t_ms` and `duration_ms` fields.

**Explicitly forbidden:**
- Renderer deriving timing from pixel positions or SVG layout
- Playback engine advancing the timeline on audio completion
- Gameplay engine controlling timeline progression based on user input
- Any engine caching or recomputing `t_ms`/`duration_ms` values

### 1.4 notation-renderer as Visual Interpreter

The renderer reads `song.json` event data and produces an SVG visual representation. It applies engraving rules (Gould, MuseScore conventions) to make visual decisions. It does not own any semantic state.

**The renderer may:**
- Decide stem direction based on note pitch and staff position
- Group notes into beam groups based on `t_ms` arithmetic
- Draw tie arcs when semantic conditions are met
- Reject a tie arc if semantic conditions are not met (adjacency, rest)

**The renderer must not:**
- Alter the timing or pitch of any event
- Infer semantic relationships that are not explicit in `song.json`
- Serve as a data source for gameplay, scoring, or runtime logic
- Become replaceable only at the cost of rewriting other engine logic

### 1.5 Playback as Sound Interpreter

The audio layer reads event data and produces sound. It depends on `song.json` flags (`tie_stop`, `type`) to decide what to do, not on visual state.

**The audio layer must not:**
- Read SVG geometry to determine whether a tie arc is present
- Infer tie state from note adjacency or pitch proximity
- Advance the timeline or own playhead state

### 1.6 The Anti-Pattern: Renderer as Semantic Authority

The renderer must never become the source of truth for any semantic fact. Specifically:

- Gameplay must not read pixel positions to determine which note is "current"
- Playback must not check whether a tie arc is drawn to decide whether to suppress attack
- Runtime must not query SVG state to advance to the next event

All semantic information travels one direction: `song.json` → engine callbacks → consumer layers. This direction is non-negotiable.

---

## 2. Event Semantics

### 2.1 Event Types

Every event in `song.json` is one of three types:

**`note`** — A single pitched event with exactly one pitch in `notes[]`.
```json
{ "type": "note", "notes": ["C4"], "duration": "q", "duration_ms": 833, "t_ms": 0 }
```

**`chord`** — Two or more pitches sounding simultaneously on a single stem.
```json
{ "type": "chord", "notes": ["E4", "G4"], "duration": "h", "duration_ms": 1666, "t_ms": 833 }
```

**`rest`** — Silence occupying a metric position. No `notes` field.
```json
{ "type": "rest", "duration": "q", "duration_ms": 833, "t_ms": 2499 }
```

### 2.2 Simultaneous Events

Two events are simultaneous when they share the same `t_ms` value. In `hand_mode: "both"`, simultaneous treble and bass events represent the two hands playing at the same moment. They are separate events — separate clefs, separate identities — that happen to start at the same time.

Simultaneous events are not merged into one event. Each retains its own ID, clef, and semantic properties.

### 2.3 pair_with_id

`pair_with_id` is a cross-clef alignment hint set by the generator when two events share the same `t_ms` (one treble, one bass). It identifies the partner event on the other stave.

**Semantic meaning:** "This event is the visual partner of the named event in the grand staff alignment."

**Not the semantic meaning of pair_with_id:**
- It is not a gameplay authority. The gameplay engine must not use `pair_with_id` to determine which notes must be played together.
- It is not a timing authority. The runtime does not use it to synchronize event dispatch.
- It is not a pitch relationship. The two paired events are independent sounds.

### 2.4 tie_start and tie_stop

`tie_start: true` marks an event as the beginning of a tie chain. The note at this event attacks normally. An arc will be drawn connecting it to the matching `tie_stop` event.

`tie_stop: true` marks an event as a tied continuation. Two semantic effects:
1. **Visual:** The renderer connects this event to the most recent matching `tie_start` (same clef, same pitch, no intervening breaks).
2. **Playback:** The audio layer suppresses the attack of this event. The pitch continues from the previous tied event.

`tie_stop: true` and `tie_start: true` may both be true on the same event. This is a chain tie middle node: it closes the incoming arc and opens the outgoing arc.

**Synchronization invariant:** `tie_stop: true` in `song.json` implies two things simultaneously — no visible arc before this note AND no audio re-attack. These must remain in sync. If the renderer rejects a tie visually, the corresponding `tie_stop` flag must be corrected to `false` before the song is used in production.

### 2.5 Event Identity Rules

Every event has a permanent, unique ID in the format `ev_XXXXXX` (six zero-padded digits).

**Invariants:**
- Event IDs never change once assigned by the generator
- Event IDs are not derived from array position, render order, or any mutable property
- No two events in the same `song.json` share an ID
- Event IDs are the only valid cross-reference handle between systems (pair_with_id, highlight calls, analytics, replay, teacher reports)

**Forbidden identity schemes:** array index, beat slot index, `t_ms` alone, bar-beat-clef tuple.

### 2.6 Timeline Ordering Rules

The flat event list is sorted by `t_ms` ascending. For events with identical `t_ms`, treble precedes bass.

The runtime-engine dispatches events in this order. The renderer draws in this order. The playback engine processes in this order.

No engine may process events in a different order or skip events based on internal state.

---

## 3. Tie Semantics

### 3.1 Three Distinct Tie Concepts

These three concepts are related but not identical. They must not be conflated:

| Concept | Definition | Owner |
|---------|-----------|-------|
| **Semantic tie** | The `tie_start`/`tie_stop` flags in `song.json` | song.json (generator) |
| **Visual tie** | A curved arc drawn by the renderer connecting two noteheads | notation-renderer |
| **Playback tie** | Attack suppression on the `tie_stop` event | audio layer |

A semantic tie produces both a visual tie and a playback tie — but only when all rendering conditions are met. If the renderer rejects the visual tie (adjacency rule, rest rule), the semantic tie's `tie_stop` flag must be corrected in `song.json` to remove the playback effect.

### 3.2 Fundamental Tie Rules

All of the following conditions must hold for a valid tie. Failure of any condition invalidates the tie entirely.

**Rule 1 — Identical pitch.** The `tie_start` event and the `tie_stop` event must have the same pitch: same letter, same octave, same accidental. `E4` and `Eb4` are different pitches and cannot be tied. Pitch proximity alone does not create a tie.

**Rule 2 — Same clef.** A treble event may only tie to another treble event. A bass event may only tie to another bass event. Cross-clef ties do not exist.

**Rule 3 — Rests break ties.** A rest event in the same clef between `tie_start` and `tie_stop` terminates the tie. The pending tie is silently discarded. No arc is drawn.

**Rule 4 — Intervening attacks break ties.** Any note or chord event in the same clef between `tie_start` and `tie_stop` — regardless of pitch — terminates the pending tie. A tie cannot skip over other notes to find a matching pitch later in the voice.

**Rule 5 — Repeated pitch is not a tie.** Two notes of identical pitch appearing in sequence without `tie_start`/`tie_stop` flags are two separate attacks, not a tied continuation. The flags in `song.json` are the sole authority for tie existence.

### 3.3 Tie Chains

A single pitch may be sustained across multiple events via a chain of ties. Each middle node has both `tie_start: true` and `tie_stop: true`. Each pair of adjacent nodes produces one arc.

```
E4 (tie_start) → E4 (tie_stop + tie_start) → E4 (tie_stop)
                 ←────── arc 1 ──────────→
                                            ←──── arc 2 ─────→
```

The middle node closes the incoming arc before opening the outgoing arc. Attack is suppressed on all continuation nodes. Audio duration = sum of all linked `duration_ms` values.

### 3.4 Chord Ties

In a chord, each notehead is tied independently. A 2-note chord `[C4, E4]` tied to another `[C4, E4]` produces two independent arcs — one for C4 and one for E4.

Partial chord ties are valid: if only `E4` carries `tie_start`/`tie_stop` flags and `C4` does not, only the E4 arc is drawn.

`tie_stop: true` on a chord event suppresses all pitches in that chord. Partial per-pitch playback suppression is not supported in the current architecture.

### 3.5 Tie Rendering Is a Visual Overlay

Tie arcs are drawn after the full layout pass. They are pure visual elements. They do not affect:
- Note spacing
- Bar width allocation
- Stem direction
- Beam grouping
- Any layout geometry

The renderer's `_noteObjMap` stores `{ note, stave }` references by event ID, used only after all layout is complete.

### 3.6 Runtime and Tied Continuation Events

The runtime-engine fires `onEventEnter` and `onEventExit` for every event in the timeline — including events with `tie_stop: true`. This is correct and must not change.

Reasons tied continuation events must still enter the runtime:
- The renderer must highlight the continuation notehead
- The scroll-to-bar logic must advance on continuation events
- Analytics and teacher reports track all events, including continuations
- Future adaptive learning systems may analyze tie response patterns

The audio layer is the only consumer that responds to `tie_stop: true` by suppressing the attack. All other consumers treat the event normally.

---

## 4. Beam Semantics

### 4.1 What Beams Mean

A beam connects consecutive notes of short duration (eighth or shorter) into a visual group that shares a single horizontal bar, replacing individual flags. Beaming communicates rhythmic grouping to the reader.

Beams have no playback meaning. A beamed group of eighth notes plays identically to flagged eighth notes. Beaming is purely a visual readability tool.

### 4.2 Beat-Group Authority

Beam groups are determined by beat boundaries, not by note proximity or pitch content. In simple meter, a beat boundary occurs at each primary beat position.

The beat index for a note is computed from `t_ms` arithmetic:
```
beatIdx  = floor((note.t_ms − barStartMs) / msPerBeat)
msPerBeat = (60000 / bpm) × (4 / beatValue)
```

Notes with the same `beatIdx` belong to the same beam group. Notes in different beat groups are never beamed together, regardless of duration or proximity.

**Authority for beam grouping:** `t_ms`, `bpm` from `song.json meta`, and `time_signature`. Not pitch, not visual proximity, not bar position.

### 4.3 Why Beams Cannot Cross Beat Boundaries in Simple Meter

Standard music engraving (Gould §4) requires that beams not cross primary beat boundaries in simple meter. This rule exists because:

- Beat boundaries define the metric structure of the bar
- A beam crossing a beat boundary obscures where beat 2 (or 3) begins
- In an educational context, visible beat boundaries are essential for the learner to internalize meter
- Sight-reading requires the student to perceive rhythmic grouping; obscured beats make this harder

This is a semantic rule about musical comprehension, not merely an aesthetic preference.

### 4.4 Beamable Durations

Only `8`, `16`, and `32` duration events are beamable. Quarter notes and longer are never beamed. Rest events are never beamed. A group with only one beamable note receives an individual flag (correct standard behavior).

### 4.5 Rhythmic Semantics vs Visual Grouping

Beaming expresses rhythmic intent visually but does not alter the semantic meaning of individual note durations. The `duration_ms` of each note is fixed by `song.json` and is not affected by whether the note is beamed or flagged.

The renderer may adjust stem direction to unify a beam group (all notes in a group share one direction), but this is a visual decision derived from the group's pitch content — it does not change note pitch or duration.

---

## 5. Stem Direction Semantics

### 5.1 Middle-Line Rule

Stem direction is determined by a note's position relative to the staff middle line (Gould §4):
- Notes **below** the middle line → stem **up**
- Notes **on or above** the middle line → stem **down**

Middle line reference values (staff step encoding: `step = letterIndex + octave × 7`, C=0…B=6):

| Clef | Middle line | Step value |
|------|-------------|-----------|
| Treble | B4 | 34 |
| Bass | D3 | 22 |

Boundary convention: `step < middle → up`, `step >= middle → down`. Notes exactly on the middle line receive stem-down (the boundary is not strict `<`). This matches MuseScore default.

### 5.2 Furthest-Note Rule for Chords and Beam Groups

For a chord or beam group with multiple notes at different staff positions, the note furthest from the middle line determines the direction for the entire group (Gould §4 furthest-note rule).

**Tie-break:** When two notes are equidistant from the middle line, the note above the middle line wins → stem down.

For single notes, the furthest-note rule reduces to the middle-line rule. The same `_furthestStepFrom` function handles both cases.

### 5.3 Beam-Group Direction Unification

All notes in a beam group must share one stem direction. VexFlow requires this to draw a straight beam. The unified direction is computed from the furthest-note rule applied across all notes in the group, then applied to every note via `setStemDirection()` before `generateBeams()`.

### 5.4 Post-Format Override Requirement

VexFlow's `Formatter.format()` auto-computes and overwrites stem directions during layout. Any stem direction set via the `StaveNote` constructor is discarded. Correct stem directions must be re-applied via `note.setStemDirection()` after `format()` and before voice draw.

Draw pipeline order (must not change):
1. `_buildNotes()` — computes step values for each note
2. `Formatter.format()` — overwrites constructor stem directions
3. Post-format `setStemDirection` loop — re-applies correct per-note directions
4. `_beatGroupedBeams()` — overrides beam-group notes with unified `groupDir`
5. `Voice.draw()` — renders with final stem directions

### 5.5 Stem Direction Is Visual Only

Stem direction has no semantic meaning. It does not affect pitch, duration, timing, or playback. It is a visual interpreter decision owned entirely by the renderer.

---

## 6. Chord Semantics

### 6.1 Chord Identity

A chord is a single event (`type: "chord"`) with two or more pitches in `notes[]`. All pitches in the chord:
- Share the same `t_ms` (simultaneous onset)
- Share the same `duration_ms` (equal duration)
- Share the same `bar`, `beat`, `clef`, and `duration` fields
- Are attacked together and sustained together

A chord is one event, not multiple events merged for rendering. It has one event ID.

### 6.2 Pitch Ordering

`notes[]` in `song.json` lists pitches in the order the generator encountered them (typically bottom to top in staff order). The renderer does not rely on a specific ordering for pitch rendering — VexFlow `StaveNote` accepts keys in any order.

For tie matching, pitches are sorted before forming the pending map key (`"clef:sortedPitches"`). This makes `[E4, C4]` and `[C4, E4]` equivalent for tie resolution.

### 6.3 Chord Tie Mapping

Chord ties are per-pitch. A chord with `tie_start: true` means all pitches in the chord begin a tie chain. A chord with `tie_stop: true` means all pitches are tied continuations.

For partial chord ties (only some pitches tied), the current architecture requires that `tie_start`/`tie_stop` be consistent with the pitch key. Partial pitch tie support is an architectural extension, not a current capability.

### 6.4 Chord Stem Direction

Chord stem direction uses the furthest-note rule (§5.2), applied across all pitches in `notes[]`. The stem direction applies to the entire chord — there is one stem per chord, not one per pitch.

### 6.5 Simultaneous Note Ownership

In `hand_mode: "both"`, treble and bass events at the same `t_ms` are owned by separate clef voices. They are visually aligned on the grand staff but semantically independent. The `pair_with_id` field links them for alignment purposes only (§2.3).

Neither event "owns" the other. The runtime dispatches both independently.

---

## 7. Playback Semantics

### 7.1 Attack Events

An attack occurs when an event is entered by the runtime and the audio layer produces a new sound onset. Attack events are: all `type: "note"` and `type: "chord"` events where `tie_stop` is `false` or absent.

Attack produces audio at `t_ms` and sustains for `duration_ms`.

### 7.2 Sustain Continuation (tie_stop)

When `tie_stop: true`, the event is a sustain continuation. The audio layer suppresses the new onset for this event. The sound from the preceding `tie_start` event continues without interruption.

The combined audio duration of a tied group = sum of `duration_ms` for all events in the chain.

### 7.3 Suppression Is Flag-Driven, Not Visual

The playback engine must not:
- Check whether a tie arc is visible in the SVG
- Infer tie state from pitch proximity or adjacency
- Query the renderer for note position or state

`tie_stop: true` in `song.json` is the sole trigger for attack suppression. If the semantic flag is wrong, the audio behavior will be wrong. This is why semantic flag correctness is a hard invariant (§4 tie semantics).

### 7.4 Rest Events

`type: "rest"` events produce no audio. The runtime still dispatches them (for highlight and scroll-to-bar logic). The audio layer skips them.

### 7.5 Visual Events vs Audible Events

Every event is a visual event — it always triggers highlighting and layout. Not every event is an audible event — `tie_stop` continuations and rests are silent.

This asymmetry is intentional. The visual system and the audio system have different consumers and different rules.

| Event type | Visual (highlight) | Audio (attack) |
|-----------|-------------------|----------------|
| `note`, `chord`, `tie_stop: false` | Yes | Yes — full sustain |
| `note`, `chord`, `tie_stop: false`, `articulations: ["staccato"]` | Yes | Yes — shortened sustain (~50%) |
| `note`, `chord`, `tie_stop: true` | Yes | No (attack suppressed) |
| `rest` | Yes (rest highlight) | No |

Note: `slur_start`/`slur_stop` flags do not appear in this table because they have no audio effect. A slurred note attacks and sustains identically to a non-slurred note.

### 7.6 Why Tied Continuation Events Remain in the Runtime Timeline

A tied continuation event (`tie_stop: true`) is a full event in the timeline, not a metadata annotation on its predecessor. This is required because:

- The renderer must highlight the continuation notehead during its metric duration
- Scroll-to-bar logic needs the event to advance the viewport
- The gameplay engine evaluates note correctness at `t_ms` — the continuation's `t_ms` is the correct evaluation point
- Analytics require the continuation to be a discrete, trackable entity
- In two-hand mode, the continuation's `t_ms` may align with a new bass event — the pair must both fire

Removing tied continuation events from the timeline would break all of the above. The suppression is audio-only.

---

## 8. Rendering Semantics

### 8.1 Renderer Is Not Timing Authority

The renderer receives `song.json` event data as input. It does not derive timing from any other source. It does not read the DOM, pixel positions, or SVG geometry to determine when an event occurs.

`t_ms` and `duration_ms` come from `song.json` exclusively. The renderer uses `t_ms` for beam group indexing only — it does not use it to drive any form of timeline or animation.

### 8.2 Renderer Cannot Mutate Song Semantics

The renderer produces an SVG output. It does not write to `song.json`, does not set flags, does not communicate semantic state back to other engines.

If the renderer rejects a tie arc (adjacency rule, rest rule), it does not update `tie_stop` in the JSON. The mismatch between the renderer's visual decision and the JSON state is a data integrity problem that must be fixed in the source data (by the generator or manual correction), not papered over at render time.

### 8.3 VexFlow Is a Formatting Engine, Not a Semantic Engine

VexFlow receives note data (keys, durations, stem directions) and produces positioned SVG elements. It makes layout decisions (note x-position, spacing, notehead vertical position) that are invisible to all other engines.

VexFlow does not know:
- What a `tie_start` means semantically
- Whether a beam group is metrically correct
- Whether a stem direction is educationally appropriate

These decisions are made by the renderer layer before data is passed to VexFlow. VexFlow executes layout and drawing; it does not validate musical semantics.

**Corollary:** When VexFlow's default behavior diverges from engraving convention (e.g., stem directions discarded after `format()`), the renderer must override VexFlow's output, not accept it as semantically correct.

### 8.4 SVG Output Is Final Visual Layer Only

The SVG produced by VexFlow is the terminal output of the visual pipeline. No downstream system may:
- Read SVG geometry for game logic or timing decisions
- Use SVG element positions to determine what note is "current"
- Derive pitch or duration information from glyph shapes

SVG is display-only. It is replaceable (VexFlow Canvas, WebGL, native, PDF export) without affecting any other engine.

---

## 9. Semantic Invariants

The following invariants must hold at all times. A violation of any invariant is a bug, not a design choice.

**I1 — Renderer must not alter event timing.**
No renderer operation may change `t_ms` or `duration_ms` on any event, in memory or in `song.json`.

**I2 — Playback must not infer ties visually.**
The audio layer must not query SVG, DOM, or renderer state to determine whether a tie arc is present. Attack suppression is driven solely by `tie_stop` in `song.json`.

**I3 — Semantic relationships come from song.json only.**
Tie relationships, clef assignments, pitch content, and timing are read from `song.json`. No engine computes or extends these relationships at runtime.

**I4 — Ties are semantic continuity, not visual proximity.**
Two notes with the same pitch adjacent in the timeline are not semantically tied unless `tie_start`/`tie_stop` flags explicitly link them. Pitch proximity does not imply tie.

**I5 — pair_with_id is not gameplay authority.**
The gameplay engine must not use `pair_with_id` to determine which notes must be played together or to coordinate scoring across hands. It is a visual alignment hint.

**I6 — Event IDs are permanent.**
`ev_XXXXXX` IDs must never be reassigned, reordered, or regenerated. All cross-references (analytics, replay, pair_with_id, highlight calls) depend on ID stability.

**I7 — Runtime dispatches all events.**
The runtime fires `onEventEnter` for every event in the timeline, including rests and `tie_stop` continuations. No engine may instruct the runtime to skip events.

**I8 — Visual tie and playback tie must be synchronized.**
If `tie_stop: true` is set, an arc must be drawn (or the flag must be corrected to `false`). A note that is silenced without a visible arc is a user-facing error.

**I9 — VexFlow format() overrides constructor stem values.**
Post-format `setStemDirection()` calls are mandatory for all non-rest notes. Constructor-only stem direction is not sufficient and will be discarded by `Formatter.format()`.

**I10 — Song.json is generated offline; engines are read-only consumers.**
No browser engine may generate, normalize, or extend `song.json` content. All data transformations occur in the offline Python pipeline (`mxl_to_song.py`, `validate_song.py`).

**I11 — Slur flags are not attack suppression.**
`slur_start: true` and `slur_stop: true` carry no playback effect. The audio layer must not suppress an attack or extend a duration based on slur flags. Only `tie_stop: true` suppresses attack. Slur and tie infrastructure must remain completely separate.

**I12 — Articulations do not affect duration, timing, or tie state.**
The `articulations[]` field is a modifier annotation only. It does not alter `t_ms`, `duration_ms`, `tie_start`, `tie_stop`, or event dispatch timing. The timeline treats an event with `"articulations": ["staccato"]` identically to one without — `onEventEnter` and `onEventExit` fire at the same times. Staccato's 50% audible-sustain shortening is applied by the audio layer as a note-off timing adjustment, not a timeline mutation.

**I13 — Slur placement follows source engraving intent.**
The renderer does not apply automatic placement heuristics, direction flipping, or phrase-direction inference to slur arcs. The `slur_start`/`slur_stop` positions from `song.json` drive anchoring. MuseScore/MusicXML is the engraving authority; the renderer follows, not decides.

**I14 — Layer 3 corpus extension must not redefine established contracts.**
Adding a new MusicXML test file extends validation coverage. It does not reopen semantic decisions made in Sessions 32–38. A test file that produces different staccato or slur behavior than the frozen contracts above is a schema violation requiring a formal contract revision, not a silent feature expansion.

---

## 10. Future Semantic Extensions

The following notation features are deferred. This section defines architectural concerns and semantic questions that must be resolved before implementation. No implementation is implied.

---

### 10.1 Tuplets

**Semantic concern:** Tuplet notes have non-standard `duration_ms` values (e.g., triplet eighth = 2/3 × nominal eighth). The `song.json` event contract must either store the fractional `duration_ms` directly or introduce a `tuplet` metadata field to communicate the ratio.

**Playback concern:** Timeline integrity requires exact `t_ms` values. Floating-point accumulated error across tuplet chains may cause drift. Generator must compute and store precise cumulative offsets.

**Visual concern:** Tuplet bracket and number placement requires a new VexFlow `Tuplet` object pass after beam grouping. Tuplets interact with beam groups — a beamed triplet group is both a `VF.Beam` and a `VF.Tuplet`.

**Invariant to preserve:** Beam-grouping authority remains `t_ms`-based. Tuplet events must carry correct `t_ms` from the generator.

---

### 10.2 Slurs

*Semantic architecture established Session 32. Rendering implemented Sessions 36–37. Contracts frozen Session 38. See `engraving-standards.md` §4.7.*

#### Semantic definition

A slur is a **phrase legato marking**. It groups consecutive notes into a phrased, smoothly-connected passage. Visually: a curved arc over or under the note span.

**What a slur IS:**
- A phrase grouping mark
- A legato articulation instruction
- A visual span connecting the first and last notes of the phrase
- May span different pitches (unlike a tie, which requires identical pitch)
- May span beam groups and barlines

**What a slur IS NOT:**
- Not attack suppression — every note under a slur is attacked
- Not duration extension — note `duration_ms` is unchanged
- Not semantic continuity — the slur carries no playback effect in MVP
- Not a tie — must never be confused with or share infrastructure with `tie_start`/`tie_stop`

A slur may coexist with a tie on the same note (a note that both opens a slur and begins a tie). It may also coexist with staccato (portato articulation — slurred but detached).

#### song.json field design (confirmed Session 32)

```json
"slur_start": true     // omit when false/absent
"slur_stop": true      // omit when false/absent
```

Both fields are omitted on events where the slur condition does not apply — same pattern as `pair_with_id`. They are never set to `false` explicitly; absence means false.

A `slur_stop: true` event does NOT suppress the audio attack. This is the fundamental semantic difference from `tie_stop: true`.

#### MusicXML source (MuseScore 4 export)

Slurs are exported in `<notations>` as `<slur type="start|stop" number="N" bezier-x="..." bezier-y="..."/>`. The `number` attribute identifies concurrent slur groups. The `bezier-*` attributes are layout hints only.

```xml
<!-- slur_start note -->
<notations>
  <slur type="start" number="1" bezier-x="29.24" bezier-y="-21.29"/>
</notations>

<!-- slur_stop note (may be in a different bar) -->
<notations>
  <slur type="stop" number="1" bezier-x="-29.24" bezier-y="-21.29"/>
</notations>
```

Observed in `test_scores/test_staccato_slur.mxl`: bars 3–4 (A4 → A4 spanning beam group), bars 7–8 (A4 → D4 spanning beam group and barline).

#### music21 extraction path (for `mxl_to_song.py`)

Slurs are stored as **spanners** in music21, not as per-note attributes:

```python
from music21 import spanner as m21_spanner

for sp in el.getSpannerSites():
    if isinstance(sp, m21_spanner.Slur):
        if sp.isFirst(el):
            ev["slur_start"] = True
        if sp.isLast(el):
            ev["slur_stop"] = True
```

Omit the field when not present (do not set to `False`). The slur number from MusicXML maps to distinct `Slur` spanner objects in music21; concurrent slurs can be distinguished via spanner identity. For MVP (single slur per staff), this is not needed.

#### Visual rendering (implemented Sessions 36–37)

VexFlow 5.0.0 has no `StaveSlur`. Implemented as custom SVG cubic Bezier path in `_drawSlurs()` / `_drawSlurPath()` in `notation-renderer.js`. Tie infrastructure is NOT reused — entirely separate code paths.

**Invariant:** Tie infrastructure must not be reused for slurs. The two are visually similar but semantically orthogonal. Tie carries playback meaning (attack suppression); slur does not.

#### Layer 3 freeze — slur regression contracts (Session 38)

The following behaviors are frozen. Any future change that violates these is a regression, not a feature:

| Contract | Frozen behavior |
|----------|----------------|
| Attack suppression | `slur_stop: true` NEVER suppresses audio attack |
| Duration | `duration_ms` is NEVER modified by slur flags |
| Tie separation | `_drawSlurs` and `_drawTies` share NO infrastructure |
| Placement authority | MuseScore/MusicXML placement intent is the primary authority — no auto-flip heuristics |
| Playback shaping | No audio effect implemented; slur is display-only |
| Cross-system | Cross-row slurs silently skipped — not a bug, a known deferred scope boundary |

**Corpus extension rule:** Adding a new MusicXML file may extend coverage of the above contracts but must not redefine them. A new test file that triggers different slur behavior than the above table is a schema violation, not a feature.

---

### 10.3 Articulations

*Semantic architecture established Session 32. Staccato rendering implemented Session 34–35. Staccato playback implemented Session 33. Contracts frozen Session 38. See `engraving-standards.md` §4.6.*

#### song.json field design (confirmed Session 32)

```json
"articulations": ["staccato"]   // omit when no articulations present
```

The `articulations` field is an **array of symbol name strings**, omitted entirely when the event has no articulations. This allows multiple simultaneous articulations (e.g., `["staccato", "tenuto"]`).

The field is present only on `note` and `chord` events — never on `rest`. It is not present when empty (not `null`, not `[]`); absence means no articulations.

#### Staccato semantics

Staccato (`·`) indicates that the note should be played briefly and detached — roughly 50% of its notated duration is audibly sustained.

**What staccato IS:**
- A playback articulation modifier: audible sustain shortened
- A visual modifier: a dot placed above or below the notehead

**What staccato IS NOT:**
- Not duration semantics — `duration_ms` in `song.json` is unchanged
- Not tie semantics — `tie_start`/`tie_stop` are unchanged
- Not timeline timing — `t_ms`, event dispatch, and `onEventExit` timing are all unchanged
- Not note identity — the event ID is unaffected

Staccato affects only the **audible sustain** at the audio layer. The timeline occupancy (`duration_ms`) remains the composer's notated duration. The audio layer applies a note-off at approximately `t_ms + duration_ms × 0.5` while the event remains "active" in the timeline until `t_ms + duration_ms`.

#### Chord staccato

In MusicXML (MuseScore export), staccato is placed on the first note of a chord only. In music21, `chord.articulations` exposes it at the chord level. In `song.json`, the `articulations` field appears on the chord event (a single event with multiple pitches in `notes[]`). One staccato dot is rendered per chord — not per notehead.

#### Beamed staccato

Staccato on beamed notes attaches to each note individually. Each beamed event may carry its own `"articulations": ["staccato"]`. Placement is per-note, relative to each notehead.

#### MusicXML source (MuseScore 4 export)

```xml
<notations>
  <articulations>
    <staccato default-x="4.93" default-y="3.44"/>
  </articulations>
</notations>
```

The `default-x`/`default-y` are MuseScore-computed glyph offsets. These are layout hints that the renderer computes independently from stem direction and notehead position — they are not stored in `song.json`.

Observed in `test_scores/test_staccato_slur.mxl`: treble staccato on individual notes (bars 1–2, 5–6), bass staccato on chords (bars 1–4, 5–7).

#### music21 extraction path (for `mxl_to_song.py`)

`el.articulations` is already imported (`m21_articulations`). Extract staccato via:

```python
has_staccato = any(
    isinstance(art, m21_articulations.Staccato)
    for art in el.articulations
)
if has_staccato:
    ev["articulations"] = ["staccato"]
```

Omit the field when no articulations are found. Do not add `"articulations": null` or `"articulations": []`.

#### Layer 3 freeze — staccato regression contracts (Session 38)

The following behaviors are frozen. Any future change that violates these is a regression:

| Contract | Frozen behavior |
|----------|----------------|
| Written duration | `duration_ms` NEVER changed by staccato |
| Beat timing | `t_ms`, `onEventEnter`, `onEventExit` timing NEVER changed |
| Tie state | `tie_start`/`tie_stop` NEVER affected by articulations |
| Sustain rule | Audio note-off at ~50% of `duration_ms` — `performedDurationMs = duration_ms × 0.5` |
| Visual placement | Notehead-centric: stem-up → dot below notehead; stem-down → dot above |
| Chord staccato | One dot per chord event at modifier index 0 — never one dot per notehead |
| Rest events | `articulations` field NEVER appears on rest events |

**Corpus extension rule:** A new MusicXML file may add staccato to previously unstaccato contexts. It may not introduce behavior that contradicts the table above.

#### Other articulation symbols

All other articulation symbols (tenuto, accent, marcato, fermata) are deferred. Their semantic definitions remain as documented here for planning:

| Symbol | Effect | Timeline implication |
|--------|--------|---------------------|
| Staccato | Short, detached — ~50% sustain | None |
| Tenuto | Full, sustained — ~100% or slightly over | None |
| Accent | Louder attack velocity | None |
| Marcato | Very strong accent | None |
| Fermata | Held beyond notated duration | **Runtime extension required** — playhead pause |

**Fermata special case:** Fermata is the only articulation with runtime timing implications. It requires a `runtime-engine.js` extension before it can be implemented. Implement all other articulations first.

---

### 10.4 Dynamics

**Semantic concern:** Dynamic markings (`p`, `mf`, `f`, hairpins) apply to a passage, not a single note. They require a `dynamics[]` array at the bar or event level with onset and (for hairpins) offset positions.

**Playback concern:** Dynamics map to audio velocity scaling. In MVP, all notes play at uniform velocity. Dynamic support requires per-note velocity in the audio layer.

**Visual concern:** Dynamic symbols are placed below the bass stave (standard grand staff convention). VexFlow `TextDynamics` renders standard dynamic symbols; hairpins require `StaveHairpin`.

**Invariant to preserve:** Dynamics are display and audio metadata; they do not affect `t_ms`, `duration_ms`, or tie state.

---

### 10.5 Ornaments

**Semantic concern:** Ornaments (trill, mordent, turn, tremolo) represent real musical notes compressed into a symbol. Their playback expansion is style- and period-dependent. MVP: display only.

**Song.json extension required:** An `ornament` field per event (e.g., `"ornament": "trill"`, `"ornament": "turn"`).

**Visual concern:** Ornament glyphs are placed above noteheads. VexFlow supports `Ornament` modifiers.

**Playback expansion (future):** Trill and turn require micro-note generation at the audio layer. This is architecturally distinct from primary note rendering and must be implemented as a separate pass.

---

### 10.6 Pedal Markings

**Semantic concern:** Pedal markings indicate physical piano pedal actions. They sustain audio beyond note-off, blending harmonics. This is a sound-engine concern, not a note-duration concern.

**Song.json extension required:** `pedal_down` and `pedal_up` event markers, or a `pedal_ranges[]` array in meta.

**Visual concern:** Pedal symbols (`Ped`, `*`, bracket style) are placed below the bass stave. VexFlow `PedalMarking` handles some variants.

**Playback concern:** Pedal sustain requires the audio engine to defer note-off events for all currently sounding pitches. This is beyond the current TEMP_MVP triangle oscillator architecture.

---

### 10.7 Fingering Semantics

**Current state:** `finger` field exists in `song.json` events (single integer 1–5 per note). Populated by the generator from MuseScore fingering annotations.

**Semantic concern:** Finger assignments are educational metadata. They do not affect pitch, timing, or playback. They inform the hint system (hint-engine.js), which displays finger numbers as visual overlays.

**Extension concern:** Chord fingering requires per-pitch finger assignment, not a single integer per event. Future `song.json` extension: `fingers: { "C4": 1, "E4": 3 }` map or parallel array.

**Invariant to preserve:** Finger numbers are educational hints, not gameplay authorities. The gameplay engine must not require correct fingering for note correctness validation.

---

### 10.8 MusicXML Normalization

**Semantic concern:** The `mxl_to_song.py` generator converts MusicXML source into `song.json`. As songs grow more complex, normalization rules become more important:

- Enharmonic spelling (C# vs Db) must follow harmonic context and key signature
- Multi-voice staves must be flattened to voice 1 per stave, with warnings for voice 2+
- Grace notes must be either skipped (MVP) or given explicit fractional timing
- Cross-staff notes must be assigned to the correct clef
- Repeat structures must be unrolled into a linear timeline (or flagged for runtime loop handling)

**Authority invariant:** Normalization decisions made by the generator are baked into `song.json`. Browser engines do not re-normalize. If a normalization rule changes, affected `song.json` files must be regenerated.

---

## 11. Non-Goals

The following are explicitly outside the scope of this semantic layer:

**11.1 This document does not define implementation.**
Function names, class structures, VexFlow call patterns, and draw pipeline details belong in `engraving-standards.md`. This document defines what the system means, not how it is built.

**11.2 This document does not govern audio DSP.**
Pitch detection (McLeod NSDF), frequency split routing, microphone thresholds, and chord detection windows are audio engineering concerns, not notation semantic concerns. They are governed by `SPEC.md §8` and §18.

**11.3 This document does not govern gameplay rules.**
Scoring windows (Perfect/Good/Late/Miss), hint timing, star rating thresholds, and retry logic are educational design decisions, not notation semantic decisions. They are governed by `SPEC.md §5–§7`.

**11.4 This document does not define visual aesthetics.**
Bar width allocation, optical spacing blend, row rebalancing, and formatting margins are renderer implementation decisions governed by `engraving-standards.md §2.8`. This document does not specify how wide bars should be.

**11.5 This document does not provide a human-readable notation tutorial.**
The audience for this document is an engineer building notation features. It is not a music theory introduction, a beginner's guide to reading music, or a user-facing help document.

**11.6 This document does not define MuseScore import workflow.**
The step-by-step `mxl_to_song.py` usage, Python environment setup, and MXL file preparation belong in `SPEC.md §11`. This document only addresses the semantic contract that the generator must fulfill.

**11.7 This document does not specify UI or interaction.**
Stage transitions, hint timers, keyboard highlight colors, and progress bar mechanics are interaction design, not notation semantic design. They are governed by `SPEC.md §5`.

**11.8 This document does not handle multi-voice polyphony.**
Voice 2+ per stave is deferred. This document's event semantics assume one voice per clef. When multi-voice is implemented, this document will require a dedicated §2.x for voice identity semantics.

---

## References

- **Elaine Gould — *Behind Bars*** (2011, Faber Music): Engraving convention authority. §4 stem/beam, §5 spacing, §6 accidentals, §10 ties/slurs.
- **MusicXML Specification** (W3C / MakeMusic): Interchange format for the offline generator pipeline.
- **SMuFL — Standard Music Font Layout**: Unicode glyph encoding used by VexFlow 5.x for music symbols.
- **MuseScore 4**: Practical engraving baseline for stem direction, rest positioning, tie behavior.
- **VexFlow 5.0.0** (CDN: `jsdelivr.net/npm/vexflow@5.0.0/build/cjs/vexflow.js`): Primary rendering engine. Compiled CJS/UMD bundle.

*Companion documents: `SPEC.md` §3–§4 (architecture + data contract), `engraving-standards.md` (renderer implementation), `engraving-validation-checklist.md` (acceptance testing), `DEVLOG.md` Sessions 18–32 (tie/beam/stem/accidental/staccato-slur semantic history).*
