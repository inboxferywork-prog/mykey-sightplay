# Implementation Notes — Sprint 2B: D.S. Family Expansion

**Date:** 2026-05-31
**Scope:** D.S. and D.S. al Coda expansion. All prior behavior preserved.
**Reference:** [`linear_learning_path_generator.md`](linear_learning_path_generator.md)

---

## Code Changes

### Modified files

| File | Change |
|---|---|
| `tools/linear_learning_path_generator.py` | Added `_find_ds_structure()`. Added `main_end` computation. Changed main loop boundary from `len(bars)` to `main_end`. Added D.S. expansion block. Updated module docstring. |

### New files

| File | Purpose |
|---|---|
| `songs/test_ds_linearization.json` | Test fixture — 6 bars with Segno at bar 2, D.S. at bar 5 |
| `songs/test_ds_al_coda_linearization.json` | Test fixture — 9 bars with Segno bar 1, to_coda bar 3, D.S. al Coda bar 6, Coda bars 7–9 |

---

## Schema

Navigation and structural fields on `score.bars[n]`:

| Field | Value | Meaning |
|---|---|---|
| `bar.navigation` | `"D.S."` | Dal Segno — jump to Segno, play to end |
| `bar.navigation` | `"D.S. al Coda"` | Dal Segno al Coda — jump to Segno, divert at to_coda |
| `bar.navigation` | `"to_coda"` | Branch point: D.S. second pass stops here and jumps to Coda |
| `bar.segno` | `true` | Return target for D.S. jumps |
| `bar.coda` | `true` | First bar of the Coda section |

All fields are preserved on `score.bars` unchanged.

---

## Algorithm

**`_find_ds_structure(bars)`**
Scans bars left-to-right. Returns `(ds_idx, ds_type, segno_idx, to_coda_idx, coda_idx)`.

**`main_end` computation**
Before the main traversal loop, `main_end` is set to:
- `coda_idx` — when D.S. al Coda is present with both `to_coda_idx` and `coda_idx` found.
  Coda bars are excluded from the main (first) traversal.
- `len(bars)` — all other cases. Main traversal runs to the end of the score.

**D.S. expansion block** (runs after main traversal, before D.C. expansion):

1. If no Segno found: warn to stderr, skip D.S. expansion.
2. If D.S. al Coda but missing `to_coda` or `coda`: warn, fall back to plain D.S.
3. Build `pass_used` map from existing `lp_entries`.
4. **Plain D.S.:** re-emit bars `[segno_idx → main_end)` as `section='ds_repeat'`, `pass = pass_used[ob] + 1`.
5. **D.S. al Coda:**
   a. Re-emit bars `[segno_idx → to_coda_idx]` (inclusive) as `section='ds_repeat'`.
   b. Rebuild `pass_used` (now includes ds_repeat entries).
   c. Emit bars `[coda_idx → len(bars))` as `section='coda'`, `pass = pass_used[ob] + 1`.
   — Coda bars have `pass_used = 0` (never emitted before), so they always receive `pass = 1`.

---

## Before / After — D.S.

### Input — `score.bars`

```
bar 1  — C4 D4 E4 F4
bar 2  — G4 A4 B4 C5   segno: true
bar 3  — D5 E5 F5 E5
bar 4  — D5 C5 B4 A4
bar 5  — G4 F4 E4 D4   navigation: "D.S."
bar 6  — C4 D4 E4 F4
```

### Output — `learning_path.bars`

```
lp_bar  orig  pass  section
      1     1     1  main
      2     2     1  main     ← segno
      3     3     1  main
      4     4     1  main
      5     5     1  main     ← D.S. bar played normally
      6     6     1  main
      7     2     2  ds_repeat  ← D.S. jump back to segno
      8     3     2  ds_repeat
      9     4     2  ds_repeat
     10     5     2  ds_repeat  ← D.S. bar played again (no re-trigger)
     11     6     2  ds_repeat
```

6 original bars → 11 lp_bars (1.83×)

### `original_bar_index`

```json
{
  "1": [1],
  "2": [2, 7],
  "3": [3, 8],
  "4": [4, 9],
  "5": [5, 10],
  "6": [6, 11]
}
```

Bar 1 (before segno) appears once. Bars 2–6 (from segno onward) appear twice.

---

## Before / After — D.S. al Coda

### Input — `score.bars`

```
bar 1  — C4 D4 E4 F4   segno: true
bar 2  — G4 A4 B4 C5
bar 3  — D5 E5 F5 G5   navigation: "to_coda"
bar 4  — E5 D5 C5 B4
bar 5  — A4 G4 F4 E4
bar 6  — D4 C4 B3 A3   navigation: "D.S. al Coda"
bar 7  — C5 B4 A4 G4   coda: true
bar 8  — F4 E4 D4 C4
bar 9  — E4 D4 C4 B3
```

### Output — `learning_path.bars`

