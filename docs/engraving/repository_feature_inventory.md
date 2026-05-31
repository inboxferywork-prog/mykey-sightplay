# Repository Feature Inventory

Raw search results for notation feature terms across the codebase.

---

## dynamics

### Matches Found

- `songs/test_dynamics.json`
- `docs/engraving/tests/test_dynamics.json`
- `docs/engraving/ENGRAVING_AUDIT.md`
- `docs/music-notation-semantics.md`
- `src/notation-renderer.js`
- `songs/index.json`
- `DEVLOG.md`

### Snippet

`songs/test_dynamics.json` (bar-level field):
```json
"dynamics": "pp"
"dynamics": "mp"
"dynamics_hairpin": "crescendo"
```

`src/notation-renderer.js` (lines 208–209):
```js
// TODO(Layer3-dynamics): dynamic markings (p/mf/f/ff, hairpins) are placed
// below each stave. A separate pass over barData dynamics metadata goes here,
```

`docs/engraving/ENGRAVING_AUDIT.md`:
```
| `dynamics`         | bar object   | string  | `"pp"`, `"mf"`, `"ff"`              |
| `dynamics_hairpin` | bar object   | string  | `"crescendo"`, `"decrescendo"`      |
```

### Classification

- `songs/test_dynamics.json` — **Test Asset**
- `docs/engraving/tests/test_dynamics.json` — **Test Asset**
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation**
- `docs/music-notation-semantics.md` — **Documentation**
- `src/notation-renderer.js` — **Renderer** (TODO stub only, no implementation)
- `songs/index.json` — **Test Asset**
- `DEVLOG.md` — **Documentation**

---

## tempo_text

### Matches Found

- `songs/test_tempo_markings.json`
- `docs/engraving/tests/test_tempo_markings.json`
- `docs/engraving/ENGRAVING_AUDIT.md`

### Snippet

`songs/test_tempo_markings.json` (bar-level field):
```json
"tempo_text": "Allegro"
"tempo_text": "Moderato"
"tempo_text": "Andante"
"tempo_text": "Largo"
```

`docs/engraving/ENGRAVING_AUDIT.md`:
```
| `tempo_text` | bar object | string | `"Allegro"` |
```

### Classification

- `songs/test_tempo_markings.json` — **Test Asset**
- `docs/engraving/tests/test_tempo_markings.json` — **Test Asset**
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation**

---

## tempo_bpm

### Matches Found

- `songs/test_tempo_markings.json`
- `docs/engraving/tests/test_tempo_markings.json`
- `docs/engraving/ENGRAVING_AUDIT.md`

### Snippet

`songs/test_tempo_markings.json` (bar-level field):
```json
"tempo_bpm": 120
"tempo_bpm": 96
"tempo_bpm": 72
"tempo_bpm": 50
```

`docs/engraving/ENGRAVING_AUDIT.md`:
```
| `tempo_bpm` | bar object | number | `120` |
```

### Classification

- `songs/test_tempo_markings.json` — **Test Asset**
- `docs/engraving/tests/test_tempo_markings.json` — **Test Asset**
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation**

---

## tuplet

### Matches Found

- `src/notation-renderer.js`
- `docs/music-notation-semantics.md`
- `docs/engraving/ENGRAVING_AUDIT.md`
- `docs/engraving-validation-checklist.md`
- `songs/index.json`
- `DEVLOG.md`

### Snippet

`src/notation-renderer.js` (lines 920–921, inside `_beatGroupedBeams` JSDoc):
```js
* TODO(Layer3-tuplets): tuplet brackets require a VF.Tuplet pass over tagged tuplet
* groups after beam creation. Requires tuplet metadata in song.json events.
```

`docs/music-notation-semantics.md`:
```
**Semantic concern:** Tuplet notes have non-standard `duration_ms` values
(e.g., triplet eighth = 2/3 × nominal eighth).

**Visual concern:** Tuplet bracket and number placement requires a new VexFlow
`Tuplet` object pass after beam grouping.
```

`docs/engraving-validation-checklist.md`:
```
*Deferred. Not yet implemented. Criteria documented here for when tuplet
rendering is added.*
```

### Classification

- `src/notation-renderer.js` — **Renderer** (TODO stub only, no implementation)
- `docs/music-notation-semantics.md` — **Documentation**
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation**
- `docs/engraving-validation-checklist.md` — **Documentation**
- `songs/index.json` — **Test Asset**
- `DEVLOG.md` — **Documentation**

---

