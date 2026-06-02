# Library Audit

**Document:** `docs/song-library/library_audit.md`
**Status:** Sprint C2 — Active
**Version:** 1.0
**Date:** 2026-06-01
**Total songs audited:** 38

---

## Summary

| Class | Count | Description |
|-------|-------|-------------|
| A — Production | 1 | Ready or nearly ready for students |
| B — Test Fixture | 33 | Internal engraving/regression tests. Must stay `listed: false`. |
| C — Unknown / Needs Identity | 4 | Real musical content hidden inside test_ filenames. Needs `meta.title` fix before consideration for promotion. |

---

## Class A — Production Songs

Songs that are (or are nearly ready to be) student-facing. `listed: true`.

| # | File | Title | Collection | Listed | Notes |
|---|------|-------|------------|--------|-------|
| 1 | `0101 Roti Panas-Piano.json` | 0101 Roti Panas-Piano | `indonesian-folk` | ✅ true | **Title issue:** `meta.title` is "Untitled score" → falls back to filename stem. Needs correction before this label is cleaned up. Composer is null (placeholder). Content is verified correct. |

### Open issues for production songs

- **`0101 Roti Panas-Piano.json`:** Edit `meta.title` in the song.json to the real title (e.g., "Roti Panas") and `meta.composer` to the composer or remove the placeholder. Then re-run `update_song_index.py` to refresh the label.

---

## Class B — Test Fixtures

Internal test and audit songs. Must remain `listed: false`. Direct URL access is preserved for developer use.

### B1 — Engraving Audit Suite

Created by the MyKey engraving validation process. Verified correct notation rendering. `composer: "MyKey Engraving Audit"`.

| # | File | Title | Level | Issue |
|---|------|-------|-------|-------|
| 1 | `test_accidentals.json` | Accidental Carry Rule Test — G major | early_beginner | — |
| 2 | `test_articulations.json` | Articulation Rendering Audit — Staccato, Accent, Tenuto, Fermata | early_beginner | — |
| 3 | `test_beaming.json` | Beam Grouping Audit — 8th, 16th, Mixed, Both Clefs | early_beginner | — |
| 4 | `test_cross_system_slur_single_clef.json` | Cross-Row Slur — Single Clef ROW_H Verification | early_beginner | — |
| 5 | `test_cross_system_slurs.json` | Cross-System Slur Investigation | early_beginner | — |
| 6 | `test_dotted_notes.json` | Dotted Note Regression Test | early_beginner | — |
| 7 | `test_dynamics.json` | Dynamic Marking Audit — pp through ff | early_beginner | — |
| 8 | `test_endings.json` | Endings and Repeat Sign Audit | early_beginner | — |
| 9 | `test_key_sig_bb.json` | Key Signature Audit — Bb Major | early_beginner | — |
| 10 | `test_key_sig_c.json` | Key Signature Audit — C Major | early_beginner | — |
| 11 | `test_key_sig_d.json` | Key Signature Audit — D Major | early_beginner | — |
| 12 | `test_key_sig_f.json` | Key Signature Audit — F Major | early_beginner | — |
| 13 | `test_key_sig_g.json` | Key Signature Audit — G Major | early_beginner | — |
| 14 | `test_navigation_symbols.json` | Navigation Symbol Audit | early_beginner | — |
| 15 | `test_navigation_symbols_full.json` | Navigation Symbol Full Coverage | early_beginner | — |
| 16 | `test_octave_marks.json` | Octave Mark Rendering Audit | early_beginner | — |
| 17 | `test_pedal_markings.json` | Pedal Marking Audit | early_beginner | — |
| 18 | `test_rests.json` | Rest Rendering Audit — All Durations | early_beginner | — |
| 19 | `test_segno_placement.json` | Segno Placement Verification | early_beginner | — |
| 20 | `test_stem_direction.json` | Stem Direction Validation — Session 16 | early_beginner | — |
| 21 | `test_tempo_markings.json` | Tempo Marking Audit | early_beginner | — |
| 22 | `test_ties.json` | Tie Rendering Validation — Layer 3 | early_beginner | — |
| 23 | `test_ties_slurs.json` | Tie and Slur Rendering Audit | early_beginner | — |
| 24 | `test_tuplets.json` | Tuplet Rendering Audit | early_beginner | — |
| 25 | `test_tuplets_source.json` | Test Tuplets Source | early_beginner | — |
| 26 | `test_key_signatures.json` | Key Signature Suppression Test | early_beginner | — |
| 27 | `test_accidentals.json` *(also above)* | — | — | — |

### B2 — Linearization Test Suite

Created by the MyKey runtime linearization (repeat/navigation) test system. `composer: "MyKey Test Suite"`.

**Known issue:** All 6 have `level: "test"` — an invalid level value. `validate_song.py` will reject these. Fix: change to `"early_beginner"`.

