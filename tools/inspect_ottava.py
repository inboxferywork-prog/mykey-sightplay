#!/usr/bin/env python3
"""
inspect_ottava.py — Sprint 8A-Prep feasibility audit
Inspects a MusicXML file to determine exactly how music21 10.x represents
8va / 8vb (octave-shift / ottava) markings.

Usage:
    python tools/inspect_ottava.py songs/source/test_ottava.xml
"""

import sys
from pathlib import Path
from music21 import converter, spanner, expressions, stream

SEP = '-' * 70


def clsname(obj):
    return type(obj).__module__ + '.' + type(obj).__qualname__


def print_section(title):
    print(f'\n{SEP}')
    print(f'  {title}')
    print(SEP)


def inspect_file(path):
    print(f'Parsing: {path}')
    score = converter.parse(path)
    print(f'Top-level type: {clsname(score)}')

    # ------------------------------------------------------------------
    # 1. Spanner bundle — the primary location for ottava in music21
    # ------------------------------------------------------------------
    print_section('1. SPANNER BUNDLE')
    sb = score.spannerBundle
    print(f'Total spanners: {len(sb)}')

    ottava_spanners = []
    for sp in sb:
        name = clsname(sp)
        print(f'  [{name}]')
        # Print all public attributes that don't start with '_'
        for attr in sorted(vars(sp)):
            if not attr.startswith('_'):
                try:
                    val = getattr(sp, attr)
                    if not callable(val):
                        print(f'    .{attr} = {val!r}')
                except Exception as e:
                    print(f'    .{attr} = <error: {e}>')

        # Check for ottava / octave-shift related class names
        lower_name = name.lower()
        if any(k in lower_name for k in ('ottava', 'octave', 'shift', 'line')):
            ottava_spanners.append(sp)
            # Try key attributes explicitly
            for attr_name in ('type', 'shiftType', 'shift', 'transposing',
                               'transposition', 'placement', 'size',
                               'name', 'label', 'direction'):
                if hasattr(sp, attr_name):
                    try:
                        print(f'    => .{attr_name} = {getattr(sp, attr_name)!r}')
                    except Exception:
                        pass
            # List the notes/elements anchored by this spanner
            try:
                parts_in_spanner = list(sp.getSpannedElements())
                print(f'    => spanned elements ({len(parts_in_spanner)}):')
                for el in parts_in_spanner[:8]:
                    offset = None
                    meas = None
                    try:
                        offset = el.offset
                        meas = el.measureNumber
                    except Exception:
                        pass
                    print(f'       {clsname(el)}  pitch={getattr(el, "pitch", "?")}  '
                          f'offset={offset}  measure={meas}')
            except Exception as e:
                print(f'    => getSpannedElements() failed: {e}')

    print(f'\nOttava-family spanners found: {len(ottava_spanners)}')

    # ------------------------------------------------------------------
    # 2. Flat scan — check every element in every part
    # ------------------------------------------------------------------
    print_section('2. FLAT ELEMENT SCAN (all parts)')
    for part in score.parts:
        pname = part.partName or part.id
        print(f'\n  Part: {pname}')

        # Scan for spanner-anchor hints and expression-type objects on notes
        ottava_in_part = []
        for el in part.flatten():
            cn = clsname(el)
            lower = cn.lower()
            if any(k in lower for k in ('ottava', 'octaveshift', 'octave_shift',
                                         'octaveline', 'octave-shift')):
                print(f'    FOUND: {cn}  offset={el.offset}')
                ottava_in_part.append(el)

        # Check note expressions and spanners explicitly
        for el in part.flatten().notes:
            # Check .expressions list on each note
            if hasattr(el, 'expressions'):
                for ex in el.expressions:
                    ecn = clsname(ex)
                    if any(k in ecn.lower() for k in ('ottava', 'octave', 'shift')):
                        print(f'    NOTE EXPRESSION: {ecn} on note {el.pitch} '
                              f'at offset {el.offset}')

            # Check .spannerBundle on the note
            if hasattr(el, 'getSpannerSites'):
                sites = el.getSpannerSites()
                for s in sites:
                    scn = clsname(s)
                    if any(k in scn.lower() for k in ('ottava', 'octave', 'shift', 'line')):
                        print(f'    NOTE SPANNER: {scn} on note {el.pitch} '
                              f'at offset {el.offset}, measure {el.measureNumber}')

        if not ottava_in_part:
            print('    (no ottava-type elements found in flat scan)')

    # ------------------------------------------------------------------
    # 3. Note pitch analysis — has music21 auto-transposed?
    # ------------------------------------------------------------------
    print_section('3. NOTE PITCH ANALYSIS (written vs sounding)')
    for part in score.parts:
        pname = part.partName or part.id
        print(f'\n  Part: {pname}')
        for meas in part.getElementsByClass(stream.Measure):
            for el in meas.notes:
                pitch_str = str(el.pitch)
                print(f'    m{meas.number} beat {el.beat:.1f}: {pitch_str}  '
                      f'(midi={el.pitch.midi})')

    # ------------------------------------------------------------------
    # 4. MusicXML raw octave-shift element check
    # ------------------------------------------------------------------
    print_section('4. music21 Expressions & Spanners class taxonomy')
    print('  Available in music21.expressions:')
    import music21.expressions as m21e
    for name in sorted(dir(m21e)):
        if any(k in name.lower() for k in ('ottava', 'octave', 'shift')):
            print(f'    music21.expressions.{name}')
    print()
    print('  Available in music21.spanner:')
    import music21.spanner as m21s
    for name in sorted(dir(m21s)):
        if any(k in name.lower() for k in ('ottava', 'octave', 'shift', 'line')):
            print(f'    music21.spanner.{name}')

    # ------------------------------------------------------------------
    # 5. Spanner direct instantiation check
    # ------------------------------------------------------------------
    print_section('5. Direct ottava class probe')
    candidates = [
        ('music21.expressions', 'OctaveShift'),
        ('music21.spanner',     'Ottava'),
        ('music21.spanner',     'OctaveShift'),
    ]
    for mod_name, cls_name in candidates:
        try:
            import importlib
            mod = importlib.import_module(mod_name)
            cls = getattr(mod, cls_name)
            obj = cls()
            print(f'  {mod_name}.{cls_name}: EXISTS — {obj}')
            for attr in ('type', 'shiftType', 'shift', 'placement', 'size', 'transposing'):
                if hasattr(obj, attr):
                    print(f'    .{attr} = {getattr(obj, attr)!r}')
        except AttributeError:
            print(f'  {mod_name}.{cls_name}: NOT FOUND')
        except Exception as e:
            print(f'  {mod_name}.{cls_name}: ERROR — {e}')

    # ------------------------------------------------------------------
    # 6. Summary
    # ------------------------------------------------------------------
    print_section('6. SUMMARY')
    print(f'  Total spanners in bundle: {len(sb)}')
    print(f'  Ottava-family spanners:   {len(ottava_spanners)}')
    print()
    if ottava_spanners:
        print('  Ottava IS accessible via spanner bundle.')
        for sp in ottava_spanners:
            els = []
            try:
                els = list(sp.getSpannedElements())
            except Exception:
                pass
            print(f'  Type: {clsname(sp)}, spanned notes: {len(els)}')
    else:
        print('  Ottava NOT found in spanner bundle.')
        print('  => Implementation Option C: metadata may be lost at parse stage.')


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'songs/source/test_ottava.xml'
    inspect_file(Path(path))