## tuplet_group

### Matches Found

- `songs/test_tuplets.json`
- `docs/engraving/tests/test_tuplets.json`
- `docs/engraving/ENGRAVING_AUDIT.md`

### Snippet

`songs/test_tuplets.json` (event-level field, repeated across ~27 events):
```json
"tuplet_group": "3:2"
```

`docs/engraving/ENGRAVING_AUDIT.md`:
```
| `tuplet_group` | event object | string | `"3:2"` |
```

### Classification

- `songs/test_tuplets.json` — **Test Asset**
- `docs/engraving/tests/test_tuplets.json` — **Test Asset**
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation**

---

## pedal

### Matches Found

- `docs/engraving-validation-checklist.md`
- `docs/music-notation-semantics.md`
- `DEVLOG.md`

### Snippet

`docs/engraving-validation-checklist.md`:
```
## 16. Future Validation — Pedal Markings
*Deferred. Not yet implemented. Criteria documented here for when pedal
notation is added.*
```

`docs/music-notation-semantics.md`:
```
**Semantic concern:** Pedal markings indicate physical piano pedal actions.
**Visual concern:** Pedal symbols (`Ped`, `*`, bracket style) are placed
below the bass stave.
```

### Classification

- `docs/engraving-validation-checklist.md` — **Documentation**
- `docs/music-notation-semantics.md` — **Documentation**
- `DEVLOG.md` — **Documentation**

---

## pedal_start

### Matches Found

- `songs/test_pedal_markings.json`
- `docs/engraving/tests/test_pedal_markings.json`
- `docs/engraving/ENGRAVING_AUDIT.md`

### Snippet

`songs/test_pedal_markings.json` (event-level field):
```json
"pedal_start": true
```
Appears at: bar 1 event, bar 2 event, bar 4 event.

`docs/engraving/ENGRAVING_AUDIT.md`:
```
| `pedal_start` | event object | boolean | `true` |
```

### Classification

- `songs/test_pedal_markings.json` — **Test Asset**
- `docs/engraving/tests/test_pedal_markings.json` — **Test Asset**
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation**

---

## pedal_stop

### Matches Found

- `songs/test_pedal_markings.json`
- `docs/engraving/tests/test_pedal_markings.json`
- `docs/engraving/ENGRAVING_AUDIT.md`

### Snippet

`songs/test_pedal_markings.json` (event-level field):
```json
"pedal_stop": true
```
Appears at: bar 2 event, bar 3 event, bar 5 event.

`docs/engraving/ENGRAVING_AUDIT.md`:
```
| `pedal_stop` | event object | boolean | `true` |
```

### Classification

- `songs/test_pedal_markings.json` — **Test Asset**
- `docs/engraving/tests/test_pedal_markings.json` — **Test Asset**
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation**

---

## volta

### Matches Found

- `songs/test_endings.json`
- `docs/engraving/tests/test_endings.json`
- `docs/engraving/ENGRAVING_AUDIT.md`

### Snippet

`songs/test_endings.json` (bar-level field):
```json
"volta": 1
"volta": 2
```

`docs/engraving/ENGRAVING_AUDIT.md`:
```
| `volta` | bar object | number | `1`, `2` |
```

### Classification

- `songs/test_endings.json` — **Test Asset**
- `docs/engraving/tests/test_endings.json` — **Test Asset**
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation**

---

## repeat_start

### Matches Found

- `songs/test_endings.json`
- `docs/engraving/tests/test_endings.json`
- `docs/engraving/ENGRAVING_AUDIT.md`

### Snippet

`songs/test_endings.json` (bar-level field, bar 1):
```json
"repeat_start": true
```

`docs/engraving/ENGRAVING_AUDIT.md`:
```
| `repeat_start` | bar object | boolean | `true` |
```

### Classification

- `songs/test_endings.json` — **Test Asset**
- `docs/engraving/tests/test_endings.json` — **Test Asset**
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation**

---

## repeat_end

### Matches Found

- `songs/test_endings.json`
- `docs/engraving/tests/test_endings.json`
- `docs/engraving/ENGRAVING_AUDIT.md`

### Snippet

`songs/test_endings.json` (bar-level field, bar 4):
```json
"repeat_end": true
```

`docs/engraving/ENGRAVING_AUDIT.md`:
```
| `repeat_end` | bar object | boolean | `true` |
```

### Classification

- `songs/test_endings.json` — **Test Asset**
- `docs/engraving/tests/test_endings.json` — **Test Asset**
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation**

