#!/usr/bin/env python3
"""
Linear Learning Path Generator — Sprint 3A
Handles: repeat_start, repeat_end, volta (1, 2, [1,2]),
         D.C., D.C. al Fine, D.S., D.S. al Coda,
         segment generation (parts[] using lp_bar references)
Not yet handled: D.S. al Fine, nested repeats

Reads a song.json and writes learning_path.bars into it.
score.bars is never modified — original notation metadata is preserved unchanged.

Usage:
    python tools/linear_learning_path_generator.py <song.json>
    python tools/linear_learning_path_generator.py <song.json> --dry-run

As a module:
    from tools.linear_learning_path_generator import generate_learning_path
    song = generate_learning_path(song)
"""

import json
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _volta_set(bar):
    """Return the set of ending numbers for a bar's volta field.

    Accepts: None → {}  |  1 → {1}  |  2 → {2}  |  [1,2] → {1,2}
    A bar with volta {1,2} belongs to both endings and is treated as shared.
    """
    v = bar.get('volta')
    if v is None:
        return set()
    if isinstance(v, list):
        return set(v)
    return {int(v)}


def _find_dc_structure(bars):
    """Scan bars for D.C. / D.C. al Fine / Fine markers.

    Returns:
        dc_idx   — 0-based index of the first D.C. or D.C. al Fine bar (None if absent)
        dc_type  — 'dc' | 'dc_al_fine' | None
        fine_idx — 0-based index of the Fine bar (None if absent)

    Only the first D.C. / D.C. al Fine encountered is used.
    Both 'D.C.' and 'D.C. al Fine' are matched from bar.navigation.
    'Fine' is matched from bar.navigation.
    """
    dc_idx = dc_type = fine_idx = None
    for idx, bar in enumerate(bars):
        nav = bar.get('navigation')
        if nav == 'D.C.' and dc_idx is None:
            dc_idx, dc_type = idx, 'dc'
        elif nav == 'D.C. al Fine' and dc_idx is None:
            dc_idx, dc_type = idx, 'dc_al_fine'
        if nav == 'Fine':
            fine_idx = idx
    return dc_idx, dc_type, fine_idx


def _find_ds_structure(bars):
    """Scan bars for D.S. / D.S. al Coda / Segno / to_coda / Coda markers.

    Returns:
        ds_idx      — 0-based index of the first D.S. or D.S. al Coda bar (None if absent)
        ds_type     — 'ds' | 'ds_al_coda' | None
        segno_idx   — 0-based index of first bar with segno: true (None if absent)
        to_coda_idx — 0-based index of first bar with navigation: "to_coda" (None if absent)
        coda_idx    — 0-based index of first bar with coda: true (None if absent)

    Only the first D.S. / D.S. al Coda encountered is used.
    """
    ds_idx = ds_type = segno_idx = to_coda_idx = coda_idx = None
    for idx, bar in enumerate(bars):
        nav = bar.get('navigation')
        if nav == 'D.S.' and ds_idx is None:
            ds_idx, ds_type = idx, 'ds'
        elif nav == 'D.S. al Coda' and ds_idx is None:
            ds_idx, ds_type = idx, 'ds_al_coda'
        if bar.get('segno') and segno_idx is None:
            segno_idx = idx
        if nav == 'to_coda' and to_coda_idx is None:
            to_coda_idx = idx
        if bar.get('coda') and coda_idx is None:
            coda_idx = idx
    return ds_idx, ds_type, segno_idx, to_coda_idx, coda_idx


# ---------------------------------------------------------------------------
# Segment generation helpers
# ---------------------------------------------------------------------------

