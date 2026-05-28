# Authoring Pedagogy Guide — MyKey Music Labs

**Authored:** 2026-05-22 (Session 49)
**Audience:** Fay (instructor) and future content authors
**Status:** Active reference for learning segment authoring
**Prerequisite reading:** `docs/authoring-workflow.md`

> This guide answers: once the generator gives you a starter set of segments, how do
> you refine them into something that actually helps a beginner learn?

---

## §1 — The Learning Progression Pattern

Most beginner piano songs should follow this three-stage learning arc:

```
Stage 1 — Listen & Watch
  Student plays the full song (no segments active).
  Goal: big-picture familiarity before drilling details.

Stage 2 — Phrase Practice
  Student practices segments one at a time (2–4 bars each).
  Clef filter: right hand first, then left hand, then both.
  Goal: build muscle memory for each phrase independently.

Stage 3 — Section Assembly
  Student plays larger segments (joining adjacent phrases).
  Goal: connect phrases into musical sections.
```

**When to deviate:**
- Very short songs (≤ 8 bars): skip Stage 3 — just go from phrases to full song.
- Songs with a very difficult phrase: give it its own tiny segment (1–2 bars), even if surrounding phrases are 4-bar groups.
- Songs with an obvious A-B-A structure: label them explicitly (Frasa A, Frasa B, Frasa A Ulang) even if they're the same music — the labels help students track where they are.

---

## §2 — Recommended Segment Sizes by Level

| Level | `meta.level` value | Recommended segment size | Rationale |
|-------|-------------------|--------------------------|-----------|
| Early beginner | `early_beginner` | 2 bars | Limited working memory; shorter loop = faster success |
| Beginner | `beginner` | 4 bars | Standard musical phrase length |
| Intermediate | `intermediate` | 4–8 bars | Can sustain attention over longer phrases |
| Advanced | `advanced` | 8+ bars or section-level | Capable of practicing full sections |

**Cognitive load note:** A beginner drilling 8 bars is likely to lose track of which note they stumbled on. 2–4 bars lets them pinpoint the problem, fix it, and feel progress. Shorter loops = faster feedback = more motivation.

**Override rule:** If a 4-bar segment contains a truly tricky passage (e.g., a syncopated rhythm or an unusual chord), split it into two 2-bar segments regardless of the level rating.

---

## §3 — Pickup Bar Handling

A **pickup bar** (anacrusis) is bar 1 that has fewer beats than the time signature (e.g., only beat 4 in a 4/4 song, or beats 3–4 in a 3/4 song).

**Rule: Always include the pickup bar in the first segment.**

Never create:
```json
{ "start_bar": 2, ... }  ← BAD: leaves pickup (bar 1) in no-man's land
```

Always create:
```json
{ "start_bar": 1, "start_beat": 1, ... }  ← correct: first segment starts at bar 1
```

**Why:** The pickup note is often the most important note in the opening phrase (melodic entry, the "question" before the "answer"). Splitting it into its own orphaned segment or omitting it entirely confuses the student about where the phrase begins.

The `generate_segments.py` tool always includes bar 1 in the first segment. When it detects a pickup, it prints an informational note:
```
Note: Bar 1 appears to be a pickup bar (minimum beat = 4). It is included in the first segment.
```
No action required — this is informational only.

---

## §4 — Naming Conventions

Labels appear as button text in the UI. Keep them **short** (under ~20 characters) and **meaningful**.

### Standard labels (Indonesian)

| Musical section | Label |
|----------------|-------|
| Introduction | `Intro` |
| Main theme / melody | `Tema Utama` |
| Phrase A (generic) | `Frasa A` |
| Phrase B (generic) | `Frasa B` |
| Sub-phrase A1 | `Frasa A1` |
| Bridge / transition | `Jembatan` |
| Chorus (if applicable) | `Refrain` |
| Coda / ending passage | `Koda` |
| Repeated phrase | `Frasa A (Ulang)` |

### Naming rules
- Use Indonesian — this is a Bahasa Indonesia product
- Avoid "Part" or "Bagian" — those are used for the `parts[]` navigation system (different UI)
- Avoid "Segmen 1", "Segmen 2" — these are meaningless to a student; use musical names
- Generator output (`Frasa A`, `Frasa B`, ...) is fine as a starting point — refine when the musical structure suggests a better name
- `segment_id` is code-facing: keep it snake_case, no spaces (e.g., `seg_tema_utama`)

---

## §5 — Suggested Repeats Guidelines

`suggested_repeats` tells the UI how many times a student should practice the segment before moving on. It is a **suggestion** — the runtime does not enforce it.

| Difficulty | Suggested value | Example |
|------------|----------------|---------|
| Easy, flowing, familiar pattern | 1 | Simple scale-based melody |
| Moderate, some coordination needed | 2 | Two-hand rhythmic coordination |
| Difficult, unusual rhythm, position shift | 3 | Syncopation, unexpected accidentals |
| Very difficult, needs drilling | 3 | Complex chord transitions |

**Hard rules:**
- Minimum: 1 (always play at least once)
- Maximum: 5 (diminishing returns above this; student fatigue sets in)
- Generator default: 1 (conservative — refine upward where needed)

**Example for `test_pickup_bhand.json`:**
- Frasa A (bars 1–4): has some rhythmic variation → `suggested_repeats: 2`
- Frasa B (bars 5–8): similar rhythm → `suggested_repeats: 2`
- Koda (bar 9): short closing phrase → `suggested_repeats: 1`

