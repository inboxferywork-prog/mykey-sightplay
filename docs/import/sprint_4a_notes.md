# Implementation Notes — Sprint 4A: Import Pipeline Integration

**Date:** 2026-05-31
**Scope:** Invoke the Linear Learning Path Generator automatically from `mxl_to_song.py`.
**Reference:** [`sprint_3a_notes.md`](sprint_3a_notes.md), [`linear_learning_path_generator.md`](linear_learning_path_generator.md)

---

## Summary

`mxl_to_song.py` now calls `generate_learning_path()` immediately after building `score.bars`. A single `python tools/mxl_to_song.py input.mxl songs/output.json` invocation produces a fully linearized song.json with `learning_path` and lp_bar-based `parts[]`, ready for the MyKey runtime.

`score.bars` is never modified by the generator. All navigation metadata (`repeat_start`, `repeat_end`, `volta`, `segno`, `coda`, `navigation`) is preserved on `score.bars` exactly as emitted by the importer.

---

## Code Changes

### Modified file: `tools/mxl_to_song.py`

| Location | Change |
|---|---|
| Module docstring | Added Sprint 4A description |
| After imports | Added `sys.path.insert` + `from linear_learning_path_generator import generate_learning_path` |
| `main()` — after `build_song_json()` | Added `song_data = generate_learning_path(song_data)` |
| `main()` — summary block | Added LP bars count, expansion ratio, "lp_bar references" label for segments |

### No changes to

- `linear_learning_path_generator.py` — invoked as-is
- Runtime engine
- PracticeLoop
- Any song.json consumer

---

## Import sequence (Sprint 4A)

```
MXL file
  │
  ▼ music21 parse
score.bars[]          ← events, repeat/nav metadata, beats
  │
  ▼ build_song_json()
song_data             ← meta, score, scoring, parts[] (original_bar placeholder)
  │
  ▼ generate_learning_path()   ← Sprint 4A addition
song_data             ← learning_path added, parts[] replaced with lp_bar refs
  │
  ▼ json.dump
output.json           ← complete song, ready for runtime
```

`build_parts_list()` still runs inside `build_song_json()` (producing an original_bar placeholder). `generate_learning_path()` immediately overwrites `parts[]` with lp_bar-referenced segments. The placeholder is never written to disk.

---

## Before / After — import output for a 6-bar score with a repeat

### Before (pre-Sprint 4A)

```json
{
  "meta": { "part_size_bars": 4, ... },
  "parts": [
    { "part_id": "part_1", "label": "Part 1", "bars": [1, 2, 3, 4], "has_pickup": false },
    { "part_id": "part_2", "label": "Part 2", "bars": [5, 6],       "has_pickup": false }
  ],
  "score": { "bars": [ ...bar 2 has repeat_start, bar 4 has repeat_end... ] },
  "scoring": { ... }
}
```

- `parts[].bars` = original_bar numbers
- No `learning_path` key
- Labels are generic ("Part 1", "Part 2")
- Repeat section invisible to the segment model

### After (Sprint 4A)

```json
{
  "meta": { "part_size_bars": 4, ... },
  "parts": [
    { "part_id": "part_1", "label": "Bars 1–4", "bars": [1, 2, 3, 4], "has_pickup": false },
    { "part_id": "part_2", "label": "Bars 2–4 (repeat)", "bars": [5, 6, 7], "has_pickup": false },
    { "part_id": "part_3", "label": "Bars 5–6",          "bars": [8, 9],    "has_pickup": false }
  ],
  "score": { "bars": [ ...bar 2 has repeat_start, bar 4 has repeat_end — unchanged... ] },
  "learning_path": {
    "expansion_policy": "full",
    "bars": [
      { "lp_bar": 1, "original_bar": 1, "pass": 1, "section": "main" },
      { "lp_bar": 2, "original_bar": 2, "pass": 1, "section": "main" },
      { "lp_bar": 3, "original_bar": 3, "pass": 1, "section": "main" },
      { "lp_bar": 4, "original_bar": 4, "pass": 1, "section": "main" },
      { "lp_bar": 5, "original_bar": 2, "pass": 2, "section": "main" },
      { "lp_bar": 6, "original_bar": 3, "pass": 2, "section": "main" },
      { "lp_bar": 7, "original_bar": 4, "pass": 2, "section": "main" },
      { "lp_bar": 8, "original_bar": 5, "pass": 1, "section": "main" },
      { "lp_bar": 9, "original_bar": 6, "pass": 1, "section": "main" }
    ],
    "original_bar_index": {
      "1": [1], "2": [2, 5], "3": [3, 6], "4": [4, 7], "5": [8], "6": [9]
    }
  },
  "scoring": { ... }
}
```

- `parts[].bars` = lp_bar numbers
- `learning_path` present
- Labels are descriptive, repeat-aware
- Segment count: 3 (was 2) — repeat section is now a navigable segment

---

## Import Verification Fixture

`songs/test_import_verification.json` — 4-bar no-repeat score.

Represents the simplest post-import result: no navigation symbols, no repeats. The learning path is a 1:1 mapping of lp_bar → original_bar (expansion ratio 1.00×). One segment: `part_1`, `bars=[1,2,3,4]`, label "Bars 1–4".

Key property: when there are no repeats or navigation symbols, the generator is a no-op expansion. `learning_path.bars[n].lp_bar == learning_path.bars[n].original_bar` for all entries. Parts reference lp_bar numbers that happen to equal original_bar numbers.

---

## Regression Verification

All six Sprint 1A–3A test fixtures regenerated under the integrated pipeline without errors.

| Fixture | Original bars | LP bars | Segments | score.bars unchanged |
|---|---|---|---|---|
| `test_repeat_linearization` | 6 | 9 | 3 | ✓ |
| `test_volta_linearization` | 7 | 9 | 5 | ✓ |
| `test_dc_linearization` | 5 | 10 | 4 | ✓ |
| `test_dc_al_fine_linearization` | 8 | 12 | 3 | ✓ |
| `test_ds_linearization` | 6 | 11 | 4 | ✓ |
| `test_ds_al_coda_linearization` | 9 | 12 | 4 | ✓ |

---

## CLI Output — after Sprint 4A

```
Parsing: my_piece.mxl
Parts found: 2
BPM: 120.0
...

Output written: songs/my_piece.json
  Song ID    : my_piece
  Title      : My Piece
  Composer   : Unknown
  Hand mode  : both
  Bars       : 6 original
  LP bars    : 9 (1.50x expansion)
  Segments   : 3 (lp_bar references)
  Events     : 47
  Repeats    : bars [2, 4] have repeat/volta fields

Next step: python tools/validate_song.py songs/my_piece.json
```

---

## Consumer Reminder

Any code that reads `parts[].bars` must use the lp_bar → original_bar lookup (Sprint 3A migration pattern):

```javascript
// AFTER Sprint 4A — parts[].bars are lp_bar numbers
const lpEntry  = song.learning_path.bars[part.bars[0] - 1];
const scoreBar = song.score.bars.find(b => b.bar === lpEntry.original_bar);
```

---

## Known Limitations — Sprint 4A

| Limitation | Impact | Future sprint |
|---|---|---|
| **music21 navigation field coverage not verified against real MXL** | `build_nav_map()` emits segno/coda/navigation fields — coverage depends on how MusicXML encoders write these symbols | Integration testing sprint |
| **`has_pickup` not propagated to generator** | Generator always sets `has_pickup: false`; pickup bar not joined to following segment | Requires generator pickup detection |
| **`validate_song.py` not updated for learning_path schema** | Validator does not check lp_bar references in parts[] | Sprint 4B |
