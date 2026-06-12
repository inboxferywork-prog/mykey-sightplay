#!/usr/bin/env python3
"""
compute_svg_note_map.py — Pre-compute SVG note → JSON event mapping for mismatch songs.

For songs where SVG note count ≠ JSON event count (the SVG has background chord tones
the student doesn't play), the runtime 1:1 sort-based matching is wrong.
This script computes the correct mapping offline and stores it as _svg_note_order
in the song JSON meta. The JavaScript _buildSvgNoteMap() uses it if present.

Usage:
    python tools/compute_svg_note_map.py            # process all mismatch songs
    python tools/compute_svg_note_map.py --all      # process all songs (skip if OK)
    python tools/compute_svg_note_map.py --song "Song Name.json"
"""

import argparse
import json
import re
from pathlib import Path

APP_ROOT  = Path(__file__).parent.parent
SONGS_DIR = APP_ROOT / "songs"
_SKIP     = {"index.json", "collections.json", "simple_test.json"}

PITCH_NAMES = "CDEFGAB"
STEP = 12.4          # SVG units per diatonic step (universal in MuseScore)
SYS_GAP = 250        # minimum Y gap between systems
MERGE_BL = 50        # barlines within this distance are part of the same repeat sign


def pitch_to_diatonic(note_str: str) -> int:
    """Convert pitch name ('F3', 'Bb4', 'C#5') to diatonic position relative to C4=0."""
    m = re.match(r"([A-G])([b#]*)([-]?\d+)", note_str)
    if not m:
        return 0
    letter, _, octave = m.group(1), m.group(2), int(m.group(3))
    return (int(octave) - 4) * 7 + PITCH_NAMES.index(letter)


def load_svg_notes(svg_path: Path):
    """Return list of (tx, ty) for every path.Note in DOM order."""
    content = svg_path.read_text(encoding="utf-8")
    notes = []
    for m in re.finditer(r'<path class="Note" transform="matrix\(([^)]+)\)"', content):
        parts = m.group(1).split(",")
        if len(parts) >= 6:
            notes.append((float(parts[4]), float(parts[5])))
    return notes, content


def detect_system_breaks(notes_dom):
    """Return list of Y midpoints that separate consecutive systems."""
    sorted_ys = sorted(set(y for _, y in notes_dom))
    breaks = []
    for i in range(1, len(sorted_ys)):
        if sorted_ys[i] - sorted_ys[i - 1] >= SYS_GAP:
            breaks.append((sorted_ys[i - 1] + sorted_ys[i]) / 2)
    return breaks


def sys_of(y, breaks):
    return sum(1 for bp in breaks if y > bp)


def calibrate_staves(svg_content: str, breaks: list):
    """
    For each system, return (y_top_treble, y_top_bass, step) using StaffLines elements.
    y_top_treble = Y of top treble line (F5, diatonic 10)
    y_top_bass   = Y of top bass line (A3, diatonic -2), or None for treble-only staves
    """
    all_ys = []
    for pts in re.findall(r'<polyline class="StaffLines"[^>]+points="([^"]+)"', svg_content):
        y = float(pts.strip().split()[0].split(",")[1])
        all_ys.append(round(y, 2))
    all_ys.sort()

    num_sys = len(breaks) + 1
    calib = {}
    for s in range(num_sys):
        y_lo = breaks[s - 1] if s > 0 else 0
        y_hi = breaks[s] if s < len(breaks) else float("inf")
        sys_lines = [y for y in all_ys if y_lo < y < y_hi]
        if len(sys_lines) >= 10:
            calib[s] = (sys_lines[0], sys_lines[5])  # F5, A3
        elif len(sys_lines) >= 5:
            calib[s] = (sys_lines[0], None)
        else:
            calib[s] = (None, None)
    return calib


def extract_barlines(svg_content: str, notes_dom, breaks: list):
    """
    For each system return a sorted list of unique barline X values,
    including the initial system barline, with adjacent barlines (repeats) merged.
    """
    raw_by_sys = {}
    for m in re.finditer(r'<polyline class="BarLine"[^>]+points="([^"]+)"', svg_content):
        pts = m.group(1).strip().split()
        bx = float(pts[0].split(",")[0])
        by = float(pts[0].split(",")[1])
        s = sys_of(by, breaks)
        raw_by_sys.setdefault(s, set()).add(round(bx))

    merged = {}
    for s, xs_set in raw_by_sys.items():
        xs = sorted(xs_set)
        groups = []
        for x in xs:
            if groups and x - groups[-1][-1] <= MERGE_BL:
                groups[-1].append(x)
            else:
                groups.append([x])
        merged[s] = [round(sum(g) / len(g)) for g in groups]

    return merged  # sys -> sorted list of unique (merged) barline X values


