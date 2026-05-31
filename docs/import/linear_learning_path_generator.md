# Linear Learning Path Generator — Architecture Specification

**Status:** Design Only — No code changes  
**Scope:** Import pipeline. Does not modify runtime, renderer, or song.json schema for existing fields.  
**Source of truth for:** `mxl_to_song.py` linearization logic and all future segment-generation work.

---

## 1. Philosophy

### Three Distinct Structures

Music notation encodes three conceptually different things. MyKey keeps them separated by design.

**Original Score Structure**
What the composer notated. Contains repeat barlines, voltas, segno signs, coda sections, Fine markers, D.C. and D.S. directives. This is a *compact encoding* for human performers who can read and follow navigation instructions in real time. It is not a machine-executable sequence.

**Learning Path Structure**
The result of fully unfolding the Original Score into a linear sequence of bars. Every bar the student is expected to play — in order, with no jumps — is listed explicitly. A bar that occurs twice in a performance appears twice in the learning path. This is the structure MyKey's importer must produce.

**Runtime Structure**
The timing-indexed event sequence the RuntimeEngine executes for synchronized playback and scoring. It is derived from the Learning Path. It has no knowledge of navigation symbols and requires no jump logic.

### Why MyKey Intentionally Separates Them

**Navigation symbols are reading aids, not execution instructions.**  
A student preparing *Für Elise* needs to know what D.C. means — it is part of musical literacy. But the practice session must not require the student to navigate the score themselves. MyKey handles the navigation once, at import time, and stores the result as a flat sequence.

**The runtime must be deterministic and indexable.**  
The RuntimeEngine uses millisecond timestamps to drive highlighting, scoring, and scrolling. A jump-based playback model makes timestamp pre-computation impossible without simulating the entire playback graph. A linear model reduces the runtime to a simple ordered event stream.

**Examinations often skip written repeats.**  
Students preparing for graded examinations (ABRSM, Trinity, RCM) are typically assessed on one pass through the piece, without repeats. The Learning Path Generator's default expansion behavior is designed to match this convention. See §8 (Exam Mode Philosophy).

**Notation display is read from the original, not the expansion.**  
The `score.bars` array in `song.json` always reflects the original score structure with all notation symbols intact. The renderer reads from this. The runtime reads from the learning path. The two are never confused.

---

## 2. Song.json Schema Extensions

The Learning Path Generator adds two top-level objects to `song.json`:

```json
{
  "meta": { ... },
  "score": {
    "bars": [ ... ]          // ORIGINAL bars — unchanged, used by renderer
  },
  "learning_path": {         // NEW — produced by generator
    "expansion_policy": "full",
    "bars": [ ... ]          // ordered expansion, each entry references an original bar
  },
  "parts": [ ... ]           // UPDATED — bars[] now references lp_bar numbers
}
```

### `learning_path.bars` entry schema

Each entry represents one bar in the linear playback sequence:

```json
{
  "lp_bar":       1,          // position in learning path (1-indexed, contiguous)
  "original_bar": 3,          // which bar in score.bars to read events from
  "pass":         2,          // which pass through this original bar (1 = first, 2 = second, ...)
  "section":      "main"      // semantic tag: "main" | "volta_1" | "volta_2" | "coda" | "dc_repeat" | "ds_repeat"
}
```

### `learning_path.expansion_policy`

| Value | Meaning |
|---|---|
| `"full"` | All repeats expanded. Default. |
| `"none"` | No expansion. Learning path = original bar order. Reserved for future exam mode. |

---

## 3. Repeat Expansion Rules

### 3.1 Terminology

- **repeat_start** (`bar.repeat_start: true`): Forward repeat barline. Marks the beginning of a repeated section. If absent for a given `repeat_end`, the section repeats from bar 1.
- **repeat_end** (`bar.repeat_end: true`): Backward repeat barline. Marks the end of a repeated section. The section bounded by the nearest preceding `repeat_start` (or bar 1) is played twice.

### 3.2 Expansion Algorithm