---

## navigation

### Matches Found

- `songs/test_endings.json`
- `songs/test_navigation_symbols.json`
- `docs/engraving/tests/test_endings.json`
- `docs/engraving/tests/test_navigation_symbols.json`
- `docs/engraving/ENGRAVING_AUDIT.md`

### Snippet

`songs/test_endings.json` (bar-level field, bar 8):
```json
"navigation": "D.C. al Fine"
```

`songs/test_navigation_symbols.json` (bar-level field):
```json
"navigation": "Fine"
"navigation": "D.S. al Coda"
"navigation": "D.C."
```

`docs/engraving/ENGRAVING_AUDIT.md`:
```
| `navigation` | bar object | string | `"D.C. al Fine"`, `"Fine"` |
```

### Classification

- `songs/test_endings.json` — **Test Asset**
- `songs/test_navigation_symbols.json` — **Test Asset**
- `docs/engraving/tests/test_endings.json` — **Test Asset**
- `docs/engraving/tests/test_navigation_symbols.json` — **Test Asset**
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation**

---

## segno

### Matches Found

- `songs/test_navigation_symbols.json`
- `docs/engraving/tests/test_navigation_symbols.json`
- `docs/engraving/ENGRAVING_AUDIT.md`

### Snippet

`songs/test_navigation_symbols.json` (bar-level field, bar 1):
```json
"segno": true
```

`docs/engraving/ENGRAVING_AUDIT.md`:
```
| `segno` | bar object | boolean | `true` |
```

### Classification

- `songs/test_navigation_symbols.json` — **Test Asset**
- `docs/engraving/tests/test_navigation_symbols.json` — **Test Asset**
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation**

---

## coda

### Matches Found

- `songs/test_navigation_symbols.json`
- `docs/engraving/tests/test_navigation_symbols.json`
- `docs/engraving/ENGRAVING_AUDIT.md`
- `songs/test_pickup_bhand.json` (segment id `"seg_coda"` — unrelated to notation field)
- `docs/authoring-workflow.md` (segment id example — unrelated to notation field)
- `docs/authoring-pedagogy-guide.md` (pedagogical label — unrelated to notation field)
- `DEVLOG.md` (segment id debug entry — unrelated to notation field)

### Snippet

`songs/test_navigation_symbols.json` (bar-level field, bar 5):
```json
"coda": true
```

`docs/engraving/ENGRAVING_AUDIT.md`:
```
| `coda` | bar object | boolean | `true` |
```

`songs/test_pickup_bhand.json` (segment metadata — not a notation field):
```json
"id": "seg_coda"
```

### Classification

- `songs/test_navigation_symbols.json` — **Test Asset** (notation schema field)
- `docs/engraving/tests/test_navigation_symbols.json` — **Test Asset** (notation schema field)
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation** (notation schema field)
- `songs/test_pickup_bhand.json` — **Test Asset** (segment id, not notation field)
- `docs/authoring-workflow.md` — **Documentation** (segment id example, not notation field)
- `docs/authoring-pedagogy-guide.md` — **Documentation** (pedagogical label, not notation field)
- `DEVLOG.md` — **Documentation** (segment debug entry, not notation field)

---

## octave_mark

### Matches Found

- `songs/test_octave_marks.json`
- `docs/engraving/tests/test_octave_marks.json`
- `docs/engraving/ENGRAVING_AUDIT.md`
- `songs/index.json`

### Snippet

`songs/test_octave_marks.json` (event-level fields):
```json
"octave_mark_start": "8va"
"octave_mark_stop": true
"octave_mark_start": "8vb"
"octave_mark_stop": true
```
`octave_mark_start` appears at: bar 1, 2, 3, 4, 5 events.
`octave_mark_stop` appears at: bar 1, 2, 3, 4, 5 events.

`docs/engraving/ENGRAVING_AUDIT.md`:
```
| `octave_mark_start` | event object | string  | `"8va"`, `"8vb"` |
| `octave_mark_stop`  | event object | boolean | `true`           |
```

`songs/index.json`:
```json
"src": "songs/test_octave_marks.json",
"label": "Octave Mark Rendering Audit — 8va, 8vb, Long-span Lines"
```

### Classification

- `songs/test_octave_marks.json` — **Test Asset**
- `docs/engraving/tests/test_octave_marks.json` — **Test Asset**
- `docs/engraving/ENGRAVING_AUDIT.md` — **Documentation**
- `songs/index.json` — **Test Asset**