def _make_segment_label(chunk, section, pass_n):
    """Return a human-readable label for a learning-path segment.

    chunk    — list of lp_entries (each has 'original_bar')
    section  — 'main' | 'volta_1' | 'volta_2' | 'dc_repeat' | 'ds_repeat' | 'coda'
    pass_n   — integer pass number (1, 2, …)
    """
    orig_bars = [e['original_bar'] for e in chunk]
    lo, hi = min(orig_bars), max(orig_bars)
    bar_range = f"Bar {lo}" if lo == hi else f"Bars {lo}–{hi}"

    if section == 'main':
        if pass_n == 1:
            return bar_range
        elif pass_n == 2:
            return f"{bar_range} (repeat)"
        else:
            return f"{bar_range} (repeat {pass_n})"
    if section == 'volta_1':
        return f"{bar_range} — Ending 1"
    if section == 'volta_2':
        return f"{bar_range} — Ending 2"
    if section == 'dc_repeat':
        return f"{bar_range} (D.C.)"
    if section == 'ds_repeat':
        return f"{bar_range} (D.S.)"
    if section == 'coda':
        return "Coda"
    return bar_range


def generate_segments(song):
    """
    Partition learning_path.bars into segments and write them to parts[].

    Parts now reference lp_bar numbers, not original_bar numbers.

    Segmentation rules:
        1. Segment size target: meta.part_size_bars (default 4).
        2. A new segment group begins whenever (section, pass) changes.
           Segments never span two different section/pass pairs.
        3. Within a group, consecutive slices of part_size bars form segments.

    Replaces song['parts'] in place.

    Args:
        song (dict): Parsed song.json with learning_path already generated.

    Returns:
        The same dict with parts[] replaced by lp_bar-referenced segments.
    """
    lp_bars   = song['learning_path']['bars']
    part_size = song['meta'].get('part_size_bars', 4)

    parts    = []
    part_num = 1
    i        = 0

    while i < len(lp_bars):
        section = lp_bars[i]['section']
        pass_n  = lp_bars[i]['pass']

        # Collect the consecutive run that shares (section, pass).
        run_start = i
        while (i < len(lp_bars)
               and lp_bars[i]['section'] == section
               and lp_bars[i]['pass']    == pass_n):
            i += 1
        run = lp_bars[run_start:i]

        # Slice run into chunks of at most part_size.
        for offset in range(0, len(run), part_size):
            chunk = run[offset:offset + part_size]
            parts.append({
                'part_id':      f'part_{part_num}',
                'label':        _make_segment_label(chunk, section, pass_n),
                'bars':         [e['lp_bar'] for e in chunk],
                'has_pickup':   False,
                'example_audio': None,
            })
            part_num += 1

    song['parts'] = parts
    return song


# ---------------------------------------------------------------------------
# Core algorithm
# ---------------------------------------------------------------------------

def _find_repeat_regions(bars):
    """
    Scan bars left-to-right and return one region dict per repeat_end found.

    Each region dict contains:
        start        — 0-based index of first bar in the region (at or after the
                       nearest preceding repeat_start, or 0 if none)
        end          — 0-based index of the repeat_end bar (last bar of volta_1
                       when voltas are present)
        shared_end   — index of the last bar before any volta_1-exclusive bars
                       (= end when no voltas exist in the region)
        volta1_start — index of the first bar tagged volta 1 exclusively (not [1,2])
                       None if no such bar exists
        volta2_start — index of the first volta-2 bar after the repeat_end
                       None if no volta_2 bars follow
        volta2_end   — index of the last contiguous volta-2 bar after the repeat_end
                       None if no volta_2 bars follow

    A bar tagged volta [1,2] is treated as shared (appears on both passes) and
    does NOT set volta1_start.

    After each region, last_forward_idx resets to the bar after all volta bars,
    so independent repeat sections do not overlap.
    """
    regions = []
    last_forward_idx = 0

    for idx, bar in enumerate(bars):
        if bar.get('repeat_start'):
            last_forward_idx = idx

        if bar.get('repeat_end'):
            start   = last_forward_idx
            end_idx = idx

            # First bar exclusively tagged volta 1 (not shared with ending 2)
            volta1_start = None
            for k in range(start, end_idx + 1):
                vs = _volta_set(bars[k])
                if 1 in vs and 2 not in vs:
                    volta1_start = k
                    break

            shared_end = (volta1_start - 1) if volta1_start is not None else end_idx

            # Contiguous volta-2 bars immediately after the repeat_end
            volta2_start = volta2_end = None
            k = end_idx + 1
            while k < len(bars):
                vs = _volta_set(bars[k])
                if 2 in vs and 1 not in vs:
                    if volta2_start is None:
                        volta2_start = k
                    volta2_end = k
                    k += 1
                else:
                    break

            regions.append({
                'start':        start,
                'end':          end_idx,
                'shared_end':   shared_end,
                'volta1_start': volta1_start,
                'volta2_start': volta2_start,
                'volta2_end':   volta2_end,
            })

            # Reset: next repeat's implicit start is after all volta bars
            last_forward_idx = (volta2_end + 1) if volta2_end is not None else (end_idx + 1)

    return regions


