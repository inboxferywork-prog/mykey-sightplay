# Song Metadata Owner Audit

**Document:** `docs/song-library/song_metadata_owner_audit.md`
**Status:** Audit — awaiting architect review before implementation
**Date:** 2026-06-01

---

## 1. Current Metadata Inventory

### 1.1 song.json — Full Field Inventory

Every field that currently exists in a song.json file, with its source and purpose.

#### `meta` block

| Field | Source | Set by | Purpose |
|-------|--------|--------|---------|
| `meta.id` | Auto-generated | Pipeline | Stable slug identifier derived from slugified title. Never changed after first use. |
| `meta.title` | MuseScore | Notation author | Human-readable song title extracted from MusicXML `<work-title>` or `<movement-title>`. Placeholder value if not set in MuseScore. |
| `meta.composer` | MuseScore | Notation author | Composer name from MusicXML `<creator type="composer">`. Empty/placeholder if not set. |
| `meta.level` | CLI argument | Owner (at import time) | Pedagogical difficulty classification. Values: `early_beginner`, `beginner`, `intermediate`, `advanced`. Default: `early_beginner`. Not from MuseScore. |
| `meta.bpm` | MuseScore | Notation | Tempo in BPM, read from MetronomeMark. Falls back to CLI `--bpm` argument (default 72) if score has no marking. |
| `meta.time_signature` | MuseScore | Notation | Array `[numerator, denominator]`, e.g. `[4, 4]`. |
| `meta.key_signature` | MuseScore | Notation | Key string: `"C"`, `"G"`, `"Bb"`, `"Am"`, etc. |
| `meta.hand_mode` | Derived | Pipeline | `"both"` when score has treble+bass parts; `"rh_only"` or `"lh_only"` for single-part scores. |
| `meta.active_clefs` | Derived | Pipeline | Array of clefs parsed from score parts: `["treble"]`, `["bass"]`, or `["treble", "bass"]`. |
| `meta.freq_split_hz` | System constant | Pipeline | 261.63 Hz (middle C). Used by runtime to route audio to treble vs bass channel. |
| `meta.part_size_bars` | CLI argument | Owner (at import time) | Number of bars per practice part. Default: 4. |
| `meta.background_music` | Owner (post-import) | Owner (manually) | `null` until owner adds MP3 path after audio production. |
| `meta.example_audio` | Owner (post-import) | Owner (manually) | `null` until owner adds MP3 path after audio production. |
| `meta.hint_config` | System defaults | Pipeline | Auto-hint timing, penalties. Hardcoded defaults. Owner does not currently edit this. |

#### `parts` block

| Field | Source | Set by | Purpose |
|-------|--------|--------|---------|
| `parts[].part_id` | Derived | Pipeline | Auto-generated sequential ID: `part_1`, `part_2`, … |
| `parts[].label` | Derived | Pipeline | Auto-generated display label: `Part 1`, `Part 2`, … |
| `parts[].bars` | Derived | Pipeline | Array of bar numbers covered by this part. |
| `parts[].has_pickup` | Derived | Pipeline | `true` if the first bar is a pickup/anacrusis bar. |
| `parts[].example_audio` | Owner (post-import) | Owner (manually) | `null` until owner adds per-part example audio path. |

#### `score` block

| Field | Source | Set by | Purpose |
|-------|--------|--------|---------|
| `score.bars[]` | MuseScore | Pipeline | Complete music event timeline: notes, rests, chords, bar numbers, t_ms, duration_ms. Full music content. |

#### `scoring` block

| Field | Source | Set by | Purpose |
|-------|--------|--------|---------|
| `scoring.*` | System defaults | Pipeline | Accuracy windows, point values for perfect/good/late/miss. Hardcoded defaults. Owner does not currently edit. |

#### `learning_segments` block

| Field | Source | Set by | Purpose |
|-------|--------|--------|---------|
| `learning_segments[]` | Owner (authoring.html) | Owner | Pedagogical phrase boundaries. segment_id, label, start_bar, end_bar, start_beat, end_beat, visible_clefs, suggested_repeats. |

#### `learning_path` block

| Field | Source | Set by | Purpose |
|-------|--------|--------|---------|
| `learning_path.*` | Derived | Pipeline (auto-generated) | Linearized bar sequence for runtime. Auto-generated from score; owner does not edit. |

---

### 1.2 index.json — Full Field Inventory

Every field in a `songs/index.json` entry.