```
For each repeat_end encountered (scanning left to right):
  1. Find the nearest preceding repeat_start, or default to bar 1.
  2. Append lp entries for bars [repeat_start … repeat_end], pass=1.
  3. Append lp entries for bars [repeat_start … repeat_end], pass=2.
  4. Continue with bars after repeat_end.
```

Bars outside any repeat region are appended once with pass=1.

### 3.3 Simple Repeat — Example

**Original score (4 bars):**

```
[1] [2: repeat_start] [3] [4: repeat_end]
```

**Expanded learning path:**

| lp_bar | original_bar | pass | section |
|--------|-------------|------|---------|
| 1      | 1           | 1    | main    |
| 2      | 2           | 1    | main    |
| 3      | 3           | 1    | main    |
| 4      | 4           | 1    | main    |
| 5      | 2           | 2    | main    |
| 6      | 3           | 2    | main    |
| 7      | 4           | 2    | main    |

**Rationale:** The student plays bars 1–4, then replays bars 2–4. Bar 1 (before the forward repeat sign) is not repeated.

### 3.4 Repeat from Beginning — Example

When `repeat_end` has no preceding `repeat_start`, the entire preceding material is the repeated section:

**Original:**

```
[1] [2] [3] [4: repeat_end] [5]
```

**Expanded:**

| lp_bar | original_bar | pass | section |
|--------|-------------|------|---------|
| 1      | 1           | 1    | main    |
| 2      | 2           | 1    | main    |
| 3      | 3           | 1    | main    |
| 4      | 4           | 1    | main    |
| 5      | 1           | 2    | main    |
| 6      | 2           | 2    | main    |
| 7      | 3           | 2    | main    |
| 8      | 4           | 2    | main    |
| 9      | 5           | 1    | main    |

### 3.5 Multiple Repeat Sections

Multiple independent repeat sections in the same piece are each expanded independently, left to right.

**Original:**

```
[1] [2: repeat_start] [3] [4: repeat_end] [5: repeat_start] [6] [7: repeat_end] [8]
```

**Expanded:**

```
1 → 2 → 3 → 4 → 2' → 3' → 4' → 5 → 6 → 7 → 5' → 6' → 7' → 8
```

---

## 4. Volta Handling

### 4.1 Terminology

- **volta** (`bar.volta: 1` or `bar.volta: 2`): A first or second ending bracket. A bar tagged `volta: 1` is played only on the first pass through the repeat. A bar tagged `volta: 2` is played only on the second pass.
- Multiple values (`bar.volta: [1, 2]`): Rare. The bar belongs to both endings (e.g., a shared pickup bar).

### 4.2 Expansion Algorithm

When volta brackets are present within a repeat section:

```
Pass 1: include volta_1 bars, skip volta_2 bars.
Pass 2: skip volta_1 bars, include volta_2 bars.
```

The `repeat_end` barline is typically on the last bar of `volta_1`. `volta_2` continues past the repeat without a backward barline.

### 4.3 Single Repeat + Two Voltas — Example

**Original:**

```
[1] [2: repeat_start] [3] [4: volta_1, repeat_end] [5: volta_2] [6]
```

**Pass 1:** bars 1, 2, 3, 4 (volta_1)  
**Repeat jump back to bar 2**  
**Pass 2:** bars 2, 3 (skipping volta_1), 5 (volta_2), 6

**Expanded learning path:**

| lp_bar | original_bar | pass | section  |
|--------|-------------|------|----------|
| 1      | 1           | 1    | main     |
| 2      | 2           | 1    | main     |
| 3      | 3           | 1    | main     |
| 4      | 4           | 1    | volta_1  |
| 5      | 2           | 2    | main     |
| 6      | 3           | 2    | main     |
| 7      | 5           | 2    | volta_2  |
| 8      | 6           | 1    | main     |

**Rationale:** The student plays the first ending on the first pass, and the second ending on the second pass. This is standard performance practice.

### 4.4 Three or More Endings

For `volta: 3` (third ending), expand identically: include on pass 3, skip on passes 1 and 2. This requires a third pass through the repeat section. In practice, triple or quadruple endings are rare in the target repertoire (Early Beginner through Advanced piano) and will be handled by the same general algorithm.

