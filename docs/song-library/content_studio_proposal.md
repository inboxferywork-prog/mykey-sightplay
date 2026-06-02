# Content Studio Proposal — authoring.html Evolution

**Document:** `docs/song-library/content_studio_proposal.md`
**Status:** Proposal — awaiting architect review
**Date:** 2026-06-01
**Author:** Engineer session (Claude)

---

## 1. Summary

The pipeline is technically complete and verified end-to-end. The blocker is not correctness — it is friction. The owner must coordinate four separate pages and manual file moves to add a single song. This document proposes evolving `authoring.html` into a single-page Content Studio so that Import → Edit → Publish happens in one place.

**What this is:**
- A UX improvement to the existing authoring flow
- An expansion of `authoring.html` with curation fields and a Publish action

**What this is not:**
- A new architecture
- A redesign of song.json, index.json, the runtime, or any engine
- A replacement for the Python tools (they continue to work as before)

---

## 2. Current Workflow Map

### 2a. Step-by-step breakdown

```
[MuseScore]
  Export .mxl
        │
        ▼
[Terminal — Step 1]
  python tools/mxl_to_song.py input.mxl songs/name.json
  -- produces song.json with score + parts + scoring
  -- title/composer come from MuseScore; often placeholder values

        │
        ▼
[authoring.html — Step 2]
  Open song.json via drag-drop or file picker
  Edit learning segments
  Click "Simpan" (Save) → File System Picker → navigate to songs/ → save
  OR
  Click "Download" → file lands in ~/Downloads → manually move to songs/

        │
        ▼
[authoring.html — Step 3, conditional]
  "Update songs/index.json" button
  → opens File System Picker again for index.json
  → navigate to songs/ again → save
  OR
  → downloads index.json → manually move to songs/

        │
        ▼
[Terminal — Step 4]
  python tools/validate_song.py songs/name.json
  -- owner must have terminal open separately

        │
        ▼
[song-manager.html — Step 5]
  Load songs/index.json manually (file picker again)
  Find song in table
  Toggle listed / hidden
  Set collectionId
  Click Save → file picker for index.json (third time)
  OR
  Download index.json → move to songs/ (again)
```

### 2b. Friction points identified

| # | Point | Root cause |
|---|-------|------------|
| F1 | Python terminal required for conversion | mxl_to_song.py is Python-only |
| F2 | Multiple file pickers / downloads for a single publish | Song and index are separate saves |
| F3 | Validation is Python-only; browser shows advisory only | validate_song.py is not callable from browser |
| F4 | Curation (listed, collectionId) is on a different page | song-manager.html is not connected to authoring.html |
| F5 | No editing of title/composer in the browser | authoring.html shows these as read-only info chips |
| F6 | File moves from Downloads to songs/ required without FSAPI | Browser security constraint |

### 2c. Current capability inventory

**authoring.html already has:**

| Feature | Status | Notes |
|---------|--------|-------|
| Browser MXL import (`_parseMusicXML`) | Complete | Full DOM-based MusicXML parser; mirrors mxl_to_song.py logic |
| Score preview (VexFlow) | Complete | Collapsible; segment-scoped preview |
| Segment editor (table) | Complete | Add / edit / reorder / delete; auto-generate |
| Client-side segment validation | Complete | Duplicate IDs, bar ranges, coverage gaps |
| Save song.json | Complete | `showSaveFilePicker` + download fallback |
| Registry status chip | Complete | Reads index.json; shows ✓ or ⚠ |
| Index update (`_saveUpdatedIndex`) | Complete | Fetches current index; patches entry; saves via FSAPI or download |

**authoring.html is missing:**

| Feature | Gap | Currently lives in |
|---------|-----|--------------------|
| `listed` / `hidden` toggle | Not present | song-manager.html |
| `collectionId` assignment | Not present | song-manager.html |
| `tags` assignment | Not present anywhere | No UI exists |
| Title edit | Read-only chip | Must edit song.json manually |
| Composer edit | Read-only chip | Must edit song.json manually |
| Folder Mode (songs/ directory handle) | Not present | song-manager.html (Folder Mode) |