| Field | Source | Ownership | Purpose |
|-------|--------|-----------|---------|
| `src` | Derived | Pipeline | Relative path to song.json: `songs/filename.json`. Stable identifier within index. |
| `label` | Derived | Pipeline | Auto-built composite string: `{title} — {time_sig} · {bpm} BPM · {bar_count} bars [· pickup] [· Key X] [· segments]` |
| `title` | Derived from `meta.title` | Pipeline | Human-readable title. `null` when meta.title is a placeholder value. |
| `composer` | Derived from `meta.composer` | Pipeline | Composer name. `null` when meta.composer is a placeholder value. |
| `level` | Derived from `meta.level` | Pipeline | Difficulty level. `null` if missing. |
| `collectionId` | Owner decision | Owner (curation) | FK into collections.json. `null` = uncollected. Preserved across reindex. |
| `listed` | Owner decision | Owner (curation) | `true` = visible in student-facing Song Browser. `false` = hidden. Default: `true` for non-test_ files. |
| `tags` | Owner decision | Owner (curation) | String array of `prefix:value` tags. Empty array by default. Preserved across reindex. |

---

### 1.3 collections.json — Full Field Inventory

#### Providers array

| Field | Purpose |
|-------|---------|
| `id` | Stable slug. Referenced by `collection.provider`. |
| `name` | Display name (admin-facing only, not shown to students). |
| `listed` | `false` = all collections from this provider are hidden from public Song Browser. |
| `requiresAssignment` | `true` = songs from this provider require teacher assignment to access. |

**Current providers:** `public-domain`, `mykey`, `licensed`

#### Collections array

| Field | Purpose |
|-------|---------|
| `id` | Stable slug. Referenced by `song.collectionId` in index.json. |
| `name` | Human-readable collection name shown in Song Browser. |
| `provider` | FK to providers array. |
| `listed` | `false` = collection hidden even if individual songs are listed. |
| `order` | Sort order in Song Browser. |
| `tags` | Collection-level tags inherited by songs unless song-level tags override. |

**Current collections:** `standalone`, `beyer-op101`, `czerny-op599`, `burgmuller-op100`, `hanon`, `duvernoy-op176`, `indonesian-folk`, `balinese-folk`, `mykey-originals`

---

## 2. Metadata Classification

### 2A — Music Metadata

Fields that originate from the musical score or notation. These are produced by MuseScore and extracted by the conversion pipeline. The owner does not set these manually — they are the song's intrinsic musical identity.

| Field | Location | Source |
|-------|----------|--------|
| `meta.title` | song.json | MuseScore score properties |
| `meta.composer` | song.json | MuseScore score properties |
| `meta.bpm` | song.json | MuseScore tempo marking |
| `meta.time_signature` | song.json | MuseScore time signature |
| `meta.key_signature` | song.json | MuseScore key signature |
| `meta.hand_mode` | song.json | Derived from number of score parts |
| `meta.active_clefs` | song.json | Derived from clef markings in score |
| `score.bars[]` (all events) | song.json | MuseScore notes, rests, articulations, dynamics |

**Note on title and composer:** Although these originate from MuseScore, MuseScore files commonly carry placeholder values ("Untitled score", "Composer / arranger"). The owner must correct them post-import. They are Music Metadata by origin but require Owner action for accuracy.

### 2B — Library Metadata

Fields that originate from the owner's content management decisions. MuseScore has no knowledge of these fields. They express how the song fits into the MyKey library and who can access it.

| Field | Location | Set by |
|-------|----------|--------|
| `meta.level` | song.json | Owner (at import or edit time) |
| `meta.part_size_bars` | song.json | Owner (at import time via CLI) |
| `meta.background_music` | song.json | Owner (post-production) |
| `meta.example_audio` | song.json | Owner (post-production) |
| `collectionId` | index.json | Owner (curation step) |
| `listed` | index.json | Owner (curation step) |
| `tags` | index.json | Owner (curation step) |
| `collection.id/name/order` | collections.json | Owner (registry setup) |
| `provider.id/name` | collections.json | Owner (registry setup) |

**Note on level:** `meta.level` is technically set via CLI argument at import time, but it is an owner decision — it represents pedagogical judgment, not something extractable from MuseScore. It belongs in Library Metadata.

### 2C — System Metadata

Fields maintained automatically by the pipeline. Owner does not set or edit these.

