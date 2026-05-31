# Repeat Import Audit

**Scope:** MXL → song.json import pipeline only.
**Date:** 2026-05-31

---

## Status

| Layer | Status |
|---|---|
| Import | **Supported — gap documented.** `mxl_to_song.py` does not yet emit `repeat_start`, `repeat_end`, or `volta`. Implementation path defined in [`docs/import/linear_learning_path_generator.md`](../import/linear_learning_path_generator.md). |
| Renderer | **Learning Aid only.** Repeat barlines and volta brackets are displayed as notation literacy objects. They do not affect playback order. |
| Playback | **Not supported by design.** Runtime remains strictly linear. Repeat expansion occurs during import, not at runtime. |

---

## Summary

The schema fields exist. The import pipeline does not populate them.
`test_endings.json` is hand-authored, not generated.

---

## 1. authoring.html — repeat field parsing

**None.** `authoring.html` is a learning-segment editor; it reads an
existing `song.json` and writes `learning_segments` back to it. It
does not parse MusicXML and has no concept of `repeat_start`,
`repeat_end`, or `volta`.

The only "repeat" word in the file is `suggested_repeats` — a
learning-segment field meaning "play this segment N times", unrelated
to notation repeat barlines.

---

## 2. MusicXML elements that map to each field

| song.json field | MusicXML source |
|---|---|
| `repeat_start: true` | `<barline location="left"><bar-style>heavy-light</bar-style><repeat direction="forward"/></barline>` |
| `repeat_end: true` | `<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>` |
| `volta: 1` / `volta: 2` | `<ending number="1" type="start"/>` … `<ending number="1" type="stop"/>` |

music21 exposes these as `bar.leftBarline` / `bar.rightBarline`
(`music21.bar.Repeat`) and `music21.spanner.RepeatBracket`.

---

## 3. Are the fields written automatically by mxl_to_song.py?

**No.** `tools/mxl_to_song.py` imports from music21 but does not
import `bar`, `repeat`, or any spanner related to repeats. A search
for `barline`, `repeat`, `volta`, `ending`, `Repeat`, `Barline`,
`Volta` in the file returns zero matches.

`tools/validate_song.py` likewise has no validation rules for
`repeat_start`, `repeat_end`, or `volta` — those fields pass through
silently as unknown keys.

---

## 4. Is test_endings.json generated from real MXL import?

**No — hand-authored.** Evidence:

- No corresponding `.mxl` source file exists anywhere in the repo.
- Part labels are written in audit-intent style ("check bracket and
  thick barline render"), identical to other hand-authored test files
  (`test_dynamics.json`, `test_articulations.json`).
- The `composer` field is `"MyKey Engraving Audit"`, the standard
  sentinel used for hand-authored audit fixtures.

---

## Gap

To produce `repeat_start`, `repeat_end`, and `volta` from a real MXL
file, `mxl_to_song.py` would need:

1. Import `music21.bar` and iterate `measure.leftBarline` /
   `measure.rightBarline` to detect `Repeat` objects.
2. Import `music21.spanner` and collect `RepeatBracket` spanners
   to assign `volta` numbers to the correct bars.
3. Write the detected fields onto the bar dict before JSON output.

No changes to schema, renderer, or runtime are required for the
import step alone.