```
lp_bar  orig  pass  section
      1     1     1  main       ← segno bar
      2     2     1  main
      3     3     1  main       ← to_coda bar (played straight through first time)
      4     4     1  main
      5     5     1  main
      6     6     1  main       ← D.S. al Coda bar
      7     1     2  ds_repeat  ← D.S. jump to segno
      8     2     2  ds_repeat
      9     3     2  ds_repeat  ← to_coda reached: stop, jump to Coda
     10     7     1  coda       ← Coda section begins
     11     8     1  coda
     12     9     1  coda
```

9 original bars → 12 lp_bars (1.33×). Coda bars 7–9 are never in the main section.

### `original_bar_index`

```json
{
  "1": [1, 7],
  "2": [2, 8],
  "3": [3, 9],
  "4": [4],
  "5": [5],
  "6": [6],
  "7": [10],
  "8": [11],
  "9": [12]
}
```

Bars 4–6 (after to_coda, before coda) appear only in the main section. Coda bars appear once as `coda` section.

---

## Regression Tests

All four prior Sprint fixtures produce identical output under dry-run:

| Fixture | Expected bars | Sprint |
|---|---|---|
| `test_repeat_linearization.json` | 9 (6 orig) | 1A |
| `test_volta_linearization.json` | 9 (7 orig) | 1B |
| `test_dc_linearization.json` | 10 (5 orig) | 2A |
| `test_dc_al_fine_linearization.json` | 12 (8 orig) | 2A |

`_find_ds_structure` returns `(None, None, None, None, None)` for all four. `main_end = len(bars)`. No D.S. block runs.

---

## Test Case Coverage

`songs/test_ds_linearization.json`:

| Case | Location | Expected result |
|---|---|---|
| Bar before segno | bar 1 | Emitted once, pass 1, main |
| Segno bar | bar 2 | Emitted pass 1 main; again pass 2 ds_repeat |
| D.S. bar | bar 5 | Emitted pass 1 main; again pass 2 ds_repeat |
| Bar after D.S. in score | bar 6 | Emitted pass 1 main; again pass 2 ds_repeat |
| D.S. expansion start | lp_bar 7 | original_bar 2 (segno), pass 2 |
| D.S. expansion end | lp_bar 11 | original_bar 6, pass 2 |
| `score.bars[1].segno` | bar 2 | `true` preserved |
| `score.bars[4].navigation` | bar 5 | `"D.S."` preserved |

`songs/test_ds_al_coda_linearization.json`:

| Case | Location | Expected result |
|---|---|---|
| Segno bar | bar 1 | Emitted pass 1 main; again pass 2 ds_repeat |
| to_coda bar (first pass) | bar 3 | Emitted pass 1 main; again as last ds_repeat bar |
| D.S. al Coda bar | bar 6 | Emitted pass 1 main only; not in ds_repeat section |
| Coda bars | bars 7–9 | Not in main section; emitted as section='coda', pass=1 |
| D.S. repeat endpoint | lp_bar 9 | original_bar 3 (to_coda inclusive) |
| Coda start | lp_bar 10 | original_bar 7 (coda: true bar) |
| `score.bars[0].segno` | bar 1 | `true` preserved |
| `score.bars[2].navigation` | bar 3 | `"to_coda"` preserved |
| `score.bars[5].navigation` | bar 6 | `"D.S. al Coda"` preserved |
| `score.bars[6].coda` | bar 7 | `true` preserved |

---

## Assumptions About Current Schema

| Assumption | Rationale |
|---|---|
| `bar.segno: true` marks the D.S. return target | Consistent with design doc Appendix field table |
| `bar.coda: true` marks the first bar of the Coda section | Matches design doc §8; generator detects coda start by this field |
| `bar.navigation: "to_coda"` marks the D.S. second-pass branch point | Design doc §12 specifies this field; importer must emit it |
| Coda section extends from `coda_idx` to `len(bars) - 1` | No explicit end marker for Coda; it is always the final section |
| `to_coda` appears before `D.S. al Coda` in the score | Required for musical correctness; not validated by generator |

---

## Known Limitations — Sprint 2B

| Limitation | Impact | Future sprint |
|---|---|---|
| **D.S. + repeat/volta interaction** | D.S. section re-emits original bars in score order only; inner repeats not re-expanded within ds_repeat section | Sprint 3 |
| **D.S. al Fine** | Not implemented | Sprint 3 |
| **Coexistence of D.C. and D.S.** | Both blocks run independently; correct order not guaranteed if both present in same piece | Sprint 3 |
| **Multiple D.S. markers** | Only first D.S. / D.S. al Coda used | Sprint 3 |
| **`parts[].bars` still references `original_bar` numbers** | Segment navigation bound to original bars | Sprint 1C |
| **`expansion_policy: "none"` not implemented** | Reserved but not coded | Future (exam mode sprint) |