| Field | Location | Set by |
|-------|----------|--------|
| `meta.id` | song.json | Pipeline (slugified title) |
| `meta.freq_split_hz` | song.json | Pipeline (system constant) |
| `meta.hint_config` | song.json | Pipeline (system defaults) |
| `scoring.*` | song.json | Pipeline (system defaults) |
| `parts.*` (id, label, bars, has_pickup) | song.json | Pipeline (derived) |
| `learning_path.*` | song.json | Pipeline (auto-generated) |
| `src`, `label` | index.json | Pipeline (derived on reindex) |
| `title`, `composer`, `level` in index | index.json | Pipeline (derived from meta) |

---

## 3. Owner Workflow Audit

### 3.1 Method

The following analysis asks: if the owner is adding each confirmed song to the library, what information would they reasonably want to record? Answers are grounded in the confirmed song origins from the project handoff.

---

### 3.2 Roti Panas — Yamaha Primary 1

**Origin:** Yamaha Junior Music Course, Primary level, Book 1

| Information | Owner wants to store? | Exists in schema? |
|-------------|----------------------|-------------------|
| Title: "Roti Panas" | Yes | Yes — `meta.title` (but currently placeholder) |
| Composer: traditional / folk | Yes | Yes — `meta.composer` (but currently placeholder) |
| Difficulty: Early Beginner | Yes | Yes — `meta.level` |
| Visibility: teacher-assigned only, not public | Yes | Partially — `listed: false` handles public exclusion; `requiresAssignment` flag exists on providers but no Yamaha provider exists |
| Provider: Yamaha | Yes | **No — Yamaha not in providers** |
| Collection: Yamaha Primary 1 | Yes | **No — no Yamaha collections in collections.json** |
| Book: "Yamaha Junior Music Course" | Possibly | **No field exists** |
| Lesson number (e.g., Lesson 5) | Possibly | **No field exists** |
| Page number (e.g., Page 32) | Possibly | **No field exists** |
| Tags: genre:folk, origin:indonesia | Yes | Yes — `tags` field exists |

**Critical gap:** Yamaha provider and Yamaha collections are not registered in `collections.json`. Without them, the owner cannot assign these songs to their correct curriculum context.

---

### 3.3 Burung Kuku — Yamaha Primary 2

**Origin:** Yamaha Junior Music Course, Primary level, Book 2

| Information | Owner wants to store? | Exists in schema? |
|-------------|----------------------|-------------------|
| Title: "Burung Kuku" | Yes | Yes — `meta.title` (currently hidden as `simple_test`) |
| Composer: traditional | Yes | Yes — `meta.composer` |
| Difficulty: Early Beginner | Yes | Yes — `meta.level` |
| Provider: Yamaha | Yes | **No** |
| Collection: Yamaha Primary 2 | Yes | **No** |
| Visibility: teacher-assigned | Yes | Partially (same as above) |
| Tags: genre:folk, origin:indonesia | Yes | Yes |

**Additional note:** This song is currently trapped under the filename `simple_test.json` with `meta.title = "Untitled score"`. The schema can hold the correct metadata, but the data has not been corrected yet (LIB-010).

---

### 3.4 London Bridge — Yamaha Primary 3

**Origin:** Yamaha Junior Music Course, Primary level, Book 3

| Information | Owner wants to store? | Exists in schema? |
|-------------|----------------------|-------------------|
| Title: "London Bridge" | Yes | Yes — `meta.title` (currently `test_dotted_sharp`) |
| Composer: traditional English | Yes | Yes — `meta.composer` |
| Difficulty: Early Beginner | Yes | Yes — `meta.level` |
| Provider: Yamaha | Yes | **No** |
| Collection: Yamaha Primary 3 | Yes | **No** |
| Origin: English folk | Yes | Yes — `origin:england` tag possible |
| Language: English | Possibly | **No — no language field** |
| Visibility: teacher-assigned | Yes | Partially |

---

### 3.5 A Cuckoo — Yamaha Extension 2

**Origin:** Yamaha Junior Music Course, Extension level, Book 2

| Information | Owner wants to store? | Exists in schema? |
|-------------|----------------------|-------------------|
| Title: "A Cuckoo" | Yes | Yes — `meta.title` (currently `test_staccato_slur`) |
| Composer: traditional | Yes | Yes — `meta.composer` |
| Difficulty: Beginner or Early Beginner | Yes | Yes — `meta.level` |
| Provider: Yamaha | Yes | **No** |
| Collection: Yamaha Extension 2 | Yes | **No** |
| Visibility: teacher-assigned | Yes | Partially |