def build_bar_to_xrange(barlines_by_sys: dict, notes_dom, breaks: list):
    """
    Build a mapping: bar_number (1-based) -> (system, x_lo, x_hi).

    Each system S has N_s barlines including the initial one.
    Bars in system S: (barlines[0], barlines[1]), (barlines[1], barlines[2]), ...,
                      (barlines[N_s-2], barlines[N_s-1])
    That gives N_s - 1 bars per system.
    """
    num_sys = len(breaks) + 1
    bar_map = {}
    bar_num = 1
    for s in range(num_sys):
        bls = barlines_by_sys.get(s, [])
        if len(bls) < 2:
            continue
        for i in range(len(bls) - 1):
            bar_map[bar_num] = (s, bls[i], bls[i + 1])
            bar_num += 1
    return bar_map


def expected_y(pitch: str, clef: str, sys_idx: int, calib: dict) -> float | None:
    """Return expected SVG Y position for a pitch in the given clef and system."""
    c = calib.get(sys_idx, (None, None))
    d = pitch_to_diatonic(pitch)
    if clef == "treble":
        y_top = c[0]
        if y_top is None:
            return None
        return y_top + (10 - d) * STEP   # F5 (d=10) is the top treble line
    else:
        y_top = c[1]
        if y_top is None:
            # Single-staff song: fall through to treble formula
            y_top = c[0]
            if y_top is None:
                return None
            return y_top + (10 - d) * STEP
        return y_top + (-2 - d) * STEP   # A3 (d=-2) is the top bass line


def match_events_to_notes(events, notes_dom, breaks, calib, bar_to_xrange):
    """
    Return list of DOM indices (one per event) mapping each JSON event to its SVG note.
    Returns -1 for events that couldn't be matched.
    """
    used = set()
    order = []

    for ev in events:
        bar  = ev["bar"]
        pitch = ev.get("notes", ["C4"])[0]
        clef  = ev.get("clef", "treble")

        info = bar_to_xrange.get(bar)
        if info is None:
            order.append(-1)
            continue

        s, x_lo, x_hi = info
        y_exp = expected_y(pitch, clef, s, calib)
        if y_exp is None:
            order.append(-1)
            continue

        best_idx, best_dist = -1, float("inf")
        for i, (nx, ny) in enumerate(notes_dom):
            if i in used:
                continue
            if sys_of(ny, breaks) != s:
                continue
            if not (x_lo - 5 < nx <= x_hi + 5):
                continue
            dist = abs(ny - y_exp)
            if dist < best_dist:
                best_dist = dist
                best_idx = i

        if best_idx >= 0:
            used.add(best_idx)
        order.append(best_idx)

    return order


def process_song(json_path: Path, force: bool = False) -> str:
    """Process one song JSON. Returns a status string."""
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    svg_rel = data.get("meta", {}).get("_svg_file")
    if not svg_rel:
        return "SKIP (no _svg_file)"

    svg_path = APP_ROOT / svg_rel
    if not svg_path.exists():
        return f"SKIP (SVG not found: {svg_rel})"

    # Collect JSON note events sorted by (bar, t_ms, treble-first)
    events = sorted(
        [
            ev
            for bar in data["score"]["bars"]
            for ev in bar.get("beats", [])
            if ev.get("type") == "note"
        ],
        key=lambda e: (e["bar"], e.get("t_ms", 0), 0 if e["clef"] == "treble" else 1),
    )

    notes_dom, svg_content = load_svg_notes(svg_path)
    n_svg, n_json = len(notes_dom), len(events)

    if n_svg == n_json and not force:
        if "_svg_note_order" in data.get("meta", {}):
            del data["meta"]["_svg_note_order"]
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write("\n")
        return f"OK ({n_json} notes match — no mapping needed)"

    if n_svg == n_json:
        return f"OK ({n_json} notes match — skipped)"

    # Mismatch: compute mapping
    breaks     = detect_system_breaks(notes_dom)
    calib      = calibrate_staves(svg_content, breaks)
    barlines   = extract_barlines(svg_content, notes_dom, breaks)
    bar_xrange = build_bar_to_xrange(barlines, notes_dom, breaks)

    order = match_events_to_notes(events, notes_dom, breaks, calib, bar_xrange)

    matched = sum(1 for x in order if x >= 0)
    unmatched_bars = sorted(set(events[i]["bar"] for i, x in enumerate(order) if x < 0))

    data["meta"]["_svg_note_order"] = order
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    status = f"MISMATCH {n_svg}svg/{n_json}json -> matched {matched}/{n_json}"
    if unmatched_bars:
        status += f"  unmatched bars: {unmatched_bars}"
    return status


def main():
    parser = argparse.ArgumentParser(description="Pre-compute SVG note map for mismatch songs")
    parser.add_argument("--song", metavar="JSON", help="Process a single song JSON")
    parser.add_argument("--all", action="store_true", help="Process all songs, not just mismatches")
    parser.add_argument("--force", action="store_true", help="Recompute even if already mapped")
    args = parser.parse_args()

    if args.song:
        p = SONGS_DIR / args.song
        print(f"[{p.name}]  {process_song(p, force=args.force)}")
        return

    for jf in sorted(SONGS_DIR.glob("*.json")):
        if jf.name in _SKIP:
            continue
        result = process_song(jf, force=args.force)
        print(f"[{jf.name[:45]:45s}]  {result}")


if __name__ == "__main__":
    main()