---

## 3. Proposed Workflow Map

### 3a. Target owner experience

```
[MuseScore]
  Export .mxl
        │
        ▼
[authoring.html]
  ┌─────────────────────────────────────────────────┐
  │  IMPORT                                         │
  │  Drag .mxl onto page, or click "Import .mxl"   │
  │  Configure: BPM override, level, part size      │
  │  → song.json generated in browser               │
  └─────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────┐
  │  EDIT METADATA                                  │
  │  Title: [editable text field]                   │
  │  Composer: [editable text field]                │
  │  Level: [dropdown]                              │
  └─────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────┐
  │  EDIT SEGMENTS                                  │
  │  (existing segment editor — unchanged)          │
  │  Score preview, add/edit/reorder segments       │
  └─────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────┐
  │  PUBLISH SETTINGS                               │
  │  Visibility: [Listed / Hidden] toggle           │
  │  Collection: [text input]  e.g. yamaha-p1       │
  │  Tags: [text input]  e.g. cat:repertoire        │
  └─────────────────────────────────────────────────┘
        │
        ▼
  ┌─────────────────────────────────────────────────┐
  │  PUBLISH                                        │
  │  [Validate] → runs client-side checks           │
  │  [Publish] → saves song.json + patches index    │
  │  Status: ✓ Published  |  ⚠ validation warnings │
  └─────────────────────────────────────────────────┘
```

### 3b. Publish action — what it does

Publish is a single button that performs, in sequence:

1. Run client-side validation (same as current "Validasi" — blocks on errors)
2. Build updated `song.json` (existing `_buildOutputData()`, plus title/composer edits applied to `meta`)
3. Build updated `index.json` entry (merges derived fields + curation fields from the form)
4. Save `song.json`:
   - Folder Mode: write directly to songs/
   - No Folder Mode: `showSaveFilePicker` → user navigates to songs/
5. Save `index.json`:
   - Folder Mode: write directly to songs/index.json (no separate picker)
   - No Folder Mode: `showSaveFilePicker` → separate save
6. Show success state with registry status update

Folder Mode (File System API, Chrome desktop) eliminates all manual file moves and reduces Publish to a single click after folder selection.

### 3c. What is NOT changing

- `song.json` schema — unchanged
- `index.json` schema — unchanged
- Python tools (`mxl_to_song.py`, `validate_song.py`, `update_song_index.py`, `replace_song.py`) — unchanged and continue to work
- `song-manager.html` — remains available for bulk registry management
- Runtime / engine / renderer — not touched

---

## 4. UI Layout Proposal

### 4a. Current editor section structure

```
[Song info bar — read-only chips]
[Score preview — collapsible]
[Segment editor — table]
[Validation panel]
[Next steps card — post-save only]
[Workflow footer — text instructions]

[Status bar: Validate | Save | Download]
```

### 4b. Proposed editor section structure

```
[Song info bar — read-only chips + "✓ registry" chip]

[METADATA CARD]                               ← NEW
  Title:    [__________________________]
  Composer: [__________________________]
  Level:    [Early Beginner ▾]

[Score preview — collapsible]                 ← unchanged

[Segment editor — table]                      ← unchanged

[Validation panel]                            ← unchanged

[PUBLISH CARD]                                ← NEW (replaces Next Steps + Workflow Footer)
  Visibility:  [● Listed]  [○ Hidden]
  Collection:  [________________]  e.g. yamaha-p1
  Tags:        [________________]  e.g. cat:repertoire genre:folk

  [Publish ▶]   ← primary action
  Status line: ⋯ Not yet published

[Status bar: Validate | Save | Publish]       ← Publish replaces Download
```

### 4c. Metadata Card — detail

**Purpose:** Allows owner to correct MuseScore placeholder title/composer without editing song.json manually.