**Note:** Extension 2 is a distinct curriculum track from Primary. It is not Primary 5 — it is a parallel stream for accelerated learners. A collection ID of `yamaha-extension-2` (separate from `yamaha-primary-2`) correctly represents this distinction.

---

### 3.6 Cross-cutting observation

For all four Yamaha songs, the same pattern appears:

1. Provider "Yamaha" does not exist in `collections.json` providers.
2. Collections "Yamaha Primary 1/2/3/4" and "Yamaha Extension 2" do not exist in `collections.json`.
3. Without these, `collectionId` for Yamaha songs cannot be set to a meaningful value — there is no valid slug to assign.
4. The `requiresAssignment: true` cascade that protects Yamaha content from public browsing cannot take effect until Yamaha is registered as a provider.

This is the most actionable gap: **two data additions to collections.json** (one provider entry, five collection entries) with no schema change required.

---

## 4. Schema Compatibility Assessment

Assessment of every candidate metadata field from an owner's perspective.

| Candidate Field | Schema status | Notes |
|-----------------|---------------|-------|
| **Title** | Exists — `meta.title` in song.json | Requires owner correction of MuseScore placeholder values |
| **Composer** | Exists — `meta.composer` in song.json | Requires owner correction of MuseScore placeholder values |
| **Difficulty level** | Exists — `meta.level` in song.json | Valid values: early_beginner, beginner, intermediate, advanced |
| **Tempo (BPM)** | Exists — `meta.bpm` in song.json | Derived from MuseScore; not owner-editable |
| **Key signature** | Exists — `meta.key_signature` in song.json | Derived from MuseScore; not owner-editable |
| **Time signature** | Exists — `meta.time_signature` in song.json | Derived from MuseScore; not owner-editable |
| **Visibility (public/hidden)** | Exists — `listed` in index.json | Works correctly |
| **Collection assignment** | Exists — `collectionId` in index.json | Schema exists; Yamaha collections must be added to collections.json as data |
| **Provider** | Partially exists — provider registry in collections.json | Schema exists; Yamaha must be added as a provider entry |
| **Tags** | Exists — `tags` in index.json | Controlled vocabulary with prefix convention |
| **`requiresAssignment` access gate** | Exists — on provider in collections.json | Works once Yamaha provider entry is added |
| **Book / curriculum series name** | **Missing entirely** | No field in song.json or index.json. The collection name is the nearest proxy. |
| **Lesson number** | **Missing entirely** | No field in any file |
| **Page number** | **Missing entirely** | No field in any file |
| **Curriculum track/level** | **Missing entirely** | e.g., "Primary 1" vs "Extension 2". Collection ID encodes this, but there is no explicit curriculum-level field. |
| **Language** | **Missing entirely** | No language field. Partially covered by `origin:indonesia` tag convention. |
| **Teaching notes / description** | **Missing entirely** | No free-text annotation field for the owner to explain teaching context |
| **Example audio (song-level)** | Exists — `meta.example_audio` in song.json (null) | Awaits owner's MP3 production |
| **Example audio (part-level)** | Exists — `parts[].example_audio` in song.json (null) | Per-part audio, also null until produced |
| **Background music** | Exists — `meta.background_music` in song.json (null) | Awaits owner's MP3 production |

### Summary table

| Status | Fields |
|--------|--------|
| **Exists and works** | title, composer, level, bpm, time_signature, key_signature, hand_mode, listed, collectionId (schema), tags, requiresAssignment (schema) |
| **Schema exists, data gap only** | collectionId for Yamaha (no Yamaha collections defined), requiresAssignment for Yamaha (no Yamaha provider defined) |
| **Missing entirely** | book/curriculum name, lesson number, page number, curriculum track, language, teaching notes |

---

## 5. Recommendations

### 5.1 Minimal metadata set required for Owner workflow

These are the fields the owner needs to complete a correct publish of any Yamaha song today. No implementation is blocked — but without these, Yamaha content cannot be correctly classified.

**Action 1: Add Yamaha provider to `songs/collections.json`**

Data change only — no schema change.

```json
{
  "id": "yamaha",
  "name": "Yamaha Music Education",
  "listed": false,
  "requiresAssignment": true
}
```