| # | File | Title | Level | Issue |
|---|------|-------|-------|-------|
| 1 | `test_dc_al_fine_linearization.json` | Test — D.C. al Fine Linearization | ⚠️ `"test"` | Invalid level — change to `early_beginner` |
| 2 | `test_dc_linearization.json` | Test — D.C. Linearization | ⚠️ `"test"` | Invalid level — change to `early_beginner` |
| 3 | `test_ds_al_coda_linearization.json` | Test — D.S. al Coda Linearization | ⚠️ `"test"` | Invalid level — change to `early_beginner` |
| 4 | `test_ds_linearization.json` | Test — D.S. Linearization | ⚠️ `"test"` | Invalid level — change to `early_beginner` |
| 5 | `test_import_verification.json` | Test — Import Verification | ⚠️ `"test"` | Invalid level — change to `early_beginner` |
| 6 | `test_repeat_linearization.json` | Test — Repeat Linearization | ⚠️ `"test"` | Invalid level — change to `early_beginner` |
| 7 | `test_volta_linearization.json` | Test — Volta Linearization | ⚠️ `"test"` | Invalid level — change to `early_beginner` |

**Note:** `test_import_verification.json` is also in this group (composer: "MyKey Test Suite", level: "test").

### B3 — Regression Tests

Specific regression tests for individual features. `composer: "MyKey Test Suite"`.

| # | File | Title | Level | Notes |
|---|------|-------|-------|-------|
| 1 | `test_dotted_notes.json` | Dotted Note Regression Test | early_beginner | — |

---

## Class C — Unknown / Needs Identity

These files contain real musical content but use test_ filenames with no real identity in `meta.title` (placeholder "Untitled score" or similar). Their display title in the index falls back to the filename stem, making them unrecognizable.

**Status:** `listed: false`. Do NOT promote to listed until `meta.title` (and optionally `meta.composer`) is corrected.

| # | File | Current index title | Believed real content | Target collection | Action |
|---|------|---------------------|-----------------------|-------------------|--------|
| 1 | `simple_test.json` | simple_test | "Burung Kuku" (Cuckoo Clock — Indonesian folk) | `indonesian-folk` | Fix `meta.title` → "Burung Kuku". Rename file to `burung_kuku.json`. Add to KNOWN_FIXTURE_STEMS removal list. |
| 2 | `test_dotted_sharp.json` | test_dotted_sharp | "London Bridge" or similar English children's folk | — or `standalone` | Identify correct title. Fix `meta.title`. Rename file. |
| 3 | `test_pickup_bhand.json` | test_pickup_bhand | Indonesian folk ("Si Kecil Sepatu Merah" / Red Shoes) | `indonesian-folk` | Fix `meta.title`. Rename file. |
| 4 | `test_staccato_slur.json` | test_staccato_slur | "A Cuckoo" or similar folk song | — or `standalone` | Identify correct title. Fix `meta.title`. Rename file. |

### Promotion workflow for Class C songs

1. Identify the real song title and composer
2. Edit `meta.title` (and `meta.composer` if known) in the source `song.json` file
3. Rename the `.json` file to a slug matching the song title (e.g., `burung_kuku.json`)
4. Run `python tools/update_song_index.py` — the entry will update with the new title
5. Remove the old stem from `KNOWN_FIXTURE_STEMS` in `update_song_index.py` if it was there
6. Assign `collectionId` in `song-manager.html`
7. Run the pre-publish checklist from `docs/import/import_workflow.md`
8. Set `listed: true`

---

## Known Issues Register

Issues blocking production readiness of the library. Track fixes here.

| ID | Severity | File | Issue | Status |
|----|----------|------|-------|--------|
| LIB-001 | Medium | `0101 Roti Panas-Piano.json` | `meta.title` is "Untitled score" → label is filename stem | Open |
| LIB-002 | Medium | `0101 Roti Panas-Piano.json` | `meta.composer` is null (stripped placeholder) | Open |
| LIB-003 | Low | `test_dc_al_fine_linearization.json` | `level: "test"` — invalid, fails validate_song.py | Open |
| LIB-004 | Low | `test_dc_linearization.json` | `level: "test"` — invalid | Open |
| LIB-005 | Low | `test_ds_al_coda_linearization.json` | `level: "test"` — invalid | Open |
| LIB-006 | Low | `test_ds_linearization.json` | `level: "test"` — invalid | Open |
| LIB-007 | Low | `test_import_verification.json` | `level: "test"` — invalid | Open |
| LIB-008 | Low | `test_repeat_linearization.json` | `level: "test"` — invalid | Open |
| LIB-009 | Low | `test_volta_linearization.json` | `level: "test"` — invalid | Open |
| LIB-010 | Low | `simple_test.json` | Real content ("Burung Kuku") hidden behind test filename | Open |
| LIB-011 | Low | `test_dotted_sharp.json` | Real content hidden behind test filename | Open |
| LIB-012 | Low | `test_pickup_bhand.json` | Real content hidden behind test filename | Open |
| LIB-013 | Low | `test_staccato_slur.json` | Real content hidden behind test filename | Open |

---

## Audit History

| Date | Sprint | Change |
|------|--------|--------|
| 2026-06-01 | Sprint C2 | Initial audit — 38 songs classified A/B/C. Production song assigned to `indonesian-folk` collection. |
