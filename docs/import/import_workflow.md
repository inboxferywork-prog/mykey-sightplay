# Import Workflow

**Document:** `docs/import/import_workflow.md`
**Status:** Approved — Sprint C2
**Version:** 1.0
**Date:** 2026-06-01

---

## Overview

This document describes the complete owner workflow for importing a new song into MyKey SightPlay — from MuseScore export through publish activation.

The pipeline has six stages:

```
MuseScore
  → Export MusicXML
  → mxl_to_song.py
  → validate_song.py
  → Song Manager (curation)
  → Collection Assignment
  → Publish
```

Stages 1–3 are automated. Stages 4–6 require operator decisions.

A song must pass all stages before it can appear in the student-facing library.

---

## Prerequisites

Before importing, confirm:

- [ ] MuseScore 4 is installed
- [ ] Python 3.10+ is available (`python --version`)
- [ ] You are in the project root directory (`mykey-sightplay/`)
- [ ] `songs/collections.json` has the target collection defined (see [Collection Registry](#collection-registry))

---

## Stage 1 — MuseScore: Prepare and Export

### 1.1 Set metadata in MuseScore

Before exporting, open File → Score Properties and fill:

| Field       | Requirement | Notes |
|-------------|-------------|-------|
| Title       | Required    | Must be the real song title. No "Untitled score". |
| Composer    | Optional    | Use composer's name, or leave blank for folk/traditional. Do not use "Composer / arranger". |
| Subtitle    | Ignored     | Not imported by pipeline. |

**Why this matters:** `mxl_to_song.py` reads these fields directly. Placeholder values ("Untitled score", "Composer / arranger") are stripped by `update_song_index.py`, causing the song to appear with a filename-stem label in the index. This is a data quality failure, not a crash — but it makes the song unpublishable until corrected.

### 1.2 Set difficulty level

The pipeline reads `meta.level` from the song.json. MuseScore has no native "level" field, so you must set it after conversion (see Stage 3). Keep a note of the intended level:

| Level           | Description |
|-----------------|-------------|
| `early_beginner`| First 3–6 months. Simple melodies, one clef, slow tempos. |
| `beginner`      | 6–18 months. Both clefs, basic chords, moderate tempos. |
| `intermediate`  | 1–3 years. Both clefs, wider range, varied rhythms, dynamics. |
| `advanced`      | 3+ years. Complex rhythms, full articulation, high speed. |

### 1.3 Export to MusicXML

1. File → Export
2. Format: **MusicXML** (`.mxl` compressed, or `.xml` uncompressed — both work)
3. Save to a working directory outside the `songs/` folder (e.g., `import_staging/`)

**Do not export directly into `songs/`** — raw MusicXML files must not be committed to the repository.

---

## Stage 2 — Convert: mxl_to_song.py

Run the converter from the project root:

```bash
python tools/mxl_to_song.py <input.mxl> <output_stem>
```

**Example:**

```bash
python tools/mxl_to_song.py import_staging/beyer_037.mxl beyer_op101_037
```

This creates `songs/beyer_op101_037.json`.

### Output verification

After conversion, inspect the generated `song.json`:

```bash
python -c "import json; d=json.load(open('songs/beyer_op101_037.json')); print(d['meta'])"
```

Check:
- `meta.title` — correct song title (not a placeholder)
- `meta.composer` — correct composer or null
- `meta.bpm` — matches score tempo
- `meta.time_signature` — e.g., `[4, 4]`
- `meta.key_signature` — e.g., `"G"` for G major
- `score.bars` — non-empty list

If `meta.title` is a placeholder, **edit the song.json directly** before proceeding:

```json
"meta": {
  "title": "Beyer Op.101 No.37",
  "composer": "Ferdinand Beyer",
  ...
}
```

### Set the level field

`mxl_to_song.py` does not set `meta.level`. Add it manually in the generated `song.json`:

```json
"meta": {
  ...
  "level": "early_beginner"
}
```

Valid values: `early_beginner`, `beginner`, `intermediate`, `advanced`.

---

## Stage 3 — Validate: validate_song.py

Run the validator before any curation step:

```bash
python tools/validate_song.py songs/beyer_op101_037.json
```

For stricter checks (recommended before publish):

```bash
python tools/validate_song.py --strict songs/beyer_op101_037.json
```

### Reading validation output

| Result | Meaning |
|--------|---------|
| `PASS` | Song is structurally valid |
| `WARN` | Non-blocking issue — review but may still import |
| `FAIL` | Blocking error — must fix before importing |

### Common failures and fixes

| Error | Fix |
|-------|-----|
| `meta.title is empty or placeholder` | Edit `meta.title` in song.json |
| `meta.level: invalid value "test"` | Change to one of the four valid levels |
| `meta.level missing` | Add `"level": "early_beginner"` to meta |
| `bar sequence gap: bar 3 missing` | MusicXML export issue; re-export from MuseScore |
| `tie chain broken: ev_XXXXXX has no continuation` | Known MuseScore export edge case; re-check source score |
| `overlapping events in bar N` | Voice or layer conflict in MuseScore; fix in source |

**Do not import a song that fails validation.** Fix the source file in MuseScore and re-export, or fix the JSON directly if the issue is metadata-only.

### Regenerate the index

After the song.json is clean, regenerate the index:

```bash
python tools/update_song_index.py
```

This adds the new song to `songs/index.json` as `listed: false`. The song is now in the system but invisible to students.

---

## Stage 4 — Song Manager: Metadata Curation

Open `song-manager.html` in a browser (no server required — open as a local file).

1. **Load index:** Click "Load index.json" → select `songs/index.json`
2. **Find the new song:** Sort or search for the song title
3. **Review derived fields:** Title, Composer, Level — these were pulled from `meta.*` in song.json. If they look wrong, fix the source song.json and re-run `update_song_index.py`
4. **Verify `listed` is OFF:** New songs always start as `listed: false`. Do not activate yet.
5. **Save:** Click "Save index.json" → save over `songs/index.json`

---

## Stage 5 — Collection Assignment

Every production song must be assigned to a collection before publishing.

### In Song Manager

1. Click "Edit" on the new song row
2. In the **Collection** field, type the `collectionId` (e.g., `beyer-op101`)
3. The ID must match an entry in `songs/collections.json`
4. Click "Save" in the edit row, then "Save index.json"

### Available collections

See `songs/collections.json` for the full registry. Key collections:

| Collection ID       | Name                       | Provider      | Use for |
|---------------------|----------------------------|---------------|---------|
| `standalone`        | Standalone                 | mykey         | Songs not part of any series |
| `beyer-op101`       | Beyer Op.101               | public-domain | Beyer exercises |
| `czerny-op599`      | Czerny Op.599              | public-domain | Czerny études |
| `burgmuller-op100`  | Burgmüller Op.100          | public-domain | Burgmüller pieces |
| `hanon`             | Hanon — The Virtuoso Pianist | public-domain | Hanon exercises |
| `duvernoy-op176`    | Duvernoy Op.176            | public-domain | Duvernoy études |
| `indonesian-folk`   | Indonesian Folk Songs      | public-domain | Indonesian folk repertoire |
| `balinese-folk`     | Balinese Folk Songs        | public-domain | Balinese folk repertoire |
| `mykey-originals`   | MyKey Originals            | mykey         | Original MyKey compositions |

### Adding a new collection

If the song belongs to a series not yet in the registry:

1. Edit `songs/collections.json`
2. Add a provider entry (if the provider is new)
3. Add a collection entry with a unique `id`, `name`, `provider`, `listed`, `order`, and `tags`
4. Re-run `python tools/update_song_index.py` to verify the index is still valid

---

## Stage 6 — Publish

### Pre-publish checklist

Before setting `listed: true`, confirm all items:

| Check | Field | Requirement |
|-------|-------|-------------|
| Title is real | `title` | Not null, not a filename stem |
| Composer is set | `composer` | Correct name, or null for traditional/folk (intentional null is OK) |
| Level is valid | `level` | One of the four valid values |
| Collection is assigned | `collectionId` | Non-null; references existing collection |
| Validation passed | — | `validate_song.py` exits with PASS |
| Song plays correctly | — | Manually opened in `index.html` and played through |
| Learning segments authored | — | If the song is segmented, segments are reviewed in `authoring.html` |

### Activate

1. Open `song-manager.html`
2. Load `songs/index.json`
3. Find the song — click the **hidden** badge in the Listed column to toggle it to **public**
4. Save `songs/index.json`

The song is now live. Students with `index.html` will see it in the song selector immediately (no build step required).

### Verify in player

1. Open `index.html` in a browser
2. Confirm the song appears in the dropdown
3. Confirm test fixtures are not visible
4. Play the song — confirm notation renders and playback is correct

---

## Batch Import

When importing multiple songs from the same collection (e.g., 30 Beyer exercises):

1. Export all MusicXML files from MuseScore
2. Run `mxl_to_song.py` for each file
3. Run `validate_song.py` on all files — fix any failures before proceeding
4. Run `update_song_index.py` once after all conversions — a single pass adds all new songs
5. Use `song-manager.html` to assign collection IDs in bulk (edit each row)
6. Run `update_song_index.py` again after saving the index (verifies curation fields are intact)
7. Set `listed: true` on all songs that pass the pre-publish checklist
8. Final `update_song_index.py` run to confirm the output is clean

---

## Troubleshooting

### Song appears in player with filename as title

**Cause:** `meta.title` in song.json is a placeholder ("Untitled score") or empty.

**Fix:** Edit `meta.title` in the song.json file directly, then run `update_song_index.py`.

### Song appears with "null" composer

**Cause:** `meta.composer` was "Composer / arranger" or empty — stripped to null.

**Fix:** If the composer is known, edit `meta.composer` in song.json. For folk/traditional songs, `null` is correct.

### Song does not appear in player dropdown

**Cause A:** `listed: false` in index.json.
**Fix:** Toggle listed in song-manager.html and save.

**Cause B:** `index.json` was not regenerated after adding the song.json file.
**Fix:** Run `python tools/update_song_index.py`.

**Cause C:** The song.json failed the `meta + score` validation in `update_song_index.py` and was skipped.
**Fix:** Check the tool output for `WARNING: skipping <filename>`. Fix the missing fields.

### validate_song.py reports `level: invalid value "test"`

**Cause:** The song was authored as a test fixture and has `"level": "test"` in meta.

**Fix:** Change to a valid level: `early_beginner`, `beginner`, `intermediate`, or `advanced`. Re-run validation.

### Player shows test fixtures in dropdown

**Cause:** The listed filter in `_initSongLibrary()` in `index.html` is not applied.

**Fix:** Ensure `_initSongLibrary()` filters by `s.listed === true` before building the dropdown. See `index.html` source line ~1709.