This activates the `requiresAssignment` cascade that ensures Yamaha songs cannot appear in the public Song Browser regardless of individual song `listed` status.

**Action 2: Add Yamaha collections to `songs/collections.json`**

Data change only — no schema change. Suggested entries:

```json
{ "id": "yamaha-primary-1", "name": "Yamaha Primary 1", "provider": "yamaha", "listed": false, "order": 10, "tags": [] },
{ "id": "yamaha-primary-2", "name": "Yamaha Primary 2", "provider": "yamaha", "listed": false, "order": 11, "tags": [] },
{ "id": "yamaha-primary-3", "name": "Yamaha Primary 3", "provider": "yamaha", "listed": false, "order": 12, "tags": [] },
{ "id": "yamaha-primary-4", "name": "Yamaha Primary 4", "provider": "yamaha", "listed": false, "order": 13, "tags": [] },
{ "id": "yamaha-extension-2", "name": "Yamaha Extension 2", "provider": "yamaha", "listed": false, "order": 14, "tags": [] }
```

**Effect:** Once these exist, the collection dropdown in the Content Studio (authoring.html) can list all valid collections including Yamaha. The owner can assign Roti Panas to `yamaha-primary-1`, Burung Kuku to `yamaha-primary-2`, etc.

**These two actions are pure data additions. They require no schema change, no code change, and no architecture review.**

---

### 5.2 Nice-to-have metadata

These would improve owner workflow but are not blocking.

**A. Teaching notes field**

A short free-text annotation per song — e.g., "Introduce in lesson 3, after students are comfortable with C position." Useful for the owner's own reference. Not shown to students.

- Would require: one new field in index.json (`notes: string | null`) and one new optional field in song.json meta (`notes: string | null`)
- Schema impact: additive, backwards-compatible
- Display: only in Content Studio / song-manager.html; never in runtime

**B. Curriculum position field**

A structured reference to the song's position within its curriculum source — e.g., `{ "book": "Yamaha Junior Music Course Primary 1", "lesson": 5, "page": 32 }`.

- Would require: one new optional field in song.json meta (`source_ref: object | null`)
- Schema impact: additive, backwards-compatible
- Urgency: low — the collection already identifies the book; the specific lesson/page is useful for instructors but not required for playback or library display

---

### 5.3 Metadata deferred — do not implement now

These are real metadata needs that exist in other music education systems, but are premature for the current scale and scope.

| Field | Reason to defer |
|-------|----------------|
| **Language** | The `origin:` tag prefix already encodes cultural/geographic origin, which correlates with language. A separate language field adds schema complexity before the Song Browser needs language filtering. |
| **Curriculum level / grade** | The collection ID already encodes curriculum track. Adding a redundant `curriculum_level` field creates a maintenance burden with no current consumer. |
| **Lesson number / page number** | No current UI shows this to anyone (student, teacher, or admin). Useful for an eventual Teacher Dashboard, not for the Content Studio. |
| **Prerequisites** | Learning dependency graphs require a runtime feature (prerequisite gating) that does not exist. The field would have no consumer. |
| **Recommended course path** | Same as prerequisites — no consumer yet. |

---

## 6. Conclusion for Metadata Card and Library Card Design

Based on this audit, the Metadata Card and Library Card in the Content Studio can be implemented with the current schema as-is, provided the two data additions (Yamaha provider + collections) are made to `collections.json` first.

### Metadata Card — confirmed fields

These fields are sufficient and complete for the current owner workflow:

| Field | Source in song.json | UI type |
|-------|---------------------|---------|
| Title | `meta.title` | Text input (editable) |
| Composer | `meta.composer` | Text input (editable) |
| Level | `meta.level` | Dropdown (early_beginner / beginner / intermediate / advanced) |

No new schema fields are required for the Metadata Card.

### Library Card — confirmed fields

| Field | Source | UI type |
|-------|--------|---------|
| Visibility | `index.json listed` | Toggle: Listed / Hidden |
| Collection | `index.json collectionId` | Dropdown (populated from `songs/collections.json`) |
| Tags | `index.json tags` | Text input (space-separated `prefix:value` tokens, stored as string[]) |

No new schema fields are required for the Library Card.

### Pre-implementation action required

Before the Library Card collection dropdown can be implemented, `songs/collections.json` must include the Yamaha provider and Yamaha collection entries. Without this data, the dropdown cannot offer the correct options for the owner's immediate use case.

This data change is separate from code implementation and can be done at any time without a code review.