def generate_learning_path(song):
    """
    Expand repeat / volta / D.C. structures into a flat learning path.

    Args:
        song (dict): Parsed song.json. Must contain score.bars[].

    Returns:
        The same dict, modified in place, with learning_path added (or overwritten).

    Expansion rules (Sprint 2B):
        Repeat (no volta):
            Pass 1 + Pass 2: all bars in [start → end]  section='main'

        Repeat with volta:
            Pass 1: [start → shared_end] main + [volta1_start → end] volta_1
            Pass 2: [start → shared_end] main + [volta2_start → volta2_end] volta_2

        D.C. (bar.navigation == 'D.C.'):
            After the full main traversal, re-emit all bars [0 → last] as
            section='dc_repeat'.  Pass = max pass used for each original bar + 1.

        D.C. al Fine (bar.navigation == 'D.C. al Fine'):
            Same as D.C. but re-emission stops at the Fine bar (inclusive).
            If no Fine marker is found, warns and falls back to plain D.C.

        D.S. (bar.navigation == 'D.S.'):
            After the full main traversal, re-emit bars [segno → end] as
            section='ds_repeat'.  Pass = max pass used for each original bar + 1.
            If no Segno marker is found, warns and skips D.S. expansion.

        D.S. al Coda (bar.navigation == 'D.S. al Coda'):
            Coda bars (bar.coda: true through end) are excluded from the main
            traversal.  After the main traversal:
              1. Re-emit bars [segno → to_coda] as section='ds_repeat'.
              2. Append bars [coda_start → end] as section='coda'.
            If to_coda or coda markers are absent, warns and falls back to plain D.S.

    Known limitations (Sprint 2B):
        - Secondary traversals (D.C. / D.S.) follow straight score order; inner
          repeat structures are not re-expanded within dc_repeat or ds_repeat.
        - D.S. al Fine not implemented.
        - Coexistence of D.C. and D.S. in the same piece is not tested.
        - parts[].bars still references original_bar numbers.
        - expansion_policy: "none" reserved but not implemented.
        - Nested repeats (repeat_start inside a region) not supported.
    """
    bars = song['score']['bars']
    regions = _find_repeat_regions(bars)
    dc_idx, dc_type, fine_idx = _find_dc_structure(bars)
    ds_idx, ds_type, segno_idx, to_coda_idx, coda_idx = _find_ds_structure(bars)

    # For D.S. al Coda: coda bars are excluded from the main traversal.
    # Both to_coda_idx and coda_idx must be present for al Coda routing to apply.
    if ds_type == 'ds_al_coda' and coda_idx is not None and to_coda_idx is not None:
        main_end = coda_idx
    else:
        main_end = len(bars)

    # Map bar index → region index for O(1) lookup.
    # Includes volta_2 bar indices so the main loop recognises and skips them.
    idx_to_region = {}
    for region_idx, r in enumerate(regions):
        for k in range(r['start'], r['end'] + 1):
            idx_to_region[k] = region_idx
        if r['volta2_start'] is not None:
            for k in range(r['volta2_start'], r['volta2_end'] + 1):
                idx_to_region[k] = region_idx

    lp_entries = []
    lp_num = 1
    processed = set()
    i = 0

    while i < main_end:
        if i in idx_to_region:
            region_idx = idx_to_region[i]

            if region_idx not in processed:
                processed.add(region_idx)
                r            = regions[region_idx]
                start        = r['start']
                end_idx      = r['end']
                shared_end   = r['shared_end']
                volta1_start = r['volta1_start']
                volta2_start = r['volta2_start']
                volta2_end   = r['volta2_end']
                has_volta    = volta1_start is not None

                def _emit(k, pass_n, section):
                    nonlocal lp_num
                    lp_entries.append({
                        'lp_bar':       lp_num,
                        'original_bar': bars[k]['bar'],
                        'pass':         pass_n,
                        'section':      section,
                    })
                    lp_num += 1

                if has_volta:
                    # Pass 1: shared section + volta_1
                    for k in range(start, shared_end + 1):
                        _emit(k, 1, 'main')
                    for k in range(volta1_start, end_idx + 1):
                        _emit(k, 1, 'volta_1')
                    # Pass 2: shared section + volta_2
                    for k in range(start, shared_end + 1):
                        _emit(k, 2, 'main')
                    if volta2_start is not None:
                        for k in range(volta2_start, volta2_end + 1):
                            _emit(k, 2, 'volta_2')
                else:
                    # No volta — identical passes
                    for k in range(start, end_idx + 1):
                        _emit(k, 1, 'main')
                    for k in range(start, end_idx + 1):
                        _emit(k, 2, 'main')

                # Advance past the entire region (including volta_2 bars)
                i = (volta2_end + 1) if volta2_end is not None else (end_idx + 1)

            else:
                # Defensive: already processed — should not be reached.
                i += 1
        else:
            lp_entries.append({
                'lp_bar':       lp_num,
                'original_bar': bars[i]['bar'],
                'pass':         1,
                'section':      'main',
            })
            lp_num += 1
            i += 1

    # ---------------------------------------------------------------------------
    # D.S. expansion (Sprint 2B)
    # ---------------------------------------------------------------------------
    if ds_idx is not None:
        if segno_idx is None:
            print(
                '[LLG_WARN] D.S. found but no Segno marker — skipping D.S. expansion.',
                file=sys.stderr,
            )
        else:
            eff_ds = ds_type
            if ds_type == 'ds_al_coda':
                if to_coda_idx is None:
                    print(
                        '[LLG_WARN] D.S. al Coda found but no to_coda marker '
                        '— treating as plain D.S.',
                        file=sys.stderr,
                    )
                    eff_ds = 'ds'
                elif coda_idx is None:
                    print(
                        '[LLG_WARN] D.S. al Coda found but no coda marker '
                        '— treating as plain D.S.',
                        file=sys.stderr,
                    )
                    eff_ds = 'ds'

            # Highest pass already used for each original_bar number.
            pass_used = {}
            for e in lp_entries:
                ob = e['original_bar']
                if e['pass'] > pass_used.get(ob, 0):
                    pass_used[ob] = e['pass']

            if eff_ds == 'ds':
                # Re-emit from segno to end of main section.
                for k in range(segno_idx, main_end):
                    ob = bars[k]['bar']
                    lp_entries.append({
                        'lp_bar':       lp_num,
                        'original_bar': ob,
                        'pass':         pass_used.get(ob, 0) + 1,
                        'section':      'ds_repeat',
                    })
                    lp_num += 1
            else:  # ds_al_coda
                # Re-emit from segno to to_coda (inclusive) as ds_repeat.
                for k in range(segno_idx, to_coda_idx + 1):
                    ob = bars[k]['bar']
                    lp_entries.append({
                        'lp_bar':       lp_num,
                        'original_bar': ob,
                        'pass':         pass_used.get(ob, 0) + 1,
                        'section':      'ds_repeat',
                    })
                    lp_num += 1

                # Rebuild pass_used to include the ds_repeat bars just added.
                pass_used = {}
                for e in lp_entries:
                    ob = e['original_bar']
                    if e['pass'] > pass_used.get(ob, 0):
                        pass_used[ob] = e['pass']

                # Append coda section (coda_idx through end of score).
                for k in range(coda_idx, len(bars)):
                    ob = bars[k]['bar']
                    lp_entries.append({
                        'lp_bar':       lp_num,
                        'original_bar': ob,
                        'pass':         pass_used.get(ob, 0) + 1,
                        'section':      'coda',
                    })
                    lp_num += 1

    # ---------------------------------------------------------------------------
    # D.C. expansion (Sprint 2A)
    # ---------------------------------------------------------------------------
    if dc_idx is not None:
        if dc_type == 'dc':
            dc_end_idx = len(bars) - 1
        else:  # 'dc_al_fine'
            if fine_idx is None:
                print(
                    '[LLG_WARN] D.C. al Fine found but no Fine marker — '
                    'treating as plain D.C.',
                    file=sys.stderr,
                )
                dc_end_idx = len(bars) - 1
            else:
                dc_end_idx = fine_idx

        # Highest pass already used for each original_bar number.
        pass_used = {}
        for e in lp_entries:
            ob = e['original_bar']
            if e['pass'] > pass_used.get(ob, 0):
                pass_used[ob] = e['pass']

        # Re-emit original bars 0 → dc_end_idx as dc_repeat.
        for k in range(0, dc_end_idx + 1):
            ob = bars[k]['bar']
            lp_entries.append({
                'lp_bar':       lp_num,
                'original_bar': ob,
                'pass':         pass_used.get(ob, 0) + 1,
                'section':      'dc_repeat',
            })
            lp_num += 1

    # Reverse index: original_bar (string key) → sorted list of lp_bar numbers
    original_bar_index = {}
    for entry in lp_entries:
        key = str(entry['original_bar'])
        original_bar_index.setdefault(key, []).append(entry['lp_bar'])

    song['learning_path'] = {
        'expansion_policy':   'full',
        'bars':               lp_entries,
        'original_bar_index': original_bar_index,
    }

    generate_segments(song)

    return song


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _print_summary(song):
    lp       = song['learning_path']
    orig_n   = len(song['score']['bars'])
    expanded = len(lp['bars'])
    ratio    = expanded / orig_n if orig_n else 0

    print(f"  Original bars   : {orig_n}")
    print(f"  Learning path   : {expanded} bars")
    print(f"  Expansion ratio : {ratio:.2f}x")
    print(f"  Segments        : {len(song.get('parts', []))}")

    print("\n  lp_bar  orig  pass  section")
    print("  " + "-" * 36)
    for e in lp['bars']:
        print(f"  {e['lp_bar']:6d}  {e['original_bar']:4d}  {e['pass']:4d}  {e['section']}")

    if song.get('parts'):
        print("\n  part_id    lp_bars            label")
        print("  " + "-" * 60)
        for p in song['parts']:
            bars_s = str(p['bars'])
            if len(bars_s) > 20:
                bars_s = bars_s[:17] + '...'
            print(f"  {p['part_id']:<10} {bars_s:<20} {p['label']}")


def main():
    args = sys.argv[1:]
    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)

    song_path = Path(args[0])
    dry_run   = '--dry-run' in args

    if not song_path.exists():
        print(f"Error: {song_path} not found", file=sys.stderr)
        sys.exit(1)

    with open(song_path, encoding='utf-8') as fh:
        song = json.load(fh)

    if 'learning_path' in song:
        print(f"Note: overwriting existing learning_path in {song_path.name}")

    song = generate_learning_path(song)
    _print_summary(song)

    if dry_run:
        print("\n[dry-run] No file written.")
    else:
        with open(song_path, 'w', encoding='utf-8') as fh:
            json.dump(song, fh, indent=2, ensure_ascii=False)
        print(f"\nWrote: {song_path}")


if __name__ == '__main__':
    main()
