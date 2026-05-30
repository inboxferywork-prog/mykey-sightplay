# Engraving Audit Library — MyKey Music Labs

**Location:** `docs/engraving/tests/`
**Purpose:** Visual-only audit assets for renderer completeness verification. Load each file via the normal song workflow and inspect on screen. No automated assertions.

---

## How to Use

1. Copy the desired test file into `songs/` (or configure the song loader to read from `docs/engraving/tests/`).
2. Load via `index.html`.
3. Observe each part in sequence. Check each criterion in the part label.
4. Record pass/fail findings in a session note or in `engraving-validation-checklist.md`.

---

## Tier 1 — Core Piano Learning

These test features the renderer must handle for any piano student.

| File | Key | Bars | What to verify |
|---|---|---|---|
| `test_rests.json` | C | 8 | Whole, half, quarter, eighth, sixteenth rests in both clefs. Mixed patterns. Rest position on staff (whole hangs below line 4, others sit on middle). |
| `test_ties_slurs.json` | C | 8 | Tie within measure, tie across barline, bass tie, slur over 4 notes, multiple slurs per system. Arc shape and direction. |
| `test_beaming.json` | C | 8 | 8th beam groups, 16th beam groups, mixed durations, both clefs beamed simultaneously. No beam crossing center of measure (beats 1–2 vs. 3–4). |
| `test_key_sig_c.json` | C | 4 | No accidentals on either staff. Clean key signature area. |
| `test_key_sig_g.json` | G | 4 | One sharp (F#) on treble line 5 and bass line 4. F#4 and F#3 have no inline accidental. |
| `test_key_sig_d.json` | D | 4 | Two sharps (F#, C#). Both appear on correct staff positions in treble and bass. |
| `test_key_sig_f.json` | F | 4 | One flat (Bb) on treble line 3 and bass line 2. Bb4 has no inline accidental. |
| `test_key_sig_bb.json` | Bb | 4 | Two flats (Bb, Eb). Both appear on correct positions in both clefs. |

---

## Tier 2 — Intermediate Piano Literature

These test features common in elementary-to-intermediate published scores.

| File | Key | Bars | What to verify |
|---|---|---|---|
| `test_dynamics.json` | C | 8 | pp, p, mp, mf, f, ff markings below bass staff at bar start. Crescendo hairpin bars 7–8. No collision with note stems. |
| `test_articulations.json` | C | 8 | Staccato dots above/below single notes and chords. Accent (>) glyph. Tenuto line. Fermata above note. Mixed articulations in same bar. |
| `test_tempo_markings.json` | C | 8 | Allegro ♩=120 at system start. Moderato ♩=96 mid-system. Andante and Largo in second system. Text above treble staff, left-aligned to bar. |
| `test_endings.json` | C | 8 | First volta bracket with thick repeat barline. Second volta bracket. D.C. al Fine text at bar end. |

**Note:** Tier 2 features use forward-compatible schema fields (`dynamics`, `articulations`, `tempo_text`, `volta`, `repeat_start`, `repeat_end`, `navigation`). If the renderer does not yet implement them, the notes will display without the marking — that is the audit finding.

---

## Tier 3 — Advanced

These test features in advanced repertoire and are expected to be unimplemented.

| File | Key | Bars | What to verify |
|---|---|---|---|
| `test_tuplets.json` | C | 6 | Eighth-note triplet bracket with "3" numeral. Quarter-note triplet. Continuous triplets across all beats. Tuplets in bass clef. |
| `test_octave_marks.json` | C | 6 | 8va bracket above treble (short span, full-bar span). 8vb bracket below bass. Dashed line with terminal hook. No artifact after mark ends. |
| `test_navigation_symbols.json` | C | 8 | Segno (§) glyph at bar 1. Fine text at bar 4. Coda (⊕) glyph at bar 5. D.S. al Coda and D.C. text. |
| `test_pedal_markings.json` | C | 6 | Ped glyph below bass staff at pedal_start. Asterisk (*) at pedal_stop. Multiple pedal sections. Long pedal spanning multiple bars. |

**Note:** Tier 3 features use forward-compatible schema fields (`tuplet_group`, `octave_mark_start`, `octave_mark_stop`, `segno`, `coda`, `pedal_start`, `pedal_stop`). These are NOT currently implemented in `notation-renderer.js`. The audit confirms they are missing and establishes the schema contract for future implementation.

---

## Schema Field Reference

Fields added for forward compatibility (not yet rendered):

| Field | Location | Type | Example |
|---|---|---|---|
| `dynamics` | bar object | string | `"pp"`, `"mf"`, `"ff"` |
| `dynamics_hairpin` | bar object | string | `"crescendo"`, `"decrescendo"` |
| `tempo_text` | bar object | string | `"Allegro"` |
| `tempo_bpm` | bar object | number | `120` |
| `repeat_start` | bar object | boolean | `true` |
| `repeat_end` | bar object | boolean | `true` |
| `volta` | bar object | number | `1`, `2` |
| `navigation` | bar object | string | `"D.C. al Fine"`, `"Fine"` |
| `segno` | bar object | boolean | `true` |
| `coda` | bar object | boolean | `true` |
| `tuplet_group` | event object | string | `"3:2"` |
| `octave_mark_start` | event object | string | `"8va"`, `"8vb"` |
| `octave_mark_stop` | event object | boolean | `true` |
| `pedal_start` | event object | boolean | `true` |
| `pedal_stop` | event object | boolean | `true` |

Already implemented:
| Field | Notes |
|---|---|
| `articulations: ["staccato"]` | Rendered. `"accent"`, `"tenuto"`, `"fermata"` in array are forward-compat. |
| `slur_start`, `slur_stop` | Rendered via `_drawSlurs()`. |
| `tie_start`, `tie_stop` | Rendered via `_drawStaveTies()`. |
