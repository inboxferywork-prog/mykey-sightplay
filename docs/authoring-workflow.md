# Authoring Workflow — MyKey Music Labs

**Authored:** 2026-05-22 (Session 49)
**Status:** Active reference — authoring pipeline after Session 49
**Prerequisite reading:** `docs/learning-segment-architecture.md`, `docs/runtime-integration-roadmap.md`

> This document describes the end-to-end workflow for preparing a song from a raw
> MuseScore file to a pedagogically ready `song.json` that the app can consume.

---

## 1. Workflow Stages

```
MuseScore file (.mxl)
        │
        ▼  [Step 1 — Score Generation]
  mxl_to_song.py
        │  Generates: score timeline, parts, meta, scoring block
        │  Does NOT generate: learning_segments
        ▼
  song.json (partial — no segments yet)
        │
        ▼  [Step 2 — Segment Scaffolding]
  generate_segments.py
        │  Generates: starter learning_segments (N-bar groups, default 4)
        │  Output: printed to stdout (paste into song.json)
        │  Does NOT modify: score, parts, meta, scoring
        ▼
  song.json + generated learning_segments (pasted in)
        │
        ▼  [Step 3 — Editorial Refinement]
  Fay (instructor) edits manually:
        │  - Adjust phrase boundaries (start_bar / end_bar)
        │  - Rename labels to reflect musical structure ("Intro", "Tema Utama", etc.)
        │  - Set suggested_repeats (1-3 per segment difficulty)
        │  - Add sub-bar beat precision if needed (start_beat / end_beat)
        │  - Verify order matches intended learning sequence
        ▼
  song.json (editorial draft)
        │
        ▼  [Step 4 — Validation]
  validate_song.py
        │  Checks: all SPEC rules + learning_segments structure
        │  Exits 0 (pass) or 1 (errors found)
        ▼
  songs/*.json  →  served to browser runtime
```

---

## 2. Tool Responsibilities and Boundaries

| Tool | Owns | Does NOT touch |
|------|------|----------------|
| `mxl_to_song.py` | Score timeline, parts, meta, scoring block | `learning_segments` |
| `generate_segments.py` | Starter `learning_segments` output | Score, parts, meta, scoring |
| Manual editorial step | Pedagogical quality, labels, beat precision | Anything auto-generated |
| `validate_song.py` | Data quality gate — blocks bad data from runtime | Song content decisions |

**Authority chain preserved:**
- Python tools are pure data-preparation utilities
- RuntimeEngine receives only `{ start_ms, end_ms }` — it never sees bar/beat values
- Bar+beat → t_ms conversion remains exclusively in `src/song-loader.js` at load time
- No Python tool modifies any JavaScript file

---

## 3. Current Pain Points (Before Session 49)

| Problem | Impact | Session 49 fix |
|---------|--------|----------------|
| `learning_segments` authored entirely by hand | Slow; error-prone bar boundaries | `generate_segments.py` scaffolds N-bar starter groups |
| No validation of segment structure | Bad bar refs, overlapping segments reached runtime | `validate_song.py` extended with `check_learning_segments()` |
| No documented authoring conventions | Inconsistent labels, ID formats, beat conventions across songs | This document + `authoring-pedagogy-guide.md` |
| No workflow documentation | Each song prepared by memory | This document |

---

## 4. Authoring Conventions

These must be consistent across all songs.

### 4.1 Segment IDs
Format: `seg_{slug}` where slug is a snake_case descriptor.

Generator output: `seg_phrase_a`, `seg_phrase_b`, `seg_phrase_c`, ...

After editorial refinement examples:
```
seg_intro, seg_theme_a, seg_bridge, seg_coda
seg_phrase_a1, seg_phrase_a2  (when splitting a phrase)
```

Rules:
- Lowercase snake_case only
- No spaces or special characters
- Must be unique within the song
- Short (< 30 chars)

### 4.2 Labels (Indonesian)
Used as button text in the UI (keep under ~20 chars).

| Musical section | Indonesian label |
|----------------|-----------------|
| Introduction | `Intro` |
| Main theme | `Tema Utama` |
| Phrase (generic) | `Frasa A`, `Frasa B`, ... |
| Bridge / transition | `Jembatan` |
| Repeat phrase | `Frasa A (Ulang)` |
| Coda / ending | `Koda` |
| Sub-phrase | `Frasa A1`, `Frasa A2` |

Avoid: "Part", "Section", "Bagian" — these are used for the `parts[]` navigation system.

### 4.3 Exclusive-End Bar Convention
`end_bar` is the first bar **AFTER** the segment. A segment covering bars 1–4 has `end_bar: 5`.

This matches `_computeSegmentBars(data, startBar, endBar)` in `src/song-loader.js` which uses `b.bar < endBar`.

```
Segment "Frasa A" covers bars 1, 2, 3, 4:
  start_bar: 1
  end_bar:   5  ← NOT 4. end_bar is exclusive.
```

For the **last segment**: `end_bar = last_bar_in_score + 1`.
Example: score has 9 bars → last segment has `end_bar: 10`.
`song-loader.js` will return `null` t_ms for `end_ms`, and the runtime treats `null` end_ms as Infinity (play to song end).

### 4.4 Beat Numbering
Beats are **1-indexed**. In 4/4 time: beats 1, 2, 3, 4. In 3/4 time: beats 1, 2, 3.

The generator sets `start_beat: 1` and `end_beat: 1` for all segments.
Refine when a phrase starts or ends mid-bar (e.g., `start_beat: 3` for an upbeat figure).

### 4.5 Segment Order
`order` determines display sequence in the UI navigation bar. Lower values appear first.
Chronological ordering (following musical structure) is almost always correct.
The generator assigns `order: 1, 2, 3, ...` sequentially.