---

## §6 — Segment Ordering

`order` determines the left-to-right display sequence in the segments navigation bar.

**Default rule:** Chronological (follows the song's bar order). The generator assigns this correctly.

**Override for A-B-A structure:**
```json
{ "segment_id": "seg_frasa_a",       "label": "Frasa A",       "order": 1 },
{ "segment_id": "seg_frasa_b",       "label": "Frasa B",       "order": 2 },
{ "segment_id": "seg_frasa_a_ulang", "label": "Frasa A (Ulang)", "order": 3 }
```
Even if Frasa A and Frasa A (Ulang) cover the same bars (identical repetition), give them separate segment entries with distinct `segment_id`s — they represent distinct learning moments.

**Override for difficulty-based ordering (advanced songs):**
Some teachers prefer to have students learn the easiest phrase first, regardless of its position in the song. This is valid — set `order` to reflect the intended learning sequence rather than musical order.

---

## §7 — What NOT to Automate

The generator scaffolds bar groups mechanically. These decisions require musical judgment:

| Decision | Why manual |
|----------|-----------|
| Where phrases actually end | Bar 4 of a 4-bar phrase might be a connective bar that belongs to the next phrase musically |
| `suggested_repeats` | Difficulty is not derivable from note count; requires listening |
| Whether a 2-bar passage deserves its own segment | Depends on how hard it is, not how long it is |
| Coda identification | A final bar is often a coda, but not always — musical context required |
| Da capo / repeat sign handling | In songs with repeats, the same bars play twice; author segments accordingly |

---

## §8 — Editorial Checklist

Before committing a song's `learning_segments` to the repository, verify:

- [ ] **Coverage**: Every bar in the song belongs to at least one segment (no gaps)
- [ ] **Continuity**: Each segment's `end_bar` = the next segment's `start_bar` (no gaps, no overlaps)
- [ ] **Start**: First segment starts at bar 1 (includes pickup if present)
- [ ] **End**: Last segment has `end_bar = last_bar_in_score + 1` (exclusive-end sentinel → plays to song end)
- [ ] **Labels**: Short, meaningful, in Indonesian — not "Frasa A" for everything if musical names are available
- [ ] **Repeats**: `suggested_repeats` reflects actual difficulty of each phrase (not just the generator default of 1)
- [ ] **Phrase boundaries**: Segment boundaries follow musical phrasing, not just mechanical bar counts
- [ ] **Order**: Segments display in the intended learning sequence
- [ ] **Validation**: `python tools/validate_song.py songs/my_song.json` exits 0 with no errors

---

## §9 — Example: Before/After Editorial Refinement

**Song:** `test_pickup_bhand.json` (9 bars total, bar 1 is pickup, 4/4 time, key of F)

### Auto-generated output (from `generate_segments.py --bars 4`)

```json
[
  { "segment_id": "seg_phrase_a", "label": "Frasa A", "start_bar": 1, "end_bar": 5, "suggested_repeats": 1, "order": 1 },
  { "segment_id": "seg_phrase_b", "label": "Frasa B", "start_bar": 5, "end_bar": 9, "suggested_repeats": 1, "order": 2 },
  { "segment_id": "seg_phrase_c", "label": "Frasa C", "start_bar": 9, "end_bar": 10, "suggested_repeats": 1, "order": 3 }
]
```

**Observations:**
- Frasa A (bars 1–4): 4-bar opening phrase with pickup. Rhythmically active → should repeat twice.
- Frasa B (bars 5–8): 4-bar continuation. Some complexity → repeat twice.
- Frasa C (bar 9): Single-bar closing cadence. "Koda" is a more meaningful label.

### After editorial refinement (shipped to songs/)

```json
[
  {
    "segment_id": "seg_phrase_a",
    "label": "Frasa A",
    "start_bar": 1, "start_beat": 1,
    "end_bar": 5,  "end_beat": 1,
    "suggested_repeats": 2,
    "order": 1
  },
  {
    "segment_id": "seg_phrase_b",
    "label": "Frasa B",
    "start_bar": 5, "start_beat": 1,
    "end_bar": 9,  "end_beat": 1,
    "suggested_repeats": 2,
    "order": 2
  },
  {
    "segment_id": "seg_koda",
    "label": "Koda",
    "start_bar": 9, "start_beat": 1,
    "end_bar": 10, "end_beat": 1,
    "suggested_repeats": 1,
    "order": 3
  }
]
```

**What changed:**
- `suggested_repeats` raised to 2 for Frasa A and Frasa B
- `seg_phrase_c` → `seg_koda`, label "Frasa C" → "Koda" (musically descriptive)
- `start_beat` and `end_beat` made explicit (were implied as 1 in the scaffold)

**Checklist verification for this song:**
- [x] Coverage: bars 1–9 all covered (1–4 in A, 5–8 in B, 9 in Koda)
- [x] Continuity: end_bar of A (5) = start_bar of B (5); end_bar of B (9) = start_bar of Koda (9)
- [x] Start: bar 1 included (pickup handled)
- [x] End: Koda end_bar = 10 = last_bar(9) + 1
- [x] Labels: Indonesian, meaningful
- [x] Repeats: 2/2/1 reflecting difficulty
- [x] Validation: passes `validate_song.py` with 0 errors

---

*Companion documents: `docs/authoring-workflow.md`, `docs/learning-segment-architecture.md`*