**Fields:**
- `Title` — text input, pre-filled from `meta.title`. On change, updates `_songData.meta.title` in memory.
- `Composer` — text input, pre-filled from `meta.composer`. On change, updates `_songData.meta.composer`.
- `Level` — `<select>` (early_beginner / beginner / intermediate / advanced). Pre-filled from `meta.level`. On change, updates `_songData.meta.level`.

The info chip bar (`infoTitle`, `infoLevel`) reflects changes live.

**Rule:** Title / composer edits are saved into `song.json` when Publish (or Save) is triggered. They mutate `_songData.meta` in memory before `_buildOutputData()` is called.

### 4d. Publish Card — detail

**Purpose:** Sets curation fields that live in `index.json`, then triggers the combined save.

**Fields:**
- `Visibility` — two-button toggle: Listed (green) / Hidden (muted). Default: `true` for non-test_ filenames.
- `Collection` — single text input, free-form string. Matches `collectionId` in index.json. Placeholder: "leave blank for none".
- `Tags` — single text input, space-separated tag tokens. Placeholder: e.g. `cat:repertoire genre:folk`. Parsed on Publish into a `string[]`.

**Publish button behavior:**

```
onClick:
  1. Validate segments (client-side) → abort if errors
  2. Apply meta edits to _songData.meta in memory
  3. Build song.json output (_buildOutputData)
  4. Build index entry:
       { src, label, title, composer, level,   ← derived
         listed, collectionId, tags }            ← from Publish Card form
  5. If Folder Mode active:
       Write song.json → songs/<filename>.json
       Patch index.json → songs/index.json
       Show: ✓ Published (Folder Mode)
  6. Else if FSAPI available (no folder):
       showSaveFilePicker for song.json → save
       showSaveFilePicker for index.json → save
       Show: ✓ Published (2 files saved)
  7. Else (no FSAPI):
       Trigger download of song.json
       Trigger download of index.json
       Show: ⬇ Downloaded — move both files to songs/
  8. Update registry status chip
```

### 4e. Folder Mode integration

Folder Mode is the high-fidelity path. When active:
- Both files (song.json + index.json) are written atomically without additional pickers
- Folder handle is established once via "Open songs/ Folder" button
- Status bar shows: `📁 songs/ [connected]`
- Publish becomes a true single click

Folder Mode requires Chrome desktop (File System Access API). Without it, the two-file download flow is the fallback — still better than the current state (which requires 3+ separate file pickers).

---

## 5. Reuse Plan

### 5a. From authoring.html (keep as-is)

| Component | Reuse |
|-----------|-------|
| `_parseMusicXML()` and all MXL import helpers | Unchanged |
| `_handleMxlFile()`, `_unzipMxl()` | Unchanged |
| `NotationRenderer` score preview | Unchanged |
| Segment editor table + `_renderTable()` | Unchanged |
| Client-side validation (`_runValidation()`) | Unchanged |
| `_buildOutputData()` | Unchanged (returns song.json object) |
| `_fetchRegistry()`, `_checkRegistryStatus()` | Unchanged |
| `_generateUpdatedIndexJson()` | Extended (see §5b) |
| `_saveUpdatedIndex()` | Refactored into Publish action |

### 5b. Changes required in authoring.html

| Component | Change |
|-----------|--------|
| Song info bar | Title / composer / level become editable inputs rather than read-only chips |
| `_buildSongEntry()` | Extended to include `listed`, `collectionId`, `tags` from Publish Card form |
| `_generateUpdatedIndexJson()` | Receives curation fields as arguments; index entry includes full set |
| New: Metadata Card section | HTML + event wiring for title / composer / level edits |
| New: Publish Card section | HTML + event wiring for listed / collectionId / tags |
| New: Folder Mode state | `_folderHandle` + write helper, mirrored from song-manager.html |
| New: Publish action | Orchestrates validation → meta apply → song save → index save |
| Status bar | Add Publish button; Download can remain as secondary |

### 5c. From song-manager.html (extract and adapt)