### 4.6 Suggested Repeats
`suggested_repeats` is a suggestion for the UI — the runtime does not enforce it.
The generator defaults to `1`. Editorial refinement sets appropriate values (see pedagogy guide).

---

## 5. Pipeline Usage Reference

### 5.1 Full workflow for a new song

```bash
# Step 1 — Generate score from MuseScore
python tools/mxl_to_song.py input.mxl songs/my_song.json

# Step 2a — Scaffold segments via CLI (optional — authoring.html can also do this)
python tools/generate_segments.py songs/my_song.json --bars 4 --in-place

# Step 2b — Open authoring.html in browser, load songs/my_song.json
# → Edit segment labels, repeats, and beat precision in the visual editor
# → Click "Simpan" (Save) to write back to disk

# Step 3 — Validate
python tools/validate_song.py songs/my_song.json

# Step 4 — Refresh the song library (no index.html editing required)
python tools/update_song_index.py
# → Song appears automatically in the app dropdown
```

### 5.2 Generate variations

```bash
# 2-bar segments (early beginner songs)
python tools/generate_segments.py songs/my_song.json --bars 2

# 4-bar segments with 3 suggested repeats each
python tools/generate_segments.py songs/my_song.json --bars 4 --repeats 3

# Write directly into song.json (replaces existing learning_segments)
python tools/generate_segments.py songs/my_song.json --bars 4 --in-place

# English labels
python tools/generate_segments.py songs/my_song.json --lang en
```

### 5.3 Validate only segments (strict mode fails on warnings)

```bash
python tools/validate_song.py songs/my_song.json --strict
```

---

## 6. Scalability Analysis

**Before Session 49** (fully manual):
- Authoring time: ~30–60 min per song (manual JSON, error-prone)
- No validation — errors reached runtime

**After Session 49** (generator + validator):
- Scaffolding: ~1 min (generator run + paste)
- Editorial refinement: ~10–20 min per song (labels, repeats, phrase boundaries)
- Validation: ~30 sec
- **Estimated: 4–5 songs per hour** (limited by editorial quality, not tooling)

**After Session 50** (browser segment editor + auto-discovery):
- Segment scaffolding: still ~1 min (CLI or in-browser auto-generate button)
- Editorial refinement: ~5–15 min per song in the visual editor (no JSON editing required)
- Song registration: ~5 sec (`python tools/update_song_index.py`)
- **No `index.html` editing required to add a song**
- **Estimated: 5–8 songs per hour** — bottleneck is now pedagogy only

**Remaining bottleneck:** Editorial refinement requires musical judgment. This is intentional — the tooling assists, it does not replace pedagogy.

---

## 7. What Stays Manual (By Design)

These decisions require musical judgment and must NOT be automated:

| Decision | Why it stays manual |
|----------|---------------------|
| Phrase boundary placement | Musical phrasing rarely aligns with mechanical bar counts |
| Label naming | Reflects musical structure (intro, chorus, bridge) not just ordering |
| `suggested_repeats` values | Difficulty is not derivable from bar count alone |
| `start_beat` / `end_beat` refinement | Mid-bar phrase starts require listening |
| Segment ordering when musical structure is non-linear | A-B-A forms, da capo, etc. |

---

## 8. Browser Segment Editor — `authoring.html`

**Implemented: Session 50.** Opens in any modern browser (no server required — uses `file://` or `live-server`).

### What it does

| Feature | Detail |
|---------|--------|
| Open song.json | File picker OR drag-and-drop |
| Score preview | Full rendered notation via existing `NotationRenderer`; click "👁" per row to preview that segment's bars only |
| Segment table | Editable rows: ID, label, start/end bar+beat, clef filter, suggested_repeats |
| Auto-generate | In-browser port of `generate_segments.py`; supports N-bar groups, repeats, Indonesian/English labels |
| Move rows | ↑ ↓ buttons reorder segments |
| Live validation | Errors + warnings shown inline (duplicate IDs, gaps, bar ranges) |
| Save | `showSaveFilePicker()` (Chrome/Edge) → saves in place; fallback download for other browsers |

### Usage
1. Open `authoring.html` in browser (link in app header: "✏ Author")
2. Drag or open the target `song.json`
3. Edit segments in the table (or click Auto-Generate for a scaffold)
4. Click "💾 Simpan" to save
5. Run `python tools/validate_song.py songs/my_song.json` for full validation
6. Run `python tools/update_song_index.py` if you added a new song to `songs/`

### Architecture boundaries preserved
- `authoring.html` is entirely additive — zero changes to `runtime-engine.js`, `notation-renderer.js`, or any existing src/ file
- `NotationRenderer` is used in read-only/preview mode — no timeline, no playback
- `RuntimeEngine` is NOT used in the authoring tool
- Output format is identical to the manual-JSON format — `validate_song.py` remains the gate

---

## 9. Future Extensibility

| Future need | How this pipeline handles it |
|-------------|------------------------------|
| More songs | `update_song_index.py` in seconds; no HTML editing ever again |
| Difficulty levels | `meta.level` already in song.json; validator checks it |
| Sub-bar phrase starts | Already supported: just edit `start_beat` / `end_beat` in the table |
| More segment types (e.g., "section_label" vs "practice_segment") | Add a `segment_type` field; validator extends with new check |
| Checkpoint 2 gameplay per-segment | `learning_segments` already carries `order` and `suggested_repeats` — gameplay engine reads these unchanged |
| Visual bar-click segment selection | Extend `authoring.html` with a click handler on the preview score's SVG elements; no runtime changes needed |

---

*Companion documents: `docs/learning-segment-architecture.md`, `docs/authoring-pedagogy-guide.md`, `docs/runtime-integration-roadmap.md`*
