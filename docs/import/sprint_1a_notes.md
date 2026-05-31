# Implementation Notes — Sprint 1A: Repeat Linearization

**Date:** 2026-05-31  
**Scope:** `repeat_start` / `repeat_end` expansion only.  
**Reference:** [`linear_learning_path_generator.md`](linear_learning_path_generator.md)

---

## Code Changes

### New files

| File | Purpose |
|---|---|
| `tools/linear_learning_path_generator.py` | Generator module and CLI tool |
| `songs/test_repeat_linearization.json` | Test fixture — 6 bars with one repeat section |

### Modified files

None. Runtime, renderer, importer, and segment generation are untouched.

---

## How to Run

```
python tools/linear_learning_path_generator.py songs/<song>.json
python tools/linear_learning_path_generator.py songs/<song>.json --dry-run
```

The tool adds (or overwrites) `learning_path` in the song file. `score.bars` is never modified.

---

## Before / After Example

### Input — `score.bars` (original, unchanged by generator)

```
bar 1  — no special fields          (before repeat section)
bar 2  — repeat_start: true         (forward repeat barline)
bar 3  — (no special fields)        (inside repeat section)
bar 4  — repeat_end: true           (backward repeat barline)
bar 5  — (no special fields)        (after repeat section)
bar 6  — (no special fields)        (final bar)
```

### Output — `learning_path.bars` (generated)

```
lp_bar  orig  pass  section
      1     1     1  main    ← bar 1 (before repeat, played once)
      2     2     1  main    ┐
      3     3     1  main    │ repeat section, first pass
      4     4     1  main    ┘
      5     2     2  main    ┐
      6     3     2  main    │ repeat section, second pass
      7     4     2  main    ┘
      8     5     1  main    ← bar 5 (after repeat, played once)
      9     6     1  main    ← bar 6 (final bar, played once)
```

### Output — `original_bar_index` (reverse lookup)

```json
{
  "1": [1],
  "2": [2, 5],
  "3": [3, 6],
  "4": [4, 7],
  "5": [8],
  "6": [9]
}
```

Bars 2, 3, 4 (the repeated section) map to two lp_bar positions each.
Bars outside the repeat map to one lp_bar each.

---

## Algorithm Summary

**`_find_repeat_regions(bars)`**  
Scans bars left-to-right. Tracks `last_forward_idx` (the index of the most recent `repeat_start`, defaulting to 0). On each `repeat_end`, appends `(last_forward_idx, current_idx)` as a region and resets `last_forward_idx` to `current_idx + 1`. Returns a list of `(start_idx, end_idx)` tuples.

**`generate_learning_path(song)`**  
Walks bars with a pointer `i`. If bar `i` belongs to an unprocessed region: emits the entire region twice (pass 1 then pass 2), marks the region as processed, advances `i` to `end_idx + 1`. Otherwise emits the bar once (pass 1) and advances `i` by 1.

---

## Test Case Coverage

`songs/test_repeat_linearization.json` exercises:

| Case | Location | Expected result |
|---|---|---|
| Bar before repeat section | bar 1 | Emitted once, pass 1 |
| Forward repeat barline | bar 2 (`repeat_start`) | Start of repeat region |
| Interior of repeat section | bar 3 | Emitted twice (pass 1 + pass 2) |
| Backward repeat barline | bar 4 (`repeat_end`) | End of repeat region; emitted twice |
| Bar after repeat section | bar 5 | Emitted once, pass 1 |
| Final bar | bar 6 | Emitted once, pass 1 |
| `score.bars` metadata intact | bars 2, 4 | `repeat_start`/`repeat_end` fields preserved |
| Reverse index | `original_bar_index` | Bars 2–4 map to two lp_bars each |

---

## Known Limitations — Sprint 1A

The following are **out of scope for this sprint** and will be addressed in future sprints:

| Limitation | Impact | Future sprint |
|---|---|---|
| **volta not handled** | A bar with `volta: 1` inside a repeat region is expanded as a plain bar on both passes. First/second ending logic is not applied. | Sprint 1B |
| **D.C., D.S., Fine, Coda, to_coda not processed** | Songs with these fields get a learning path that stops at the end of the score without appending any jump-back material. | Sprint 2 |
| **`parts[].bars` still references `original_bar` numbers** | The `parts` array is not re-indexed to `lp_bar` numbers. Runtime segment navigation remains bound to original bars until segment re-indexing is implemented. | Sprint 1C |
| **`expansion_policy: "none"` not implemented** | The policy parameter is stored and read but the no-expansion path is not coded. Calling with an existing `expansion_policy: "none"` will still expand. | Future (exam mode sprint) |
| **Nested repeats not detected** | MusicXML does not formally support nested repeats; music21 typically flattens them. If nested repeat regions are present in the bar list, the inner region's bars will be double-counted. An infinite-loop guard (design doc §14) is not yet implemented. | Sprint 1D |
| **No integration with `mxl_to_song.py`** | The generator is a standalone post-processing tool. It is not called automatically during MXL import. Integration into the import pipeline is a separate task. | Import integration sprint |

---

## Validation Checklist

Run against `songs/test_repeat_linearization.json`:

- [x] `learning_path.expansion_policy` = `"full"`
- [x] `learning_path.bars` length = 9 (6 original + 3 repeated)
- [x] Bar 1 appears once at lp_bar 1, pass 1
- [x] Bars 2–4 appear at lp_bars 2–4 (pass 1) and lp_bars 5–7 (pass 2)
- [x] Bars 5–6 appear once at lp_bars 8–9, pass 1
- [x] `score.bars[1].repeat_start` still `true` (original metadata preserved)
- [x] `score.bars[3].repeat_end` still `true` (original metadata preserved)
- [x] `original_bar_index["2"]` = `[2, 5]`
- [x] `original_bar_index["3"]` = `[3, 6]`
- [x] `original_bar_index["4"]` = `[4, 7]`
