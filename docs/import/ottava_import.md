# Ottava Import — Sprint 8A

## What is imported

8va (sounds an octave higher) and 8vb (sounds an octave lower) brackets from MusicXML
are detected via `music21.spanner.Ottava` and produce three extra fields on each affected event.

## Fields added

| Field | Type | Present on | Value |
|---|---|---|---|
| `notes` | `string[]` | All events | **Sounding** pitch (changed from written for ottava events) |
| `written_notes` | `string[]` | Ottava-spanned events only | Written pitch as notated on staff |
| `octave_mark_start` | `string` | First note of each span | `"8va"` or `"8vb"` |
| `octave_mark_stop` | `true` | Last note of each span | Boolean true |

Non-ottava events are unchanged — `notes` continues to hold the written pitch and
`written_notes` / `octave_mark_start` / `octave_mark_stop` are absent.

## Example (8va)

Written C5 under an 8va bracket sounds as C6:

```json
{
  "id": "ev_000001",
  "bar": 1, "beat": 1, "clef": "treble",
  "type": "note",
  "notes": ["C6"],
  "written_notes": ["C5"],
  "octave_mark_start": "8va",
  ...
}
```

Last note of the same span:

```json
{
  "id": "ev_000004",
  "notes": ["F6"],
  "written_notes": ["F5"],
  "octave_mark_stop": true,
  ...
}
```

## Example (8vb)

Written G3 under an 8vb bracket sounds as G2:

```json
{
  "notes": ["G2"],
  "written_notes": ["G3"],
  "octave_mark_start": "8vb",
  ...
}
```

## Pitch computation

```
8va  semitones = +12   sounding = written + 1 octave
8vb  semitones = -12   sounding = written - 1 octave
```

Implemented via `note.pitch.transpose(semitones)` on the music21 Pitch object.
Written pitch is captured before transposing from `note.pitch.nameWithOctave`.

## MusicXML → music21 direction mapping

MusicXML octave-shift direction is counterintuitive:

| MusicXML `type=` | music21 `Ottava.type` | Sounding |
|---|---|---|
| `"down"` | `"8va"` | +1 octave |
| `"up"` | `"8vb"` | −1 octave |

## Supported / unsupported

- Supported: `8va`, `8vb`
- Not supported: `15ma`, `15mb` (skipped with warning)
- Chords under ottava: each chord note is transposed

## Implementation location

`tools/mxl_to_song.py` — two sections:

1. **Pre-parse** (in `main()` before `parse_part` calls): iterates `score.spannerBundle`,
   builds `ottava_notes` dict keyed by `id(note)`.

2. **Injection** (in `parse_part()`): checks `ottava_notes.get(id(el))` for each
   `m21_note.Note` and `m21_chord.Chord`; writes `notes`, `written_notes`,
   `octave_mark_start`, `octave_mark_stop` as appropriate.

## Backward compatibility

Songs with no ottava spans produce identical output to pre-Sprint-8A.
`ottava_notes` dict will be empty; no fields are added to any event.
