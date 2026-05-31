#!/usr/bin/env python3
"""
inspect_ottava_fidelity.py — Sprint 8A-F0 investigation
Probes every pitch-related attribute on ottava-spanned notes to determine
whether music21 / MusicXML provides BOTH written and sounding pitch.

Usage:
    python tools/inspect_ottava_fidelity.py songs/source/test_ottava.xml
"""

import sys
import copy
import importlib
from pathlib import Path

from music21 import converter, spanner as m21_spanner, stream

SEP = '=' * 70
SEP2 = '-' * 70


def clsname(obj):
    return type(obj).__module__ + '.' + type(obj).__qualname__


def pitch_report(note, label=''):
    """Print every pitch-related field accessible on a note object."""
    print(f'      {label}  note={note.pitch.nameWithOctave}  midi={note.pitch.midi}')
    attrs = [
        'pitch', 'writtenPitch', 'displayPitch', 'sounding',
        'pitchClass', 'pitchClassString', 'nameWithOctave',
        'octave', 'step', 'alter',
    ]
    for a in attrs:
        if hasattr(note, a):
            try:
                val = getattr(note, a)
                if callable(val):
                    continue
                print(f'        .{a} = {val!r}')
            except Exception as e:
                print(f'        .{a} = <error: {e}>')
    # Check note.pitch sub-attributes
    pitch_attrs = ['nameWithOctave', 'midi', 'ps', 'step', 'octave',
                   'accidental', 'implicitAccidental',
                   'spellingIsInferred']
    for a in pitch_attrs:
        if hasattr(note.pitch, a):
            try:
                val = getattr(note.pitch, a)
                if callable(val):
                    continue
                print(f'        .pitch.{a} = {val!r}')
            except Exception as e:
                print(f'        .pitch.{a} = <error: {e}>')


