# Implementation Notes — Sprint 3A: Segment Generation (lp_bar References)

**Date:** 2026-05-31
**Scope:** Segment model migration from original_bar to lp_bar references.
**Reference:** [`linear_learning_path_generator.md`](linear_learning_path_generator.md) §10

---

## Summary

`parts[].bars` now references **lp_bar numbers**, not original_bar numbers.

This is a breaking change to the `parts[]` schema. All song files must be regenerated through the learning path generator to obtain correct segments. The renderer and runtime must follow `lp_bar` references to locate event data via `learning_path.bars[lp_bar - 1].original_bar`.

---

## Code Changes

### Modified files

| File | Change |
|---|---|
| `tools/linear_learning_path_generator.py` | Added `_make_segment_label()` and `generate_segments()`. `generate_learning_path()` now calls `generate_segments()` before returning. CLI summary extended to show segment table. Module docstring updated. |

### No new files

All six existing test fixtures were regenerated in place. No new song files were created.

---

## New Functions

### `_make_segment_label(chunk, section, pass_n)`

Generates a human-readable label given a chunk of lp_entries and its context.

| section | pass | Example label |
|---|---|---|
| `main` | 1 | `"Bars 1–4"` |
| `main` | 2 | `"Bars 2–4 (repeat)"` |
| `main` | ≥3 | `"Bars 2–4 (repeat 3)"` |
| `volta_1` | 1 | `"Bar 4 — Ending 1"` |
| `volta_2` | 2 | `"Bar 5 — Ending 2"` |
| `dc_repeat` | 2 | `"Bars 1–4 (D.C.)"` |
| `ds_repeat` | 2 | `"Bars 1–3 (D.S.)"` |
| `coda` | 1 | `"Coda"` |

### `generate_segments(song)`

Partitions `learning_path.bars` into groups, then slices each group into chunks.

**Grouping rule:** A new group starts whenever `(section, pass)` changes from the previous bar. Groups are consecutive runs — "main/pass=1" bars before and after a repeat form two separate groups because a different `(section, pass)` run falls between them.

**Chunk rule:** Each group is sliced into chunks of at most `meta.part_size_bars` (default: 4). Each chunk becomes one `parts[]` entry.

**Output:** Replaces `song['parts']` with entries of the form:
```json
{
  "part_id": "part_N",
  "label": "Bars X–Y (D.C.)",
  "bars": [lp_bar_1, lp_bar_2, ...],
  "has_pickup": false,
  "example_audio": null
}
```
`bars` contains **lp_bar numbers**, not original_bar numbers.

---

## Schema Change

### Before (original_bar references — pre-Sprint 3A)

```json
"parts": [
  {
    "part_id": "part_1",
    "label": "Bars 1–4 (includes repeat bars 2–4)",
    "bars": [1, 2, 3, 4],
    "has_pickup": false,
    "example_audio": null
  },
  {
    "part_id": "part_2",
    "label": "Bars 5–6 (after repeat)",
    "bars": [5, 6],
    "has_pickup": false,
    "example_audio": null
  }
]
```

`bars` = original_bar numbers. Two segments. The repeat section is invisible to the segment model.

### After (lp_bar references — Sprint 3A)

```json
"parts": [
  {
    "part_id": "part_1",
    "label": "Bars 1–4",
    "bars": [1, 2, 3, 4],
    "has_pickup": false,
    "example_audio": null
  },
  {
    "part_id": "part_2",
    "label": "Bars 2–4 (repeat)",
    "bars": [5, 6, 7],
    "has_pickup": false,
    "example_audio": null
  },
  {
    "part_id": "part_3",
    "label": "Bars 5–6",
    "bars": [8, 9],
    "has_pickup": false,
    "example_audio": null
  }
]
```

`bars` = lp_bar numbers. Three segments. The repeat section (lp_bars 5–7) is now its own navigable segment with label "Bars 2–4 (repeat)".

---

## Migration Example

Any code that reads `parts[n].bars` and treats them as original_bar numbers must be updated:

```javascript
// BEFORE (original_bar reference — pre-Sprint 3A)
const part = song.parts[0];
const firstBar = song.score.bars.find(b => b.bar === part.bars[0]);

// AFTER (lp_bar reference — Sprint 3A)
const part = song.parts[0];
const lpEntry = song.learning_path.bars[part.bars[0] - 1];   // lp_bar is 1-indexed
const firstBar = song.score.bars.find(b => b.bar === lpEntry.original_bar);
```