| Component | Source | Target |
|-----------|--------|--------|
| Folder Mode (`showDirectoryPicker`, file write) | song-manager.html `openFolder()` | New `_openSongsFolder()` in authoring.html |
| Listed/hidden toggle UI pattern | `listed-badge`, `listed-toggle` CSS + JS | Publish Card toggle |
| `saveRegistry` payload structure | Reference for index.json write | `_generateUpdatedIndexJson` |

`song-manager.html` itself is not modified. It continues to work for bulk registry operations.

---

## 6. Migration Plan

### 6a. Approach

Add new sections to `authoring.html` in-place. No new file created. No architecture change.

The existing editor flow (Open → Edit Segments → Validate → Save) continues to work exactly as before. The Metadata Card and Publish Card are additions, not replacements.

**Backward compatibility:** The existing "Save" and "Download" buttons remain. The "Next Steps" card becomes the Publish Card. The workflow footer is removed (replaced by the Publish Card's UX).

### 6b. State additions

Three new in-memory state variables:

```js
// Curation state — persists between save operations
let _uiListed       = true;     // boolean: publish card toggle
let _uiCollectionId = '';       // string: collection input value
let _uiTags         = [];       // string[]: parsed from tags input

// Folder Mode
let _songsFolder    = null;     // FileSystemDirectoryHandle | null
```

### 6c. `_buildSongEntry` change

Current (post-Sprint D fix):
```js
function _buildSongEntry(data, filename) {
  return { src: 'songs/' + filename, label: _buildSongLabel(data) };
}
```

Proposed (full entry with curation):
```js
function _buildSongEntry(data, filename) {
  const m = data?.meta || {};
  return {
    src:          'songs/' + filename,
    label:        _buildSongLabel(data),
    title:        _cleanTitle(m.title),
    composer:     _cleanComposer(m.composer),
    level:        m.level || null,
    collectionId: _uiCollectionId.trim() || null,
    listed:       _uiListed,
    tags:         _uiTags,
  };
}
```

The merge in `_generateUpdatedIndexJson` stays as `{ ...songs[idx], ...entry }`. For existing songs this overwrites all fields correctly. For new songs the entry is pushed as-is.

### 6d. Metadata edit → song.json binding

Title and composer inputs mutate `_songData.meta` live:

```js
// In Metadata Card wiring:
document.getElementById('csTitle').oninput = e => {
  if (_songData?.meta) _songData.meta.title = e.target.value;
  document.getElementById('infoTitle').textContent = e.target.value || '—';
};
```

`_buildOutputData()` is unchanged — it deep-copies `_songData`, which already has the updated title/composer.

### 6e. Curation state initialization

When a song is loaded (`_loadSongData`), the curation fields are pre-filled from the existing index entry (if found in `_registryData`):

```js
// After _checkRegistryStatus resolves:
const src   = 'songs/' + _songFileName;
const entry = (_registryData?.songs || []).find(e => e.src === src);
if (entry) {
  _uiListed       = entry.listed ?? true;
  _uiCollectionId = entry.collectionId || '';
  _uiTags         = Array.isArray(entry.tags) ? entry.tags : [];
  // Update Publish Card UI to reflect loaded values
}
```

This means when the owner re-opens an existing song, the Publish Card shows its current visibility, collection, and tags — not blanks.

---

## 7. Risks

### R1 — Folder Mode browser limitation

**Risk:** Folder Mode (File System Access API) only works in Chrome/Edge desktop. Safari and Firefox do not support `showDirectoryPicker`. Without it, the owner still needs two separate file saves.

**Mitigation:** The FSAPI-less path is already better than today (one Publish button triggers both downloads sequentially vs. the current multi-step flow). Folder Mode is an enhancement for Chrome, not a prerequisite for the feature.

**Impact if not mitigated:** Low — the two-file download flow still reduces friction significantly vs. the current state.

---

### R2 — MXL import fidelity gap vs. Python pipeline

**Risk:** The browser MXL parser (`_parseMusicXML`) is a re-implementation of `mxl_to_song.py`. It does not handle: tuplets, ottava spanners, repeat/volta marks, navigation symbols (D.C., D.S., Segno, Coda). Songs with these features imported via browser will be missing those fields.

**Mitigation:** The Python pipeline remains the recommended path for complex songs. The browser import is for simple songs (Yamaha beginner level). The drop zone already documents "Via Python (lengkap)" as the high-accuracy path.

**Owner SOP rule:** Use browser import for simple songs (no repeats, no ottava, no tuplets). Use Python import for complex songs, then open the resulting song.json in authoring.html for segment editing.

**Impact if not mitigated:** Low for current song library (Yamaha Primary 1–4 songs are simple). Must be documented clearly.

---

### R3 — index.json written from browser without validation gate

**Risk:** The Python `validate_song.py` cannot be called from the browser. The browser's client-side validation covers segments but does not cover all 30+ SPEC rules that `validate_song.py` checks (e.g. event ID format, pair_with_id mutual, bar sequential, tie chain integrity).

**Mitigation:** The Python tools remain available. For a production publish, the owner can still run `python tools/validate_song.py` independently. The Publish button's status shows client-side validation result only; advisory text reminds owner to run Python validation for new songs.

**Alternative:** For Folder Mode, after writing song.json, the status panel shows: "Run `python tools/validate_song.py songs/name.json` to confirm." This keeps the Python gate advisory without blocking the browser flow.

**Impact if not mitigated:** Low — the conversion pipeline (mxl_to_song.py) already produces valid song.json; the browser Publish is mainly writing segments + curation. The risk is highest when using browser MXL import (see R2).

---

### R4 — Title/composer edit creates divergence from song.json meta

**Risk:** If the owner edits the title in the Content Studio and publishes, the in-memory `_songData.meta.title` is updated and saved to song.json. But a subsequent run of `update_song_index.py` will read the song.json and correctly pick up the new title. No divergence — this is expected behavior.

**Non-risk confirmed:** The metadata spec says `title` is a derived field (from `meta.title`). Editing it in-app and saving it back to song.json is the correct path.

---

### R5 — Two active tools for index.json management

**Risk:** The owner uses both authoring.html (single-song Publish) and song-manager.html (bulk operations). If both are open simultaneously and each writes index.json, the last write wins and the other's changes are lost.

**Mitigation:** This is already the case today (multiple browser tabs can each download an index.json). Single-user workflow; unlikely to be a real collision. The status chip in authoring.html refreshes index.json on each load, so stale state is visible.

**Future mitigation (if needed):** A last-write-wins timestamp or ETag check in `_fetchRegistry`. Not required for the current single-operator use case.

---

## 8. Implementation Phases

### Phase 1 — Metadata Card + Publish Card (no Folder Mode)

**Scope:** Add the two new sections to `authoring.html`. Implement Publish button that triggers sequential song + index saves (FSAPI picker or download). No Folder Mode.

**Changes:**
- Add Metadata Card HTML section (title, composer, level fields)
- Wire Metadata Card inputs to `_songData.meta` mutations
- Add Publish Card HTML section (listed toggle, collectionId, tags)
- Extend `_buildSongEntry` to produce full index entry
- Initialize Publish Card from existing index entry on file load
- Publish button: validate → apply meta → save song.json → save index.json
- Remove "Next Steps" card + "Workflow Footer" (replace with Publish Card)
- Update status bar: Validate | Save | Publish (Download remains secondary)

**Outcome:** Owner can complete Import → Edit → Publish on one page. Two file-save dialogs for non-FSAPI browsers, one for FSAPI browsers (song.json only; index.json also requires a picker).

**Estimate:** 1 engineering session (~4–6 hours of implementation).

---

### Phase 2 — Folder Mode integration

**Scope:** Add "Open songs/ Folder" button that acquires a `FileSystemDirectoryHandle`. When active, Publish writes song.json and index.json in a single action with no additional dialogs.

**Changes:**
- Add `_openSongsFolder()` function (port from song-manager.html `openFolder()`)
- Add folder status indicator in header ("📁 songs/ [connected]")
- Modify Publish action: when `_songsFolder` is set, use `getFileHandle` + `createWritable` for both files
- Folder handle persists for the session (no re-picker between songs)

**Outcome:** True single-click Publish in Chrome desktop. Owner opens the folder once; all subsequent Publishes are atomic.

**Estimate:** 1 engineering session (~2–3 hours, simpler than Phase 1).

---

### Phase 3 — song-manager.html deprecation assessment (future)

**Scope:** After Phase 1+2 are stable, evaluate whether song-manager.html is still needed.

**Decision criteria:**
- If authoring.html Phase 1+2 handles all workflows the owner actually uses, song-manager.html can become a maintenance-only tool (kept but not featured)
- song-manager.html's unique value is bulk registry view + search — useful for libraries with many songs
- Decision deferred until after Phase 2 is in use

**No action in this phase.**

---

## 9. Open Questions for Architect Review

1. **Language of new UI:** Current authoring.html uses Indonesian for labels. Publish Card should match — confirm Indonesian or English for new fields.

2. **Tags UX:** Tags are space-separated in the proposal. Confirm this is sufficient vs. a multi-select or chip input. Controlled vocabulary enforcement (prefix `cat:`, `genre:`, `origin:`) could be a dropdown, but adds complexity.

3. **Phase 1 priority:** Confirm Phase 1 (Metadata + Publish, no Folder Mode) is the right first target vs. Phase 2 first. Folder Mode is the high-value feature but Phase 1 delivers immediate improvement for all browsers.

4. **"Save" vs "Publish" terminology:** "Publish" implies making visible to users. But even with `listed: false`, the Publish button still saves and indexes the song. Confirm the label and semantics are correct, or rename to "Save & Index".

5. **song-manager.html future:** No action now, but confirm whether it should be explicitly surfaced or de-emphasized after the Content Studio is complete.

---

## Appendix A — File Change Summary

| File | Change type | Scope |
|------|-------------|-------|
| `authoring.html` | Extend | Add Metadata Card, Publish Card, Folder Mode, Publish action |
| `song-manager.html` | None | No changes; remains available |
| `tools/*.py` | None | All Python tools unchanged |
| `songs/index.json` | Schema unchanged | Written by new Publish action |
| `songs/*.json` | Schema unchanged | Written by new Publish action |

## Appendix B — State Variable Additions

```js
// Curation (new)
let _uiListed       = true;   // boolean — Publish Card listed toggle
let _uiCollectionId = '';     // string — Publish Card collection input
let _uiTags         = [];     // string[] — parsed from Publish Card tags input

// Folder Mode (new)
let _songsFolder    = null;   // FileSystemDirectoryHandle | null
```

All existing state variables (`_songData`, `_songFileName`, `_segments`, `_selectedRow`, `_previewOpen`, `_registryData`) are unchanged.

## Appendix C — `_buildSongEntry` Proposed Signature

```js
// Proposed — full entry with curation fields from Publish Card
function _buildSongEntry(data, filename) {
  const m         = data?.meta || {};
  const rawTitle  = (m.title    || '').trim();
  const rawComp   = (m.composer || '').trim();
  const PLACEHOLDER_TITLES    = new Set(['', 'untitled score', 'untitled']);
  const PLACEHOLDER_COMPOSERS = new Set(['', 'composer / arranger', 'composer/arranger']);

  return {
    src:          'songs/' + filename,
    label:        _buildSongLabel(data),
    title:        PLACEHOLDER_TITLES.has(rawTitle.toLowerCase())    ? null : rawTitle,
    composer:     PLACEHOLDER_COMPOSERS.has(rawComp.toLowerCase())  ? null : rawComp || null,
    level:        m.level || null,
    collectionId: _uiCollectionId.trim() || null,
    listed:       _uiListed,
    tags:         _uiTags,
  };
}
```

This output, merged as `{ ...existing, ...entry }` in `_generateUpdatedIndexJson`, correctly updates all fields while maintaining the merge-wins pattern already in place.