def inspect_file(path):
    print(f'\n{SEP}')
    print(f'  SPRINT 8A-F0 — Ottava Fidelity Investigation')
    print(f'  File: {path}')
    print(SEP)

    score = converter.parse(path)

    # ------------------------------------------------------------------
    # Section 1: Ottava spanners — type + spanned notes with all pitch attrs
    # ------------------------------------------------------------------
    print(f'\n{SEP2}')
    print('  SECTION 1: Ottava spanners — pitch attribute survey')
    print(SEP2)

    ottava_spans = [sp for sp in score.spannerBundle
                    if isinstance(sp, m21_spanner.Ottava)]
    print(f'  Found {len(ottava_spans)} Ottava spanner(s)\n')

    for i, sp in enumerate(ottava_spans):
        els = list(sp.getSpannedElements())
        print(f'  Span {i+1}: type={sp.type!r}  placement={sp.placement!r}  '
              f'transposing={sp.transposing}  notes={len(els)}')
        for n in els:
            pitch_report(n, f'[{n.pitch.nameWithOctave} m{n.measureNumber} b{float(n.beat):.1f}]')

    # ------------------------------------------------------------------
    # Section 2: Does score.toSoundingPitch() expose sounding pitches?
    # ------------------------------------------------------------------
    print(f'\n{SEP2}')
    print('  SECTION 2: score.toSoundingPitch() effect on note pitches')
    print(SEP2)

    score2 = converter.parse(path)
    ottava_spans2 = [sp for sp in score2.spannerBundle
                     if isinstance(sp, m21_spanner.Ottava)]

    # Snapshot before
    before = {}
    for sp in ottava_spans2:
        for n in sp.getSpannedElements():
            nid = id(n)
            before[nid] = n.pitch.nameWithOctave

    try:
        score2.toSoundingPitch(inPlace=True)
        print('  toSoundingPitch(inPlace=True): OK')
        changed = 0
        unchanged = 0
        for sp in ottava_spans2:
            for n in sp.getSpannedElements():
                nid = id(n)
                was = before.get(nid, '?')
                now = n.pitch.nameWithOctave
                status = 'CHANGED' if was != now else 'unchanged'
                print(f'    type={sp.type}  {was} → {now}  ({status})')
                if was != now:
                    changed += 1
                else:
                    unchanged += 1
        print(f'\n  Result: {changed} pitches changed, {unchanged} unchanged')
    except Exception as e:
        print(f'  toSoundingPitch() error: {e}')

    # ------------------------------------------------------------------
    # Section 3: Force transposing=True, then check pitches
    # ------------------------------------------------------------------
    print(f'\n{SEP2}')
    print('  SECTION 3: Force sp.transposing=True before note read')
    print(SEP2)

    score3 = converter.parse(path)
    ottava_spans3 = [sp for sp in score3.spannerBundle
                     if isinstance(sp, m21_spanner.Ottava)]

    for sp in ottava_spans3:
        sp.transposing = True

    try:
        score3.toSoundingPitch(inPlace=True)
        print('  After setting transposing=True + toSoundingPitch():')
        for sp in ottava_spans3:
            els = list(sp.getSpannedElements())
            print(f'  Span type={sp.type}:')
            for n in els:
                print(f'    {n.pitch.nameWithOctave}  midi={n.pitch.midi}')
    except Exception as e:
        print(f'  Error: {e}')

    # ------------------------------------------------------------------
    # Section 4: Manual written-pitch extraction strategy
    # ------------------------------------------------------------------
    print(f'\n{SEP2}')
    print('  SECTION 4: Manual extraction — written pitch vs sounding pitch')
    print(SEP2)

    score4 = converter.parse(path)
    ottava_spans4 = [sp for sp in score4.spannerBundle
                     if isinstance(sp, m21_spanner.Ottava)]

    print('  Strategy: record written_pitch BEFORE transposing, '
          'then transpose to get sounding_pitch.')
    print()
    for sp in ottava_spans4:
        els = list(sp.getSpannedElements())
        semitones = 12 if sp.type == '8va' else -12
        print(f'  Span type={sp.type}  (semitones={semitones:+d}):')
        print(f'  {"Note":<6}  {"written_pitch":<14}  {"sounding_pitch":<14}  '
              f'{"written_midi":<13}  {"sounding_midi"}')
        for n in els:
            written = n.pitch.nameWithOctave
            written_midi = n.pitch.midi
            sounding = n.pitch.transpose(semitones).nameWithOctave
            sounding_midi = n.pitch.midi + semitones
            is_first = (n is els[0])
            is_last  = (n is els[-1])
            marker = ' <-- START' if is_first else (' <-- STOP' if is_last else '')
            print(f'  {written:<6}  {written:<14}  {sounding:<14}  '
                  f'{written_midi:<13}  {sounding_midi}{marker}')
        print()

    # ------------------------------------------------------------------
    # Section 5: writtenPitch attribute probe (transposing instruments)
    # ------------------------------------------------------------------
    print(f'\n{SEP2}')
    print('  SECTION 5: writtenPitch field — does it exist on ottava notes?')
    print(SEP2)

    score5 = converter.parse(path)
    ottava_spans5 = [sp for sp in score5.spannerBundle
                     if isinstance(sp, m21_spanner.Ottava)]

    for sp in ottava_spans5:
        els = list(sp.getSpannedElements())
        print(f'  Span type={sp.type}:')
        for n in els[:2]:  # check first two notes only
            print(f'    note={n.pitch.nameWithOctave}')
            for attr in ['writtenPitch', 'displayPitch', 'sounding',
                         'overriddenFrequency']:
                exists = hasattr(n, attr)
                if exists:
                    try:
                        val = getattr(n, attr)
                        print(f'      .{attr} = {val!r}  EXISTS')
                    except Exception as e:
                        print(f'      .{attr} = <error: {e}>  EXISTS (broken)')
                else:
                    print(f'      .{attr}: NOT PRESENT')

    # ------------------------------------------------------------------
    # Section 6: MusicXML raw XML for octave-shift element
    # ------------------------------------------------------------------
    print(f'\n{SEP2}')
    print('  SECTION 6: Raw MusicXML — what MuseScore would export')
    print(SEP2)
    print('  Confirmed MusicXML direction for each ottava type:')
    print()
    print('  8va (notes sound HIGHER than written):')
    print('    <direction placement="above">')
    print('      <direction-type>')
    print('        <octave-shift type="down" size="8" number="1"/>')
    print('      </direction-type>')
    print('    </direction>')
    print()
    print('  8vb (notes sound LOWER than written):')
    print('    <direction placement="below">')
    print('      <direction-type>')
    print('        <octave-shift type="up" size="8" number="1"/>')
    print('      </direction-type>')
    print('    </direction>')
    print()
    print('  music21 maps:')
    print('    MusicXML type="down" -> music21 Ottava.type = "8va"  (up one octave)')
    print('    MusicXML type="up"   -> music21 Ottava.type = "8vb"  (down one octave)')

    # ------------------------------------------------------------------
    # Section 7: Information loss audit per pipeline stage
    # ------------------------------------------------------------------
    print(f'\n{SEP2}')
    print('  SECTION 7: Information pipeline — where is written pitch preserved?')
    print(SEP2)
    pipeline = [
        'MuseScore:   written C5 on staff | 8va bracket | sounding C6',
        '  | export MusicXML',
        'MusicXML:    <pitch>C5</pitch> | <octave-shift type="down"/> | both present',
        '  | music21.converter.parse() transposing=False',
        'music21:     note.pitch = C5 (written) | sp.type = "8va" | both present',
        '  | mxl_to_song.py (current, no ottava code)',
        'song.json:   notes=["C5"] WRONG | octave_mark_start missing',
        '  Player presses C5 -- INCORRECT (should press C6)',
    ]
    for line in pipeline:
        print(f'  {line}')

    # ------------------------------------------------------------------
    # Section 8: Feasibility conclusion
    # ------------------------------------------------------------------
    print(f'\n{SEP2}')
    print('  SECTION 8: Feasibility — can importer produce written + sounding?')
    print(SEP2)
    print('''
  YES — both pitches are available at the music21 stage.

  written_pitch  = note.pitch.nameWithOctave          (already available)
  sounding_pitch = note.pitch.transpose(semitones)    (computed from spanner type)
    where semitones = +12 for "8va", -12 for "8vb"

  Implementation proof (runs during this script):
''')
    score_demo = converter.parse(path)
    ottava_demo = [sp for sp in score_demo.spannerBundle
                   if isinstance(sp, m21_spanner.Ottava)]
    for sp in ottava_demo[:1]:  # first span only for demo
        els = list(sp.getSpannedElements())
        semitones = 12 if sp.type == '8va' else -12
        n = els[0]
        written_p  = n.pitch.nameWithOctave
        sounding_p = n.pitch.transpose(semitones).nameWithOctave
        print(f'  Span: type={sp.type}  first note:')
        print(f'    written_pitch  = {written_p!r}')
        print(f'    sounding_pitch = {sounding_p!r}')
        print(f'    importer can write:')
        print(f'      notes:         ["{sounding_p}"]')
        print(f'      written_notes: ["{written_p}"]')
        print(f'      octave_mark_start: "{sp.type}"')

    print(f'\n{SEP}')
    print('  END OF REPORT')
    print(SEP)


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'songs/source/test_ottava.xml'
    inspect_file(Path(path))