The lp_bar → original_bar lookup is O(1): `song.learning_path.bars[lp_bar - 1].original_bar`.

---

## All Six Fixtures — Segment Output

### `test_repeat_linearization.json` (6 orig → 9 lp)

| part_id | lp_bars | label |
|---|---|---|
| part_1 | [1, 2, 3, 4] | Bars 1–4 |
| part_2 | [5, 6, 7] | Bars 2–4 (repeat) |
| part_3 | [8, 9] | Bars 5–6 |

### `test_volta_linearization.json` (7 orig → 9 lp)

| part_id | lp_bars | label |
|---|---|---|
| part_1 | [1, 2, 3] | Bars 1–3 |
| part_2 | [4] | Bar 4 — Ending 1 |
| part_3 | [5, 6] | Bars 2–3 (repeat) |
| part_4 | [7] | Bar 5 — Ending 2 |
| part_5 | [8, 9] | Bars 6–7 |

### `test_dc_linearization.json` (5 orig → 10 lp)

| part_id | lp_bars | label |
|---|---|---|
| part_1 | [1, 2, 3, 4] | Bars 1–4 |
| part_2 | [5] | Bar 5 |
| part_3 | [6, 7, 8, 9] | Bars 1–4 (D.C.) |
| part_4 | [10] | Bar 5 (D.C.) |

### `test_dc_al_fine_linearization.json` (8 orig → 12 lp)

| part_id | lp_bars | label |
|---|---|---|
| part_1 | [1, 2, 3, 4] | Bars 1–4 |
| part_2 | [5, 6, 7, 8] | Bars 5–8 |
| part_3 | [9, 10, 11, 12] | Bars 1–4 (D.C.) |

### `test_ds_linearization.json` (6 orig → 11 lp)

| part_id | lp_bars | label |
|---|---|---|
| part_1 | [1, 2, 3, 4] | Bars 1–4 |
| part_2 | [5, 6] | Bars 5–6 |
| part_3 | [7, 8, 9, 10] | Bars 2–5 (D.S.) |
| part_4 | [11] | Bar 6 (D.S.) |

### `test_ds_al_coda_linearization.json` (9 orig → 12 lp)

| part_id | lp_bars | label |
|---|---|---|
| part_1 | [1, 2, 3, 4] | Bars 1–4 |
| part_2 | [5, 6] | Bars 5–6 |
| part_3 | [7, 8, 9] | Bars 1–3 (D.S.) |
| part_4 | [10, 11, 12] | Coda |

---

## Regression Verification

All six fixtures regenerated without errors. Learning paths (lp_bar sequences) are identical to their Sprint 2B output — only `parts[]` changed.

Spot-check: `test_repeat_linearization.json`
- `learning_path.bars` length: 9 (unchanged) ✓
- `parts[1].bars` = [5, 6, 7] (was [5, 6] original_bar) — correctly lp_bar ✓
- `score.bars` unchanged ✓
- All navigation metadata (`repeat_start`, `repeat_end`) preserved on original bars ✓

---

## Consumer Update Requirements

Any consumer of `parts[].bars` must be updated before using Sprint 3A song files:

| Consumer | Required change |
|---|---|
| Runtime segment navigation | Follow lp_bar reference via `learning_path.bars[lp_bar-1]` |
| Authoring UI segment editor | Display lp_bar as segment position; show original_bar for score annotation |
| Segment selector | `parts[n].bars[0]` → `learning_path.bars[lp_bar-1].original_bar` for score highlight |
| Any tool reading `parts[].bars` as original_bar numbers | Must be migrated |

---

## Known Limitations — Sprint 3A

| Limitation | Impact | Future sprint |
|---|---|---|
| **`has_pickup` not detected** | Pickup bars are not joined to the following segment. All segments start a new `has_pickup: false` entry. | Requires pickup detection in importer |
| **Phrase-complete segmentation not implemented** | Segments cut strictly by `part_size_bars` count, not by phrase boundaries. | Requires phrase data from MusicXML |
| **Multiple coda segments labeled identically** | If coda section > `part_size_bars`, all chunks are labeled "Coda". | Sprint 3B if needed |
| **Manual segment authoring overwritten** | `generate_segments()` always replaces `parts[]`. Manually authored segments are lost on regeneration. | Authoring workflow sprint |
