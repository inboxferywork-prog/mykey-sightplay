# Engraving Validation Checklist — MyKey Music Labs

**Purpose:** Visual and auditory acceptance criteria for each engraving session.  
**Scope:** Renderer output only — not a replacement for `engraving-standards.md`.  
**Test song:** `songs/test_ties.json` (16 bars, 4 parts).

> `engraving-standards.md` = architecture + semantics + implementation rules  
> This file = observable pass/fail criteria for rendered output

---

## Test Song Index

| Test song | Key | Content |
|-----------|-----|---------|
| `songs/test_ties.json` | C major | 16 bars, tie scenarios (§3), stem direction (§1), basic note durations (§6) |
| `songs/test_dotted_notes.json` | C major | 9 bars (bar 0 pickup), all dotted scenarios (§10), pickup alignment (§2.5) |
| `songs/test_dotted_sharp.json` | G major | 8 bars, 2 parts; dotted + sharp key regression (§10 + §5 F# suppression) |
| `songs/test_accidentals.json` | G major | 4 bars; key-sig suppression, natural signs, carry rules, restoration (§5) |
| `songs/test_key_signatures.json` | F major | 2 bars; flat-key Bb suppression, B natural sign, Bb restoration (§5 flat-key) |
| `songs/test_pickup_bhand.json` | C major | Pickup bar + both-hand content; pickup alignment (§2.5), cross-row (§9) |
| `songs/test_stem_direction.json` | — | Stem direction edge cases (§1) |
| `songs/test_staccato_slur.json` | F major | 8 bars; staccato single notes + chords, slur spanning beam groups (§13) — generate from `test_scores/test_staccato_slur.mxl` |

---

## How to use

Load the relevant test song (see table above) into `index.html`. Step through each section below.
Mark each item ✓ (pass) or ✗ (fail) before closing a session.
A session is complete only when all relevant sections pass.

---

## 1. Stem Direction

| # | Criterion | Where to check |
|---|-----------|----------------|
| 1.1 | Notes below middle line (B4 treble / D3 bass) have stems UP | bar1 treble: E4,F4,G4,A4 — all stem up |
| 1.2 | Notes on or above middle line have stems DOWN | bar7: E5, D5 — stems down |
| 1.3 | Chord stem direction determined by notehead furthest from middle line | bar6: [C4,E4] chord — E4 further from B4 than C4, stem up |
| 1.4 | Stem direction is NOT overridden by tie state | Tied E4 at bar3beat1 keeps same stem as non-tied notes |
| 1.5 | Post-format stem directions hold (VexFlow Formatter does not reset them) | Inspect bar2–bar4: each E4 stem matches rule even after beam grouping |

---

## 2. Beam Grouping

| # | Criterion | Where to check |
|---|-----------|----------------|
| 2.1 | Eighth notes on the same beat are beamed together | `test_dotted_notes.json` bar 5: four 8.+16 beam pairs |
| 2.2 | No beams cross beat boundaries in 4/4 | Beat 1+2 stay separate from beat 3+4 |
| 2.3 | Beamed group stem direction uses furthest-note rule for the group | All noteheads in beam group share one stem direction |
| 2.4 | Individual flags suppressed on beamed notes | No flag appears on a note that is part of a beam |
| 2.5 | Pickup bars align notes at correct temporal position | `test_pickup_bhand.json` and `test_dotted_notes.json` bar 0 |

---

## 3. Tie Correctness

### 3a. Visual arcs

| # | Criterion | Expected result | Where to check |
|---|-----------|-----------------|----------------|
| 3.1 | Single-note tie across bar line draws one arc | bar2beat4 → bar3beat1: E4 arc ✓ | Part 1 row |
| 3.2 | Chain tie draws two arcs across three notes | bar2→bar3 + bar3→bar4: two E4 arcs ✓ | Part 1 row |
| 3.3 | Chain-tie middle note (tie_stop+tie_start) is a whole note with no rest after | bar3: E4 whole note, no rest event in treble | Part 1 row |
| 3.4 | Chord tie draws **one arc per tied notehead** | bar6→bar7: two arcs, one for C4 and one for E4 | Part 2 row |
| 3.5 | No arc when intervening melodic note breaks the tie | bar10beat2 E4(tie_start) → bar10beat3 G4 → no arc to bar11 | Part 3 row |
| 3.6 | No arc when a rest appears between tie_start and tie_stop | (Validated by absence: any tie with rest between = no arc) | — |
| 3.7 | No arc for long-range same-pitch match skipping different pitches | bar13beat4 E4(tie_start) → bar14beat1 F4 → no arc to bar14beat4 | Part 4 row |
| 3.8 | Valid tie with tie_start at note whose duration fills to bar end draws correctly | bar15beat3 E4 half → bar16beat1 E4: arc ✓ | Part 4 row |
| 3.9 | No spurious half-tie artifacts when a pending tie is invalidated | No dangling arc anywhere in Parts 3 and 4 | Parts 3–4 rows |
| 3.10 | Cross-row tie draws half-arc at end of row + half-arc at start of next row | (Not in test_ties.json — verify in songs long enough to span rows) | — |

### 3b. Arc count summary

| Part | Bars | Expected arc count | Pitches |
|------|------|--------------------|---------|
| Part 1 | 2→3, 3→4 | 2 | E4, E4 |
| Part 2 | 6→7 | 2 | C4, E4 (one each) |
| Part 3 | none | 0 | — |
| Part 4 | 15→16 | 1 | E4 |

---

## 4. Playback Semantics

| # | Criterion | Expected behavior | Where to check |
|---|-----------|-------------------|----------------|
| 4.1 | Tied continuation notes do NOT re-attack | Press play: bar3beat1, bar4beat1 are silent attacks | Part 1 |
| 4.2 | Chain tie middle note (tie_stop+tie_start) is silent | bar3beat1 E4 whole: no new sound heard | Part 1 |
| 4.3 | Non-tied repeated notes DO re-attack | bar9: four E4 quarters each sound separately | Part 3 |
| 4.4 | Note after an invalidated tie DOES attack | bar11beat1 E4 (tie was broken by G4): sound ✓ | Part 3 |
| 4.5 | Note after a long-range invalid tie DOES attack | bar14beat4 E4 (tie was broken by F4): sound ✓ | Part 4 |
| 4.6 | Chord tied continuation is fully silent (all pitches) | bar7beat1 [C4,E4]: no attack | Part 2 |
| 4.7 | Rest events produce no sound | All whole rests in bass: silence | All rows |

**Key invariant:** `tie_stop: true` in song.json is the authoritative playback-suppression flag.  
It must only be set on notes that are genuinely valid tied continuations.  
If the renderer rejects a tie (adjacency/rest rule), the note's `tie_stop` must be `false`.

---

## 5. Accidental Behavior

### 5a. Sharp key — `songs/test_accidentals.json` (G major, 4/4, 4 bars)

| # | Criterion | Where to check |
|---|-----------|----------------|
| 5.1 | Key-signature notes show NO accidental (e.g., F# in G major) | bar 1 treble ev_000001 (F#4) and ev_000003 (F#5): no sharp symbol shown |
| 5.2 | Key-signature note in bass shows NO accidental | bar 1 bass ev_000006 (F#3): no sharp symbol |
| 5.3 | Carry rule: same pitch repeated in measure shows NO repeat accidental | bar 1: second F# (after first F# already established key-sig state) — no sharp |
| 5.4 | Chromatic deviation from key signature shows explicit accidental | bar 4 ev_000025 (Bb4 in G major): flat shown |
| 5.5 | Carry rule: repeated accidental within bar not shown again | bar 4 ev_000026 (second Bb4): no flat |
| 5.6 | Natural sign shown when note cancels key-signature accidental | bar 2 ev_000009 (F4 natural in G major): natural sign shown |
| 5.7 | Natural carry: second natural of same pitch in bar shows no repeat natural sign | bar 2 ev_000011 (second F4): no natural sign |
| 5.8 | Restoration after natural: key-sig pitch shows sharp to restore | bar 3 ev_000017 (F4 natural) then ev_000018 (F#4): F#4 shows '#' |
| 5.9 | Bar-boundary reset: accidental state fresh at each new bar | F# state carries within bar 1 but resets for bar 2 (where F natural triggers 'n') |
| 5.10 | C major songs show no key-sig accidentals (no change from prior behaviour) | test_ties.json, test_dotted_notes.json: C major, no accidentals expected |
| 5.11 | Accidentals do not shift notehead x-positions unexpectedly | Visual check: note spacing looks regular after accidentals |

### 5b. Flat key — `songs/test_key_signatures.json` (F major, 4/4, 2 bars)

F major key signature: B♭ (one flat). Expected accidental state: `B: 'b'` at bar start.

| # | Criterion | Where to check |
|---|-----------|----------------|
| 5.12 | Bb notes at key-sig default show NO flat symbol (bass bar 1 + treble bar 2 beat 1) | ev_000008 (Bb2 bass bar 1): no 'b' shown; ev_000009 (Bb4 treble bar 2): no 'b' shown |
| 5.13 | B natural cancels flat key-sig → natural sign shown | ev_000001 (B4 treble bar 1 beat 1): 'n' shown |
| 5.14 | Bb after B natural within bar shows 'b' (restoration) | ev_000004 (Bb4 treble bar 1 beat 4): 'b' shown (state was '' after B natural) |
| 5.15 | Bar-boundary reset in flat key: bar 2 opens with Bb → no marker (key-sig) | ev_000009 (Bb4 treble bar 2 beat 1): no marker — state reset to B:'b' at new bar |
| 5.16 | B natural in bar 2 again shows 'n' (independent of bar 1) | ev_000010 (B4 treble bar 2 beat 2): 'n' shown |
| 5.17 | Bb restoration in bar 2 shows 'b' | ev_000011 (Bb4 treble bar 2 beat 3): 'b' shown |

---

## 6. Note Duration Rendering

| # | Criterion | Where to check |
|---|-----------|----------------|
| 6.1 | Whole note renders as hollow head, no stem | bar3 E4 whole: hollow notehead, no stem |
| 6.2 | Half note renders as hollow head with stem | — |
| 6.3 | Quarter note renders as filled head with stem | bar1, bar2: all filled noteheads |
| 6.4 | Eighth note renders as filled head with flag or beam | — |
| 6.5 | Note duration does not overflow its bar's beat count | bar8: beat1(G4 q) beat2(F4 q) beat3(E4 q) beat4(C4 q) — 4 beats total |
| 6.6 | Dotted durations render with the dot to the right of the notehead | — |

---

## 7. Rest Rendering

| # | Criterion | Where to check |
|---|-----------|----------------|
| 7.1 | Whole rest hangs from the fourth staff line | Bass stave: whole rest bars visible |
| 7.2 | Half rest sits on the third staff line | — |
| 7.3 | Quarter rest renders as squiggle symbol | — |
| 7.4 | Rests do not appear in place of notes for events with `type: "note"` | Verify note events are never rendered as rests |
| 7.5 | Implicit whole rest inserted when a stave has no events for a bar | Bass stave bars 1–4 in Part 1: whole rest shown |

---

## 8. Spacing and Layout

| # | Criterion | Where to check |
|---|-----------|----------------|
| 8.1 | All bars in a row are justified to the canvas width | Full rows: bars span edge to edge |
| 8.2 | Partial rows (last row with fewer bars) scale proportionally | If test song has fewer bars than barsPerRow on last row |
| 8.3 | Trailing barline has 10% optical margin (notes don't flush to bar edge) | Visual: last note in bar has breathing room before barline |
| 8.4 | Treble and bass noteheads on the same beat share the same x-position | bar5: C4+C3, D4+D3 etc. — noteheads vertically aligned per beat |
| 8.5 | No note or rest overflows into adjacent bar | bar8: C4 quarter at beat4, not overlapping bar9 |

---

## 9. Cross-Row Rendering

| # | Criterion | Where to check |
|---|-----------|----------------|
| 9.1 | System bracket or brace connects treble and bass staves per row | Left edge of each row |
| 9.2 | Ties that cross a row boundary draw two half-arcs | (Verify when adding longer songs — not in current test_ties.json) |
| 9.3 | The first bar of each row shows clef symbol | All rows begin with treble/bass clef |
| 9.4 | Key signature shown on first bar of each row (if non-C) | C major = no accidentals shown |
| 9.5 | Time signature shown on first bar only | 4/4 appears once per song, not repeated on row 2+ |

---

## 10. Layer 3 — Dotted Note Validation

**Test song:** `songs/test_dotted_notes.json` (9 bars: bar 0 pickup + bars 1–8)

| Bar | Content | What it tests |
|-----|---------|---------------|
| 0 | Dotted quarter pickup (G4) | Ghost-note alignment: 2.5 QL of ghosts pad before the dotted quarter |
| 1 | Dotted quarter + eighth × 2 | Standard q.+8 rhythm; bar fills to exactly 4 QL |
| 2 | Dotted half treble + bass | h. on both staves simultaneously; grand-staff alignment |
| 3 | Dotted quarter rest + dotted quarter note; dotted half rest bass | Dotted rests in treble and bass |
| 4 | Dotted quarter chords [E4,G4,B4] and [F4,A4,C5] | Dot attachment on multi-notehead chords |
| 5 | Dotted eighth + sixteenth × 4 beats (beamed pairs) | Beaming with dotted 8th; beat-boundary grouping correctness |
| 6 | Quarter + dotted half tie_start; bass dotted half | Cross-bar dotted tie source; simultaneous treble/bass dotted |
| 7 | Dotted half tie_stop + bass dotted half | Cross-bar tie completion; treble+bass dotted combo |
| 8 | Treble dotted half + quarter; bass dotted half + quarter | Grand-staff dotted half simultaneous final |

| # | Criterion | Where to check |
|---|-----------|----------------|
| 10.1 | Dotted quarter note renders with visible augmentation dot to the right of notehead | bar 1: C5 q., E5 q. |
| 10.2 | Dotted half note renders with visible augmentation dot | bar 2: G5 h., C3 h. |
| 10.3 | Dotted rest renders with augmentation dot (not missing, not doubled) | bar 3: q. rest treble, h. rest bass |
| 10.4 | Dotted chord: all noteheads receive an augmentation dot | bar 4: [E4,G4,B4] q. chord — all 3 noteheads dotted |
| 10.5 | Dotted note in beam group: beam line connects correctly; dot does not clip beam | bar 5: G4 8. beamed with A4 16 |
| 10.6 | Each beat in bar 5 produces one beam pair (dotted 8th + 16th) — 4 separate pairs total | bar 5: no cross-beat beaming; 4 distinct beam brackets |
| 10.7 | Dotted pickup bar: note aligns at temporal position 2.5 beats in from left edge | bar 0: G4 q. sits visually near the right half of the stave, not at left edge |
| 10.8 | Dotted cross-bar tie: arc drawn from dotted half tie_start to tie_stop in next bar | bar 6 → bar 7: D5 h. tie arc visible |
| 10.9 | Grand-staff dotted halfs vertically aligned: treble and bass notes at same beat share x-position | bar 2: G5 and C3 noteheads at same x; bar 8: G4 and G2 at same x |
| 10.10 | Bar spacing: bars with dotted content are slightly wider than comparable undotted bars | Compare bar 2 (h. content) width vs a plain quarter-note bar |
| 10.11 | Playback: dotted durations attack at correct t_ms (already covered by runtime-engine tests) | Informational — not a renderer check |

---

## 11. Session Sign-off Template

Copy this block into DEVLOG after each engraving session:

```
### Validation Checklist Sign-off — Session N

| Section | Status | Notes |
|---------|--------|-------|
| 1. Stem direction | ✓ / ✗ | |
| 2. Beam grouping | ✓ / ✗ | |
| 3. Tie correctness | ✓ / ✗ | |
| 4. Playback semantics | ✓ / ✗ | |
| 5. Accidentals | ✓ / ✗ | |
| 6. Note durations | ✓ / ✗ | |
| 7. Rest rendering | ✓ / ✗ | |
| 8. Spacing/layout | ✓ / ✗ | |
| 9. Cross-row | ✓ / ✗ | |
| 10. Dotted notes | ✓ / ✗ | |
| 13. Articulations and slurs | ✓ / ✗ | |
| 20. Keyboard synchronization | ✓ / ✗ | |
| 21. Playback sustain and silence | ✓ / ✗ | |
| 22. Scrolling and layout stability | ✓ / ✗ | |
| 23. Presentation layer separation | ✓ / ✗ | |
| 24. Runtime lifecycle | ✓ / ✗ | |

Remaining known issues: [list any ✗ items with DEVLOG reference]
```

---

## 12. Engineering Invariants

Lessons derived from Sessions 18–31. These are non-negotiable constraints.  
Violating them has caused regressions. Any future tie or renderer work must honour all of them.

### 11a. VexFlow 5.0.0 compiled bundle facts

| Fact | Impact |
|------|--------|
| Constructor keys use camelCase: `firstNote`, `lastNote`, `firstIndices`, `lastIndices` | Using snake_case silently fails — no arc drawn, no error |
| `note.getYs()` only contains the first notehead's y for a chord | `getYs()[n > 0]` is `undefined` → NaN → `renderTie()` throws silently |
| `renderTie()` throws `RuntimeError('Bad indices')` on NaN y-values | Swallowed by `catch (_) {}` — invisible failure, not a draw failure |
| `setStave()` and `setYs()` write to the note's internal `ys` array | Mutating it after draw corrupts ALL subsequent tie-position calculations globally |
| Compiled bundle behaviour differs from master-branch TypeScript source | Do not read the GitHub TS source as the authoritative API reference for 5.0.0 |

### 11b. Tie subsystem constraints

| Constraint | Why |
|------------|-----|
| Do NOT call `note.setStave()` globally before `_drawTies` | Mutates note geometry — tie arcs shift globally (Session 25 regression A) |
| Do NOT call `note.setYs()` to patch chord notehead y-values | `stave.getYForLine()` diverges from VexFlow's internally rendered positions (Session 25 regression B) |
| Use `_noteHeadProxy` for chord notehead indices > 0 | Reads `NoteHead.getY()` without mutating `ys` — only safe approach |
| `tie_stop: true` in JSON → BOTH no-arc AND no-audio | If renderer rejects a tie visually, the JSON `tie_stop` must also be `false` |
| `catch (_) {}` in StaveTie draw hides real errors | During debugging: replace with `catch (e) { console.warn(...) }` to expose throws |

### 11c. General renderer safety rules

| Rule | Derived from |
|------|-------------|
| **Visual output is the final authority** — logs saying "N arcs drawn" do not prove N arcs are visible | Sessions 23–25: two consecutive fixes appeared to work by log but showed only 1 arc visually |
| **Never apply global geometry changes to fix an isolated issue** | setStave/setYs regressions affected every tie on the page, not just the chord |
| **Isolated duck-typed proxies are safer than patching VexFlow internals** | `_noteHeadProxy` proves the pattern: read from the right source, return only what StaveTie needs |
| **Engraving and playback semantics must stay synchronized** | A tie rejected visually must also not silence the note in audio |

---

## 13. Validation — Articulations and Slurs

*Schema established Session 32. Staccato rendering implemented Session 34. Staccato playback implemented Session 33.*

**Test source:** `songs/test_staccato_slur.json` (generated from `test_scores/test_staccato_slur.mxl` — F major, 2/4, 8 bars)

### 13a. Staccato rendering — ✓ Session 34

**Implementation:** `notation-renderer.js` `_buildNotes` — `note.addModifier(new VF.Articulation('a.'), 0)` when `ev.articulations?.includes('staccato')`. VexFlow reads stem direction at `draw()` time; placement auto-resolves opposite stem.

| # | Criterion | Where to check | Status |
|---|-----------|----------------|--------|
| 13.1 | Staccato dot appears above the notehead when stem is down | Bar 1, 2 treble: D5 (stem-down) — dot above | Verify visually |
| 13.2 | Staccato dot appears below the notehead when stem is up | Bar 1, 2 treble: A4 (stem-up) — dot below | Verify visually |
| 13.3 | Staccato on chord: one dot per chord, not per notehead | Bar 1 bass: [D3,A3] chord — single dot (not two) | Verify visually |
| 13.4 | Staccato on beamed notes: each beamed note gets its own dot | No beamed+staccato in current test file | Pending beamed test |
| 13.5 | Staccato dot does not shift notehead x-positions | Visual check: bar spacing unchanged vs pre-staccato render | Verify visually |
| 13.6 | Staccato does not appear on notes without `"articulations"` field | Bar 3 treble beamed A4–G4–F4–G4 (slur only): no dots | Verify visually |

### 13b. Staccato playback

| # | Criterion | Where to check |
|---|-----------|----------------|
| 13.7 | Staccato note audibly shorter than non-staccato note of same duration | Compare bar 1 treble D5 (staccato quarter) vs bar 8 treble D4 (plain half) |
| 13.8 | Timeline events dispatch at same t_ms regardless of staccato | Stage 3 progress bar: staccato D5 still occupies full quarter-note grid position |
| 13.9 | Scoring windows unchanged by staccato | Gameplay evaluates timing at t_ms same as any note |

### 13c. Slur rendering — ✓ Session 36

**Implementation:** `notation-renderer.js` `_drawSlurs()` method + module-level `_drawSlurPath()`. Pair-walking algorithm: walks events in bar order, pairs `slur_start` → `slur_stop` per clef. Same-system restriction via `Math.floor(stave.getY() / 210)`. Direction: stem-up → arc below noteheads (dir=+1), stem-down → arc above (dir=-1). Lens shape: two cubic Bezier curves closed + filled, THICK=2.2 px, height = clamp(10, span×0.13, 22).

| # | Criterion | Where to check | Status |
|---|-----------|----------------|--------|
| 13.10 | Slur arc drawn from `slur_start` note to `slur_stop` note | Bar 3 A4 → bar 4 A4: arc visible | Verify visually |
| 13.11 | Slur arc on stem-up notes bows BELOW noteheads (opposite stem) | Bar 3–4: A4 stem-up — arc below noteheads | Verify visually |
| 13.12 | Slur spans multiple notes and a barline | Bar 3 beat 1 → bar 4 beat 1: arc crosses the barline | Verify visually |
| 13.13 | Slur spanning a row break produces two half-arcs | Cross-system slurs silently skipped — deferred | Pending cross-system test |
| 13.14 | All notes under the slur still attack individually | Play bars 3–4: every note sounds (unlike a tie chain) | Verify audibly |
| 13.15 | No slur arc drawn on non-slur events or bass stave | Bass stave has no slur flags — no arc | Verify visually |

### 13e. Layer 3 Corpus Scope — Validation Boundaries (Session 38 Freeze)

**Current supported validation scope:**

| Feature | Supported | Test song |
|---------|-----------|-----------|
| Staccato single notes | ✓ | `test_staccato_slur.json` bars 1–2, 5–6 treble |
| Staccato chords | ✓ | `test_staccato_slur.json` bars 1–7 bass |
| Staccato playback (50% sustain) | ✓ | Audible comparison |
| Slur same-staff same-system | ✓ | `test_staccato_slur.json` bars 3–4, 7–8 treble |
| Slur spanning barline | ✓ | `test_staccato_slur.json` bars 3→4, 7→8 |
| Slur arc below stem-up notes | ✓ | A4 notes (stem-up) in test file |
| Staccato + slur coexistence | ✓ (different bars) | Both features present in same song |

**Known non-goals (do NOT add to this checklist without scope approval):**

| Feature | Status |
|---------|--------|
| Staccato on beamed notes | Criterion 13.4 pending — no beamed+staccato in current test file |
| Cross-system slurs (two half-arcs) | Silently skipped — deferred |
| Nested slurs | Not implemented |
| Slur playback shaping (legato audio) | Out of scope for MVP |
| Slur collision avoidance (vs. articulation, beam) | Not implemented |
| Tenuto, accent, marcato rendering | Deferred articulations |
| Fermata | Requires runtime-engine extension |

**Regression checklist for new MusicXML files:**

Before adding a new test song to this checklist, verify:

| Check | Expectation |
|-------|-------------|
| New song staccato notes | `duration_ms` unchanged; dot visible; timing grid unchanged |
| New song slur arcs | No attack suppression; arc visible; no tie behavior |
| New song with both slur and tie on same note | Slur arc AND note silencing are both correct independently |
| Bar spacing | Unchanged by presence of slur or staccato |
| Existing test songs | All prior § pass unchanged after adding new song |

### 13d. General articulation and slur invariants

| # | Criterion | Symbol | Playback implication |
|---|-----------|--------|---------------------|
| 13.16 | Tenuto: horizontal line above or below notehead opposite stem | — | Full sustained note-off |
| 13.17 | Accent: > symbol | > | Louder attack velocity |
| 13.18 | Fermata: oval with dot over/under note or rest | 𝄐 | Timeline pause required |
| 13.19 | Marcato: ^ symbol | ^ | Very strong accent |
| 13.20 | Articulations do not overlap with beam lines or tie arcs | — | Visual clearance check |

---

## 14. Future Validation — Dynamics

*Deferred. Not yet implemented. Criteria documented here for when dynamic rendering is added.*

| # | Criterion | Where to check |
|---|-----------|----------------|
| 13.1 | Dynamic markings appear below the staff for both treble and bass | p, mf, f, ff — always below stave |
| 13.2 | Dynamic haircresc rendered as opening wedge | `<` shape from left to right |
| 13.3 | Dynamic hairdim rendered as closing wedge | `>` shape from left to right |
| 13.4 | Sudden dynamic change (p → f) has correct onset alignment | Onset x matches the note it applies to |
| 13.5 | Dynamics do not overlap with articulation symbols or slurs | Visual clearance from other markings |

---

## 15. Future Validation — Ornaments and Grace Notes

*Deferred. Not yet implemented. Criteria documented here for when ornament rendering is added.*

| # | Criterion | Notes |
|---|-----------|-------|
| 14.1 | Grace note: small notehead with slash, before the primary note | Acciaccatura — no rhythmic value |
| 14.2 | Appoggiatura: small notehead without slash | Takes rhythmic value from the following note |
| 14.3 | Trill: `tr` symbol with optional wavy line extension | No playback implication in MVP (educational display only) |
| 14.4 | Turn and mordent symbols display correctly | Per Gould §16 |
| 14.5 | Grace notes do not disturb spacing of regular notes | Verify bar layout stability |

---

## 16. Future Validation — Pedal Markings

*Deferred. Not yet implemented. Criteria documented here for when pedal notation is added.*

| # | Criterion | Notes |
|---|-----------|-------|
| 15.1 | Sustain pedal: Ped symbol at onset | Below bass stave |
| 15.2 | Pedal release: asterisk `*` or bracket end | Correct x-alignment to release event |
| 15.3 | Bracket-style pedal: horizontal line with dips for changes | Alternative notation for modern engraving |
| 15.4 | Pedal markings do not overlap with bass articulations | Visual clearance |

---

## 17. Future Validation — Tuplets

*Deferred. Not yet implemented. Criteria documented here for when tuplet rendering is added.*

| # | Criterion | Notes |
|---|-----------|-------|
| 16.1 | Triplet: three notes under/over a `3` bracket | Standard simple triplet |
| 16.2 | Tuplet number appears centred over the bracket | Not clipped by barline |
| 16.3 | Tuplet bracket spans only the tuplet group | Does not bleed into adjacent notes |
| 16.4 | Tuplet notes beam correctly within the group | Triplet 8ths: all three beamed together |
| 16.5 | Tuplet stem directions consistent with surrounding context | Uses furthest-note rule per group |
| 16.6 | Playback: tuplet notes fit within their nominal beat duration | Three quarter-triplets fit in one 4/4 beat |

---

## 18. Future Validation — Multi-voice

*Deferred (voice 1 only in MVP). Criteria documented here for future multi-voice support.*

| # | Criterion | Notes |
|---|-----------|-------|
| 17.1 | Voice 1: stem up; Voice 2: stem down (when both present in a stave) | Standard two-voice convention |
| 17.2 | Rests in non-primary voice positioned correctly | Voice 2 rests shifted off middle line |
| 17.3 | Notes in different voices at the same beat are horizontally aligned | Shared x-position per beat |
| 17.4 | Ties in voice 2 do not interfere with voice 1 tie arcs | Separate arc curves, no visual crossing |
| 17.5 | Playback: voice 1 and voice 2 sound simultaneously | Both voices play at the same t_ms |

---

## 19. Future Validation — MusicXML Import

*Criteria for validating that `tools/mxl_to_song.py` → `song.json` pipeline produces correct output.*

| # | Criterion | How to check |
|---|-----------|--------------|
| 18.1 | Ties imported correctly: `tie_start` and `tie_stop` match tied note pairs | Inspect song.json; confirm renderer draws expected arcs |
| 18.2 | Grace notes preserved in JSON (or explicitly skipped with warning) | Check generator output for grace note events or warning messages |
| 18.3 | Pickup bar detected: `has_pickup: true` in first part | Verify first bar is shorter than a full measure |
| 18.4 | Multi-voice warning issued when voice 2+ is present | Check generator console output |
| 18.5 | Dotted durations exported with trailing `.` suffix | `"q."`, `"h."` etc. in song.json duration fields |
| 18.6 | Chord events export all pitches in `notes` array | `["C4","E4"]` — both pitches present, order consistent |
| 18.7 | Tempo changes mid-song reflected in correct `t_ms` values | Compare expected beat positions at each tempo region |

---

## 20. Keyboard Synchronization Regression

*Implemented Sessions 40–42. Regression baseline established Session 44.*

**How to test:** Play any two-hand test song with clef filter = 'both'. Watch the piano keyboard widget below the score.

| # | Criterion | Where to check |
|---|-----------|----------------|
| 20.1 | Key lights up (in hand color) when a note event enters | Treble note: blue key. Bass note: warm key. |
| 20.2 | Key extinguishes when a note event exits | Key returns to unlit state after note duration elapses |
| 20.3 | Simultaneous treble + bass notes: both keys lit independently, each in their clef color | Both staves have active notes → two keys lit simultaneously in different colors |
| 20.4 | Re-attack flash: repeated same-pitch note triggers brief opacity dip | Play test_ties.json bar 9 (four consecutive E4 quarters): each re-attack produces a visible flash |
| 20.5 | No re-attack flash for tie continuation (tie_stop: true) | Play test_ties.json bar 3: tied E4 continuation — no opacity flash |
| 20.6 | Clef filter 'treble': only treble events light keys | Switch to treble-only: bass notes no longer appear on keyboard |
| 20.7 | Clef filter 'bass': only bass events light keys | Switch to bass-only: treble notes no longer appear on keyboard |
| 20.8 | Stop / reset: all keys clear immediately (no stale highlights) | Click reset mid-playback: keyboard goes dark within one tick |
| 20.9 | Middle C (MIDI 60) shows "C4" text label at bottom of the key | Visible at idle state and while the key is lit |
| 20.10 | Keyboard range covers at least the full pitch range of the loaded song | Load test song, confirm all notes appear as available keys |

---

## 21. Playback Sustain and Silence Regression

*Staccato: Sessions 33–35. Tie silence: Sessions 18–22. Keyboard suppression: Session 42. Baseline established Session 44.*

**How to test:** Play relevant test songs and listen carefully to note attacks and durations.

| # | Criterion | Where to check |
|---|-----------|----------------|
| 21.1 | Staccato notes audibly shorter than written duration (~50% sustain) | test_staccato_slur.json bar 1: staccato D5 vs non-staccato notes — audible shortening |
| 21.2 | Non-staccato notes sustain for full written duration | test_ties.json bar 1: quarter notes each sustain a full beat |
| 21.3 | Tie-continuation notes (tie_stop: true) produce no re-attack | test_ties.json bar 3: E4 whole note at chain-tie middle — silent |
| 21.4 | First note of a tie (tie_start: true) produces a normal attack | test_ties.json bar 2 beat 4: E4 quarter — clearly heard |
| 21.5 | Non-tied repeated notes each produce an audible separate attack | test_ties.json bar 9: four E4 quarters — four separate sounds |
| 21.6 | Rest events produce no sound | Bass stave bars with whole rests: silence |
| 21.7 | Filtered-clef events produce no audio | Clef filter = 'treble': bass notes inaudible |
| 21.8 | Staccato `duration_ms` field in song.json is unchanged by playback | Inspect browser console: no `duration_ms` mutation warnings |

---

## 22. Scrolling and Layout Stability

*Implemented Session 41–42. Baseline established Session 44.*

**How to test:** Load a multi-part song (4+ bars), play through multiple bars, observe scroll behavior and keyboard position.

| # | Criterion | Where to check |
|---|-----------|----------------|
| 22.1 | Each bar scrolls into view as playback reaches it | The active bar is always visible in the score card |
| 22.2 | Full grand staff (both treble and bass staves) visible after auto-scroll | Bass stave not clipped at bottom of score card |
| 22.3 | Piano keyboard remains pinned at bottom of viewport during score scrolling | Keyboard does not scroll away; score scrolls above it |
| 22.4 | Page-level scroll does not occur during playback | `body` has `overflow: hidden`; only `.score-card` scrolls internally |
| 22.5 | Clef filter change does not reset scroll position | Switch filter mid-playback: score position unchanged |
| 22.6 | Part selection (clicking parts bar) scrolls score back to bar 1 of selected part | Part change resets score scroll; keyboard clears |
| 22.7 | Score layout is identical before and after clef filter toggle | All notation, spacing, and engraving unchanged by filter state |

---

## 23. Presentation Layer Separation Audit

*Architectural boundary established Session 39, formalized Session 44.*

**How to test:** Visual inspection + code audit. Run after any session that touches `index.html`, `learning-state.js`, or `keyboard-viz.js`.

| # | Criterion | How to verify |
|---|-----------|----------------|
| 23.1 | No note-name annotation labels appear during playback | Play any song: no floating text labels visible over noteheads |
| 23.2 | No annotation UI controls present in the page | Inspect page: no Sembunyikan / C D E / Do Re Mi buttons |
| 23.3 | `src/note-label-overlay.js` does not exist in the repository | `ls src/` — file absent |
| 23.4 | Notation output is identical regardless of clef filter state | Toggle filter mid-render: no spacing, stem, or layout changes |
| 23.5 | Treble hand-color is #4a9eff (blue) in all active highlight states | Inspect DOM or CSS: `.nk-active-treble` elements are blue |
| 23.6 | Bass hand-color is #e06830 (warm orange-red) in all active highlight states | Inspect DOM or CSS: `.nk-active-bass` elements are warm |
| 23.7 | Learning controls row is visible only for two-hand songs (`hasBothClefs === true`) | Load a single-clef song: learning row hidden |
| 23.8 | Clef filter button selection reflects actual `LearningModeState.clefFilter` value | Toggle buttons: active button matches state; no ghost selection |
| 23.9 | No `getNoteElement` method exists on `NotationRenderer` | Code search: absent from `notation-renderer.js` |
| 23.10 | `_noteElMap` is not accessed outside `notation-renderer.js` | Code search: no references in `index.html`, `learning-state.js`, `keyboard-viz.js` |

---

## 24. Runtime Lifecycle Regression

*Established Session 45. These criteria verify deterministic runtime behavior — the foundation required before adding Stage 2 gameplay.*

**Purpose:** Future gameplay systems depend on predictable enter/exit ordering, seek/stop semantics, and tempo scaling. If any of these break, scoring and hint systems will malfunction.

**How to test:** Play `songs/test_ties.json` (4 parts, 16 bars) and `songs/test_staccato_slur.json` (1 part, 8 bars) while observing progress bar, keyboard, highlights, and audio.

### 24a. play() Behavior

| # | Criterion | How to verify |
|---|-----------|---------------|
| 24.1 | Fresh play from idle starts at bar 1 of selected part | Click Play from idle: progress bar at 0%, first bar highlighted |
| 24.2 | play() after pause() resumes from exact position (no skip back, no jump forward) | Pause mid-bar, resume: highlight continues from same note |
| 24.3 | play() after ended state starts fresh (not resume) | Let song end, click Play: starts from bar 1 again |
| 24.4 | Part selection before play() correctly scopes playback | Select Part 2, play: starts at Part 2 bar 1; ends at Part 2 last bar |
| 24.5 | Tempo scale is applied at play() start and honored throughout | Select Easy (0.5×): notes visibly slower; audio attacks at correct musical positions |

### 24b. pause() Behavior

| # | Criterion | How to verify |
|---|-----------|---------------|
| 24.6 | pause() freezes playhead — highlighted note remains lit | Click Pause: active note highlight stays; no flicker or clear |
| 24.7 | pause() does NOT fire onEventExit for active events | Highlighted note stays lit; keyboard key stays lit |
| 24.8 | pause() preserves progress bar position exactly | Pause at ~50%: bar stays at ~50%; no drift |
| 24.9 | Audio does not continue after pause() | No oscillator or note sound heard after pause |

### 24c. stop() / Reset Behavior

| # | Criterion | How to verify |
|---|-----------|---------------|
| 24.10 | stop() clears all SVG highlights (manual clearAll) | Click Reset: no highlighted notes remain in score |
| 24.11 | stop() clears keyboard visualization | Click Reset: all piano keys go dark |
| 24.12 | stop() resets progress bar to 0% | Click Reset: progress bar returns to left edge |
| 24.13 | stop() does NOT fire onEventExit callbacks (by design) | stop() leaves presentation cleanup to ui-shell; clearAll() is called separately |
| 24.14 | tempoScale resets to 1.0 after stop() only if runtime resets it | Verify: stop() → check tempo buttons (Andante should reflect default tempo) |

### 24d. seek() Behavior

| # | Criterion | How to verify |
|---|-----------|---------------|
| 24.15 | Clicking progress bar seeks to correct song time | Click at 75% of bar: playhead jumps to ~75% of part duration |
| 24.16 | seek() fires onEventExit for all currently active events (highlight clears) | Seek while note lit: previous highlight disappears before new one appears |
| 24.17 | seek() then resume plays from new position (not from old position) | Seek to bar 3, press Play: playback begins from bar 3 |
| 24.18 | seek() within a part scope stays inside that part | Seek to end of progress bar: clamps to part end, does not leak into next part |

### 24e. Replay Consistency

| # | Criterion | How to verify |
|---|-----------|---------------|
| 24.19 | Playing the same part twice produces identical highlight sequence | Play Part 1 completely, reset, play Part 1 again: same notes light in same order |
| 24.20 | Replay at different tempo produces musically identical notes in different wall time | Play at 0.5×, replay at 1.0×: same notes play, just faster |
| 24.21 | No highlight state leaks between replays (no pre-lit notes at start) | After reset: no SVG elements have the `nk-active` or `nk-active-treble` class |

### 24f. Enter/Exit Event Ordering

| # | Criterion | How to verify |
|---|-----------|---------------|
| 24.22 | Bar scroll triggers on first note of new bar (not on exit of last note of previous bar) | Watch notification timing: scroll happens as new bar's note lights, not when old bar's note dims |
| 24.23 | At a beat boundary: new note highlight appears BEFORE old note highlight disappears | Watch carefully at quarter-note boundaries: brief overlap of lit notes, then clean transition |
| 24.24 | No "dark frame" between notes (enter fires before exit at same t_ms) | Play passage of consecutive notes: no perceptible flash of unlit state between notes |

### 24g. Tie Continuation Lifecycle

| # | Criterion | How to verify |
|---|-----------|---------------|
| 24.25 | Tied continuation (tie_stop: true) fires no audio attack | test_ties.json Part 1: bar 3 E4 whole — silent on entry |
| 24.26 | Tied continuation fires no keyboard re-attack flash | Tied note: keyboard key stays lit without opacity dip |
| 24.27 | Tied continuation DOES fire onEventEnter (highlight updates) | Highlight still applies to tied continuation notes (visual state updates normally) |

### 24h. Repeated-Note Lifecycle

| # | Criterion | How to verify |
|---|-----------|---------------|
| 24.28 | Non-tied repeated notes each fire audio attack | test_ties.json bar 9 (four E4 quarters): four separate note attacks heard |
| 24.29 | Non-tied repeated notes each trigger keyboard re-attack flash | Four E4 quarters: four opacity-dip flashes on keyboard key |
| 24.30 | Highlight clears and re-applies between repeated notes | Brief clear between each E4 (onEventExit then onEventEnter) |

### 24i. Tempo Scaling Stability

| # | Criterion | How to verify |
|---|-----------|---------------|
| 24.31 | At 0.5× tempo: each quarter note highlight lasts ~2× longer than at 1.0× | Compare E4 highlight duration visually at 0.5× vs 1.0× |
| 24.32 | All notes play at 0.5× tempo (no notes skipped) | Full passage: same note count, same order, just slower |
| 24.33 | Tempo change mid-playback takes effect without disrupting current events | Change tempo while playing: no stutter, no note skip, no highlight jump |
| 24.34 | Progress bar advances at rate proportional to tempo scale | 0.5× tempo: progress bar moves at half the speed |

### 24j. Part Replay Behavior

| # | Criterion | How to verify |
|---|-----------|---------------|
| 24.35 | Switching parts during playback stops all active highlights | Click different part mid-play: all highlights clear immediately |
| 24.36 | After part switch: play() uses new part scope | Select Part 3, play: starts at Part 3, not Part 1 |
| 24.37 | Progress bar reflects part scope (0% = part start, 100% = part end) | Play Part 2: progress starts at 0% for Part 2 bar 1 |
| 24.38 | Keyboard clears when part changes | Switch part: no stale keyboard highlights from previous part |