If the importer encounters a volta number greater than 2 and cannot resolve the structure, it logs a warning and falls back to treating the section as unrepeated (expansion_policy: "none" for that section only).

---

## 5. D.C. Handling

### 5.1 D.C. (Da Capo — back to the beginning, play to end)

When a bar has `navigation: "D.C."`, the entire piece from bar 1 to the end is appended after the D.C. bar.

The appended material is a complete copy of the original expansion (including any repeat expansion within that copy). Section tag: `dc_repeat`.

**Original:**

```
[1] [2] [3] [4] [5: D.C.]
```

**Expanded:**

| lp_bar | original_bar | pass | section   |
|--------|-------------|------|-----------|
| 1–5    | 1–5         | 1    | main      |
| 6      | 1           | 2    | dc_repeat |
| 7      | 2           | 2    | dc_repeat |
| 8      | 3           | 2    | dc_repeat |
| 9      | 4           | 2    | dc_repeat |
| 10     | 5           | 2    | dc_repeat |

**Rationale:** The repeated material from D.C. becomes additional bars the student must play. The section tag `dc_repeat` identifies these bars for analytics and debugging.

### 5.2 D.C. al Fine (back to beginning, stop at Fine)

When a bar has `navigation: "D.C. al Fine"`, the piece jumps back to bar 1 and plays until the bar tagged `navigation: "Fine"`. The Fine bar is included; no bars after Fine are appended.

**Original:**

```
[1] [2] [3: Fine] [4] [5] [6: D.C. al Fine]
```

**Expanded:**

| lp_bar | original_bar | pass | section   |
|--------|-------------|------|-----------|
| 1–6    | 1–6         | 1    | main      |
| 7      | 1           | 2    | dc_repeat |
| 8      | 2           | 2    | dc_repeat |
| 9      | 3           | 2    | dc_repeat |

Fine at original_bar 3 terminates the D.C. expansion. Original_bars 4–6 are not appended a second time.

**Important:** The Fine bar itself is included in the expansion (lp_bar 9 above). The student plays up to and including the Fine bar.

---

## 6. D.S. Handling

### 6.1 D.S. (Dal Segno — back to the Segno sign, play to end)

When a bar has `navigation: "D.S."`, the section from the `segno: true` bar onward (to the end of the piece) is appended.

**Original:**

```
[1] [2: segno] [3] [4] [5: D.S.] [6]
```

**Expanded:**

| lp_bar | original_bar | pass | section   |
|--------|-------------|------|-----------|
| 1–6    | 1–6         | 1    | main      |
| 7      | 2           | 2    | ds_repeat |
| 8      | 3           | 2    | ds_repeat |
| 9      | 4           | 2    | ds_repeat |
| 10     | 5           | 2    | ds_repeat |
| 11     | 6           | 2    | ds_repeat |

Material before the Segno (bar 1) is not repeated. The D.S. expansion begins at the Segno bar.

### 6.2 D.S. al Coda (back to Segno, jump to Coda at "To Coda" marker)

This is the most complex structure. The sequence on the second pass diverges at a "to_coda" marker and jumps to the Coda section.

Terminology:
- `segno: true` — the return target
- `navigation: "to_coda"` — where the second pass leaves the main body and jumps to the Coda (if present in the source MusicXML; not currently emitted by importer — see §11)
- `coda: true` — the first bar of the Coda section
- `navigation: "D.S. al Coda"` — the jump instruction

**Original:**

```
[1: segno] [2] [3: to_coda] [4] [5] [6: D.S. al Coda] ‖ [7: coda] [8] [9]
```

*(The double bar `‖` separates the Coda section from the main body in the original score.)*

**Expansion:**

Pass 1 (straight through):  lp_bars 1–6 → original_bars 1–6

D.S. jump → back to original_bar 1 (segno)

