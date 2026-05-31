# Implementation Notes — Sprint 2A: D.C. Family Expansion

**Date:** 2026-05-31
**Scope:** D.C. and D.C. al Fine expansion. Repeat + volta behavior unchanged.
**Reference:** [`linear_learning_path_generator.md`](linear_learning_path_generator.md)

---

## Code Changes

### Modified files

| File | Change |
|---|---|
| `tools/linear_learning_path_generator.py` | Added `_find_dc_structure()`. Added D.C. expansion block in `generate_learning_path()`. Updated module docstring. |

### New files

| File | Purpose |
|---|---|
| `songs/test_dc_linearization.json` | Test fixture — 5 bars with D.C. at bar 5 |
| `songs/test_dc_al_fine_linearization.json` | Test fixture — 8 bars with Fine at bar 4, D.C. al Fine at bar 8 |

---

## Schema

Two navigation values on `score.bars[n].navigation`:

| Value | Meaning |
|---|---|
| `"D.C."` | Da Capo — jump to bar 1, play to end |
| `"D.C. al Fine"` | Da Capo al Fine — jump to bar 1, play to Fine bar (inclusive) |
| `"Fine"` | Terminal marker consumed by D.C. al Fine |

`score.bars` is never modified. All three values are preserved on the original bar for the renderer.

---

## Algorithm

**`_find_dc_structure(bars)`**
Scans bars left-to-right. Returns `(dc_idx, dc_type, fine_idx)`.
- `dc_idx` — 0-based index of first D.C. or D.C. al Fine bar (or None)
- `dc_type` — `'dc'` or `'dc_al_fine'` (or None)
- `fine_idx` — 0-based index of Fine bar (or None)

Only the first D.C. / D.C. al Fine is used.

**D.C. expansion block in `generate_learning_path()`**
Runs after the full first-pass expansion (repeat + volta).

1. Determine `dc_end_idx`:
   - Plain D.C.: `len(bars) - 1` (end of score, D.C. bar included)
   - D.C. al Fine: `fine_idx` (Fine bar inclusive)
   - D.C. al Fine without Fine: warns to stderr, falls back to plain D.C.
2. Build `pass_used` map: highest pass already assigned to each `original_bar` number.
3. Re-emit original bars `[0 → dc_end_idx]` as `section='dc_repeat'` with `pass = pass_used[ob] + 1`.

---

## Before / After — D.C.

### Input — `score.bars`

```
bar 1  — C4 D4 E4 F4
bar 2  — G4 A4 B4 C5
bar 3  — D5 E5 F5 E5
bar 4  — D5 C5 B4 A4
bar 5  — G4 F4 E4 C4   navigation: "D.C."
```

### Output — `learning_path.bars`

```
lp_bar  orig  pass  section
      1     1     1  main
      2     2     1  main
      3     3     1  main
      4     4     1  main
      5     5     1  main    ← D.C. bar played normally first time
      6     1     2  dc_repeat
      7     2     2  dc_repeat
      8     3     2  dc_repeat
      9     4     2  dc_repeat
     10     5     2  dc_repeat  ← D.C. bar played again; no further jump
```

### Output — `original_bar_index`

```json
{
  "1": [1, 6],
  "2": [2, 7],
  "3": [3, 8],
  "4": [4, 9],
  "5": [5, 10]
}
```

---

## Before / After — D.C. al Fine

### Input — `score.bars`

```
bar 1  — C4 D4 E4 F4
bar 2  — G4 A4 B4 C5
bar 3  — D5 E5 F5 G5
bar 4  — E5 D5 C5 B4   navigation: "Fine"
bar 5  — A4 G4 F4 E4
bar 6  — D4 C4 B3 C4
bar 7  — D4 E4 F4 G4
bar 8  — A4 B4 C5 D5   navigation: "D.C. al Fine"
```

### Output — `learning_path.bars`

```
lp_bar  orig  pass  section
      1     1     1  main
      2     2     1  main
      3     3     1  main
      4     4     1  main    ← Fine bar played normally first time
      5     5     1  main
      6     6     1  main
      7     7     1  main
      8     8     1  main    ← D.C. al Fine bar played
      9     1     2  dc_repeat
     10     2     2  dc_repeat
     11     3     2  dc_repeat
     12     4     2  dc_repeat  ← Fine bar: expansion stops here (inclusive)
```

### Output — `original_bar_index`

```json
{
  "1": [1, 9],
  "2": [2, 10],
  "3": [3, 11],
  "4": [4, 12],
  "5": [5],
  "6": [6],
  "7": [7],
  "8": [8]
}
```

Bars 5–8 (after Fine) appear only once. They are not part of the D.C. repetition.

---

## Regression Tests

Sprint 1A (`test_repeat_linearization.json`) and Sprint 1B (`test_volta_linearization.json`) produce identical output to their previous generated paths. `_find_dc_structure` returns `(None, None, None)` for both, so no D.C. block runs.

---

## Test Case Coverage

`songs/test_dc_linearization.json` exercises:

| Case | Location | Expected result |
|---|---|---|
| Bar before D.C. | bars 1–4 | Emitted once, pass 1, main |
| D.C. bar | bar 5 | Emitted pass 1 main; then again pass 2 dc_repeat |
| D.C. expansion start | lp_bar 6 | original_bar 1, pass 2 |
| D.C. expansion end | lp_bar 10 | original_bar 5 (D.C. bar included) |
| Reverse index | `original_bar_index` | All 5 bars map to 2 lp_bars each |
| `score.bars[4].navigation` | bar 5 | `"D.C."` preserved |

`songs/test_dc_al_fine_linearization.json` exercises:

| Case | Location | Expected result |
|---|---|---|
| Bars before Fine | bars 1–3 | Emitted once pass 1 main; and again in dc_repeat |
| Fine bar | bar 4 | Emitted pass 1 main; again as last dc_repeat bar |
| Bars after Fine | bars 5–8 | Emitted once only (pass 1 main) |
| D.C. al Fine bar | bar 8 | Emitted pass 1 main; NOT repeated |
| Expansion endpoint | lp_bar 12 | original_bar 4 (Fine inclusive) |
| `score.bars[3].navigation` | bar 4 | `"Fine"` preserved |
| `score.bars[7].navigation` | bar 8 | `"D.C. al Fine"` preserved |

---

## Known Limitations — Sprint 2A

| Limitation | Impact | Future sprint |
|---|---|---|
| **D.C. + repeat/volta interaction** | D.C. section re-emits original bars in score order only; inner repeat structure is not re-expanded within the dc_repeat section. Pass numbers are correct. | Sprint 2B |
| **D.S., D.S. al Coda, Segno, Coda** | Not processed. Songs with these structures get a learning path that ends at the D.S. bar. | Sprint 2B |
| **Multiple D.C. markers** | Only the first D.C. / D.C. al Fine bar is used. Second D.C. markers are ignored. | Sprint 2B |
| **`parts[].bars` still references `original_bar` numbers** | Segment navigation remains bound to original bars. | Sprint 1C |
| **`expansion_policy: "none"` not implemented** | Policy parameter stored but no-expansion path is not coded. | Future (exam mode sprint) |