Pass 2 (until to_coda):  
- Play original_bars 1, 2, 3 (stop at to_coda, do not play 3's continuation)
- Jump to coda (original_bar 7)

Continue coda: original_bars 7, 8, 9

**Expanded learning path:**

| lp_bar | original_bar | pass | section   |
|--------|-------------|------|-----------|
| 1      | 1           | 1    | main      |
| 2      | 2           | 1    | main      |
| 3      | 3           | 1    | main      |
| 4      | 4           | 1    | main      |
| 5      | 5           | 1    | main      |
| 6      | 6           | 1    | main      |
| 7      | 1           | 2    | ds_repeat |
| 8      | 2           | 2    | ds_repeat |
| 9      | 3           | 2    | ds_repeat |
| 10     | 7           | 1    | coda      |
| 11     | 8           | 1    | coda      |
| 12     | 9           | 1    | coda      |

**Note on `to_coda`:** MusicXML encodes the "To Coda" marker explicitly. The importer must detect this marker and emit it as a bar field (e.g., `navigation: "to_coda"`). The generator uses the to_coda bar as the cutoff point for the D.S. second pass. If no to_coda marker is found but D.S. al Coda is present, the generator should log a warning and treat the structure as plain D.S. (no coda jump).

---

## 7. Fine Handling

### Role of Fine in the Expanded Path

`navigation: "Fine"` has no effect on the straight first-pass playback. It is consumed exclusively during D.C. al Fine expansion (§5.2) as the termination point for the appended repeat material.

| Context | Fine's role |
|---|---|
| First-pass playback | None. Bar plays normally. |
| D.C. al Fine expansion | Terminates the dc_repeat section. Last bar included in expansion. |
| Notation renderer | Displays "Fine" text above the barline (learning aid). |
| Runtime | Ignored entirely. |
| Segment generator | The bar that was Fine in the original may end a segment boundary (optional, see §9). |

Fine is preserved on `score.bars[n].navigation` for notation display. It does not appear in `learning_path.bars` entries (the bars simply terminate there).

---

## 8. Coda Handling

### Roles of Coda

`coda: true` marks the first bar of a Coda section in the original score. It has three distinct roles:

| Role | Description |
|---|---|
| Notation-only | The Coda sign (⊕) is displayed by the renderer above this bar as a musical literacy aid. |
| Metadata | Identifies which original bars belong to the Coda section for debugging and analytics. |
| Learning-path | In D.S. al Coda structures, the Coda section is the destination of the second-pass coda jump. It is appended at the end of the learning path with `section: "coda"`. |

The Coda section's bars are always last in the learning path when present. They are appended once (pass=1) regardless of how many times D.S. al Coda jumps occur.

---

## 9. Exam Mode Philosophy

### The Examination Performance Convention

Students preparing for practical graded examinations (ABRSM, Trinity, RCM, AMEB) are typically required to perform pieces **without repeats**. The examiner expects one linear pass through the printed score. Written repeat signs are present in the sheet music the student practices from, but the performance omits them.

This is not an edge case — it is standard practice across all major examination boards for levels equivalent to MyKey's target range (Early Beginner through Advanced).

### How This Shapes the Generator Design

**Default behavior (`expansion_policy: "full"`):**  
Repeats are fully expanded for practice. The student hears and plays the full musical structure with repetitions. This is optimal for learning — repetition is the core of effective practice.

**Optional future behavior (`expansion_policy: "none"`):**  
No expansion. The learning path equals the original bar sequence in order. D.C./D.S. navigation is dropped. This mode allows exam-context practice where the student plays straight through.

The generator **must accept an `expansion_policy` parameter** even in its initial implementation, defaulting to `"full"`. The `"none"` policy need not be implemented immediately but must be architecturally accommodated so it can be enabled without restructuring the pipeline.

The `expansion_policy` value is stored in `learning_path.expansion_policy` in the output `song.json` so any tool reading the file can determine how it was generated.

### What Is Not Supported

MyKey does not implement selective expansion (e.g., "expand the first repeat but not the D.C."). The policy applies to the entire piece. If finer control is needed in a future version, it becomes a separate feature with a separate design document.

---

## 10. Segment Generation Strategy

### Purpose

Segments (`parts` in `song.json`) define the sub-sections a student can navigate to and practice independently. The segment generator runs after linearization and partitions the `learning_path.bars` sequence into named groups.

### Input

`learning_path.bars` — the fully expanded, ordered list of lp_bar entries.

### Output

`parts[]` — each part contains an ordered list of `lp_bar` numbers.

```json
{
  "part_id": "part_1",
  "label": "Bars 1–4",
  "bars": [1, 2, 3, 4],
  "has_pickup": false,
  "example_audio": null
}
```

Note: `parts[].bars` now refers to **lp_bar numbers**, not original_bar numbers. This is a breaking change from the pre-generator schema. Tools reading `parts` must follow lp_bar references to `learning_path.bars` to find event data.

### Segmentation Rules

**Rule 1 — Respect `meta.part_size_bars`.**  
The default segment size in bars is stored in `meta.part_size_bars` (currently typically 4). Segments should not exceed this size without a structural reason.

**Rule 2 — Never split across section boundaries.**  
A segment must not span two different `section` tags. Bars with `section: "main"` and bars with `section: "dc_repeat"` belong in separate segments. Similarly, `coda` bars form their own final segment.

**Rule 3 — Never split across pass boundaries within a section.**  
Pass 1 and Pass 2 of the same repeated material are separate segments. A student should be able to practice "just the first time through" or "just the repeated section" independently.

**Rule 4 — Pickup bars are not standalone segments.**  
If a bar is tagged `has_pickup` (typically bar 0 or a bar with fewer beats than the time signature), it is joined to the following segment, not its own.

**Rule 5 — Prefer phrase-complete boundaries.**  
Where musical phrasing data is available (from MusicXML phrase marks or explicit marking), the generator should prefer segment cuts at phrase ends rather than mid-phrase.

### Segment Labels

Labels should be human-readable and informative. Preferred format:

| Condition | Label format |
|---|---|
| Main, pass 1, bars 1–4 | `"Bars 1–4"` |
| Main, pass 2 (repeat), bars 2–4 | `"Bars 2–4 (repeat)"` |
| D.C. repeat material | `"Bars 1–4 (D.C.)"` |
| D.S. repeat material | `"Bars 1–3 (D.S.)"` |
| Coda section | `"Coda"` |
| First volta | `"Bar 4 — Ending 1"` |
| Second volta | `"Bar 5 — Ending 2"` |

---

## 11. Original Bar Mapping

### Why Mapping Is Needed

The Learning Path expands original bars into multiple lp_bar positions. Tools that need to correlate the two (debugging, notation display, future analytics) must be able to look up:

- Given an lp_bar number: which original_bar does it correspond to?
- Given an original_bar number: which lp_bars reference it?

This is fully answered by `learning_path.bars` since each entry carries `original_bar` and `lp_bar`.

### Forward Map: lp_bar → original_bar

Trivial: `learning_path.bars[lp_bar - 1].original_bar`

### Reverse Map: original_bar → lp_bars

Requires scanning `learning_path.bars`. A convenience index could be added at build time:

```json
"learning_path": {
  "expansion_policy": "full",
  "bars": [ ... ],
  "original_bar_index": {
    "1": [1, 5, 7],
    "2": [2, 6],
    ...
  }
}
```

The `original_bar_index` is optional but recommended for performance.

### Example Mapping Table — Repeat + Volta

Original score (5 bars): `[1] [2: repeat_start] [3] [4: volta_1, repeat_end] [5: volta_2]`

| lp_bar | original_bar | pass | section |
|--------|-------------|------|---------|
| 1      | 1           | 1    | main    |
| 2      | 2           | 1    | main    |
| 3      | 3           | 1    | main    |
| 4      | 4           | 1    | volta_1 |
| 5      | 2           | 2    | main    |
| 6      | 3           | 2    | main    |
| 7      | 5           | 2    | volta_2 |

Reverse index: `original_bar 2 → lp_bars [2, 5]`, `original_bar 3 → lp_bars [3, 6]`

### Use in Notation Display

When the renderer highlights a bar during playback, it receives an lp_bar signal from the runtime. It must convert to original_bar to know which `<g>` SVG element to color. This lookup is O(1) via `learning_path.bars[lp_bar - 1].original_bar`.

---

## 12. Metadata Preservation

All original navigation markers are preserved in `score.bars` and remain available to any consumer that needs the original score structure. The Learning Path Generator does not delete or modify these fields.

### Fields Preserved Per Original Bar

| Field | Type | Preserved in | Consumer |
|---|---|---|---|
| `repeat_start` | boolean | `score.bars[n]` | Renderer (draws forward repeat barline) |
| `repeat_end` | boolean | `score.bars[n]` | Renderer (draws backward repeat barline) |
| `volta` | number or null | `score.bars[n]` | Renderer (draws volta bracket) |
| `segno` | boolean | `score.bars[n]` | Renderer (draws § sign) |
| `coda` | boolean | `score.bars[n]` | Renderer (draws ⊕ sign) |
| `navigation` | string or null | `score.bars[n]` | Renderer (displays Fine, D.C., D.S., etc.) |

### Fields NOT Present in Learning Path Bars

`learning_path.bars` entries carry only structural data: `lp_bar`, `original_bar`, `pass`, `section`. They do not duplicate event data or navigation fields. Event data is always read from `score.bars[original_bar]`.

### `to_coda` Field

MusicXML may contain a "To Coda" marker (a textual direction at the point where, on the second D.S. pass, the player jumps to the Coda). The current importer does not emit this field. Future importer work should add:

```json
{ "bar": 3, "navigation": "to_coda" }
```

The generator uses this field when expanding D.S. al Coda. Until it is emitted, D.S. al Coda expansion falls back to using the `coda: true` bar as the jump target, which may produce structurally imprecise but functional results for simple scores.

---

## 13. Worked Examples

### Example A — Simple Repeat

**Score:** 8 bars in C major, 4/4. Bars 3–6 are repeated.

```
[1] [2] [3: repeat_start] [4] [5] [6: repeat_end] [7] [8]
```

**Expanded learning path:**

| lp_bar | orig | pass | section |
|--------|------|------|---------|
| 1      | 1    | 1    | main    |
| 2      | 2    | 1    | main    |
| 3      | 3    | 1    | main    |
| 4      | 4    | 1    | main    |
| 5      | 5    | 1    | main    |
| 6      | 6    | 1    | main    |
| 7      | 3    | 2    | main    |
| 8      | 4    | 2    | main    |
| 9      | 5    | 2    | main    |
| 10     | 6    | 2    | main    |
| 11     | 7    | 1    | main    |
| 12     | 8    | 1    | main    |

**Segments (part_size_bars = 4):**

| part_id | lp_bars | label | notes |
|---------|---------|-------|-------|
| part_1  | 1–4     | Bars 1–4 | — |
| part_2  | 5–6     | Bars 5–6 | truncated — section boundary at 6 |
| part_3  | 7–10    | Bars 3–6 (repeat) | pass 2 group |
| part_4  | 11–12   | Bars 7–8 | — |

---

### Example B — Repeat + Volta (Two Endings)

**Score:** 8 bars in G major, 3/4.

```
[1] [2: repeat_start] [3] [4] [5: volta_1, repeat_end] [6: volta_2] [7] [8]
```

**Expanded learning path:**

| lp_bar | orig | pass | section |
|--------|------|------|---------|
| 1      | 1    | 1    | main    |
| 2      | 2    | 1    | main    |
| 3      | 3    | 1    | main    |
| 4      | 4    | 1    | main    |
| 5      | 5    | 1    | volta_1 |
| 6      | 2    | 2    | main    |
| 7      | 3    | 2    | main    |
| 8      | 4    | 2    | main    |
| 9      | 6    | 2    | volta_2 |
| 10     | 7    | 1    | main    |
| 11     | 8    | 1    | main    |

**Segments:**

| part_id | lp_bars | label |
|---------|---------|-------|
| part_1  | 1–4     | Bars 1–4 |
| part_2  | 5       | Bar 5 — Ending 1 |
| part_3  | 6–9     | Bars 2–6 (repeat) |
| part_4  | 10–11   | Bars 7–8 |

---

### Example C — D.C. al Fine

**Score:** 8 bars in F major, 4/4. Fine at bar 4, D.C. al Fine at bar 8.

```
[1] [2] [3] [4: Fine] [5] [6] [7] [8: D.C. al Fine]
```

**Expanded learning path:**

| lp_bar | orig | pass | section   |
|--------|------|------|-----------|
| 1      | 1    | 1    | main      |
| 2      | 2    | 1    | main      |
| 3      | 3    | 1    | main      |
| 4      | 4    | 1    | main      |
| 5      | 5    | 1    | main      |
| 6      | 6    | 1    | main      |
| 7      | 7    | 1    | main      |
| 8      | 8    | 1    | main      |
| 9      | 1    | 2    | dc_repeat |
| 10     | 2    | 2    | dc_repeat |
| 11     | 3    | 2    | dc_repeat |
| 12     | 4    | 2    | dc_repeat |

D.C. expansion stops at original_bar 4 (the Fine bar, included). Original_bars 5–8 are not repeated.

**Segments:**

| part_id | lp_bars | label |
|---------|---------|-------|
| part_1  | 1–4     | Bars 1–4 |
| part_2  | 5–8     | Bars 5–8 |
| part_3  | 9–12    | Bars 1–4 (D.C.) |

---

### Example D — D.S. al Coda

**Score:** 10 bars in D minor, 4/4.  
Bar 1: segno. Bar 3: to_coda. Bar 6: D.S. al Coda. Bar 7: coda.

```
[1: segno] [2] [3: to_coda] [4] [5] [6: D.S. al Coda] ‖ [7: coda] [8] [9] [10]
```

**Expanded learning path:**

| lp_bar | orig | pass | section   |
|--------|------|------|-----------|
| 1      | 1    | 1    | main      |
| 2      | 2    | 1    | main      |
| 3      | 3    | 1    | main      |
| 4      | 4    | 1    | main      |
| 5      | 5    | 1    | main      |
| 6      | 6    | 1    | main      |
| 7      | 1    | 2    | ds_repeat |
| 8      | 2    | 2    | ds_repeat |
| 9      | 3    | 2    | ds_repeat |
| 10     | 7    | 1    | coda      |
| 11     | 8    | 1    | coda      |
| 12     | 9    | 1    | coda      |
| 13     | 10   | 1    | coda      |

D.S. second pass: starts at segno (orig 1), runs through orig 2, stops at to_coda (orig 3, included), then jumps to coda (orig 7). Bars orig 4–6 are not played in the second pass.

**Segments:**

| part_id | lp_bars | label |
|---------|---------|-------|
| part_1  | 1–4     | Bars 1–4 |
| part_2  | 5–6     | Bars 5–6 |
| part_3  | 7–9     | Bars 1–3 (D.S.) |
| part_4  | 10–13   | Coda |

---

### Example E — Mixed Advanced Score

**Score:** 16 bars in A major, 4/4.  
- Bars 1–8: main section with repeat (bars 3–8)  
- Bar 8 has volta_1 (repeat_end), bar 9 has volta_2  
- Bar 12: segno  
- Bar 14: to_coda  
- Bar 16: D.S. al Coda  
- Bars 17–18: coda

```
[1] [2] [3: repeat_start] [4] [5] [6] [7] [8: volta_1, repeat_end]
[9: volta_2] [10] [11] [12: segno] [13] [14: to_coda] [15] [16: D.S. al Coda]
‖ [17: coda] [18]
```

**Expansion steps:**

1. Expand repeat bars 3–8 with volta:
   - Pass 1: 1, 2, 3, 4, 5, 6, 7, 8 (volta_1)
   - Pass 2: 3, 4, 5, 6, 7, 9 (volta_2), 10, 11, 12, 13, 14, 15, 16
2. Encounter D.S. al Coda at orig 16. Jump to segno (orig 12).
   - D.S. pass 2: 12, 13, 14 (stop at to_coda)
3. Append coda: 17, 18.

**Expanded learning path:**

| lp_bar | orig | pass | section   |
|--------|------|------|-----------|
| 1      | 1    | 1    | main      |
| 2      | 2    | 1    | main      |
| 3      | 3    | 1    | main      |
| 4      | 4    | 1    | main      |
| 5      | 5    | 1    | main      |
| 6      | 6    | 1    | main      |
| 7      | 7    | 1    | main      |
| 8      | 8    | 1    | volta_1   |
| 9      | 3    | 2    | main      |
| 10     | 4    | 2    | main      |
| 11     | 5    | 2    | main      |
| 12     | 6    | 2    | main      |
| 13     | 7    | 2    | main      |
| 14     | 9    | 2    | volta_2   |
| 15     | 10   | 2    | main      |
| 16     | 11   | 2    | main      |
| 17     | 12   | 2    | main      |
| 18     | 13   | 2    | main      |
| 19     | 14   | 2    | main      |
| 20     | 15   | 2    | main      |
| 21     | 16   | 2    | main      |
| 22     | 12   | 3    | ds_repeat |
| 23     | 13   | 3    | ds_repeat |
| 24     | 14   | 3    | ds_repeat |
| 25     | 17   | 1    | coda      |
| 26     | 18   | 1    | coda      |

**Segments:**

| part_id | lp_bars | label |
|---------|---------|-------|
| part_1  | 1–4     | Bars 1–4 |
| part_2  | 5–8     | Bars 5–8 (with Ending 1) |
| part_3  | 9–12    | Bars 3–6 (repeat) |
| part_4  | 13–14   | Bars 7–9 (repeat, with Ending 2) |
| part_5  | 15–18   | Bars 10–13 |
| part_6  | 19–21   | Bars 14–16 |
| part_7  | 22–24   | Bars 12–14 (D.S.) |
| part_8  | 25–26   | Coda |

---

## 14. Error Handling and Fallback Policy

### Unresolvable Structures

If the importer encounters a navigation structure it cannot deterministically expand (nested repeats, D.S. without a Segno, D.C. al Fine without a Fine marker, etc.), it must:

1. Log a structured warning: `[LLG_WARN] <song_id> unresolvable: <description>`
2. Skip expansion for the affected section only
3. Set `learning_path.expansion_policy` to `"partial"` in the output
4. Continue expanding the rest of the piece

A `"partial"` policy signals downstream tools that the learning path may not fully represent the original score's navigation structure.

### Infinite Loop Guard

Any navigation structure that could theoretically produce infinite repetition (e.g., D.C. without Fine on a piece that itself contains D.C.) must be detected and broken after one expansion pass. The generator applies a maximum expansion depth of `original_bar_count × 4`. Exceeding this limit triggers the fallback policy above.

---

## Appendix: Field Name Quick Reference

| song.json field | Location | Set by | Used by |
|---|---|---|---|
| `score.bars[n].repeat_start` | original bar | importer | renderer, generator |
| `score.bars[n].repeat_end` | original bar | importer | renderer, generator |
| `score.bars[n].volta` | original bar | importer | renderer, generator |
| `score.bars[n].segno` | original bar | importer | renderer, generator |
| `score.bars[n].coda` | original bar | importer | renderer, generator |
| `score.bars[n].navigation` | original bar | importer | renderer, generator |
| `learning_path.expansion_policy` | top level | generator | runtime, debug tools |
| `learning_path.bars[n].lp_bar` | learning path | generator | runtime, segment gen |
| `learning_path.bars[n].original_bar` | learning path | generator | runtime, renderer |
| `learning_path.bars[n].pass` | learning path | generator | debug, analytics |
| `learning_path.bars[n].section` | learning path | generator | segment gen, analytics |
| `learning_path.original_bar_index` | top level | generator (optional) | tooling |
| `parts[n].bars` | top level | segment generator | runtime navigation |
| `meta.part_size_bars` | meta | importer | segment generator |
