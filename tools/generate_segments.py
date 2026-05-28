#!/usr/bin/env python3
"""
generate_segments.py — MyKey Music Labs / ariyadigital
Generate a starter learning_segments array from a song.json file.

The generator produces N-bar groups with sensible defaults. The instructor
reviews and refines labels, repeat counts, and beat precision before shipping.

Usage:
    python tools/generate_segments.py songs/my_song.json
    python tools/generate_segments.py songs/my_song.json --bars 2 --repeats 3
    python tools/generate_segments.py songs/my_song.json --bars 4 --in-place

Output (without --in-place):
    Prints the learning_segments array as formatted JSON to stdout.
    Paste it into song.json manually, then validate with validate_song.py.

Output (with --in-place):
    Replaces the learning_segments key inside the source song.json.
    All other fields (score, parts, meta, scoring) are untouched.

Exit codes:
    0 = success
    1 = error (file not found, invalid JSON, bad arguments)
"""

import argparse
import json
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Letter label helpers (a, b, ..., z, aa, ab, ...)
# ---------------------------------------------------------------------------

def _index_to_letters(n: int) -> str:
    """Convert a 0-based index to an alphabetical suffix: 0→a, 25→z, 26→aa."""
    letters = ""
    n += 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        letters = chr(ord("a") + rem) + letters
    return letters


def _make_segment_id(index: int) -> str:
    return "seg_phrase_" + _index_to_letters(index)


def _make_label(index: int, lang: str) -> str:
    suffix = _index_to_letters(index).upper()
    return f"Phrase {suffix}" if lang == "en" else f"Frasa {suffix}"


# ---------------------------------------------------------------------------
# Pickup detection
# ---------------------------------------------------------------------------

def _detect_pickup(bars_data: list):
    """
    Returns (is_pickup: bool, min_beat: float|None).
    A pickup bar is bar 1 where the minimum beat value > 1.
    """
    for bar in bars_data:
        if not isinstance(bar, dict) or bar.get("bar") != 1:
            continue
        beats_list = bar.get("beats", [])
        if not beats_list:
            return False, None
        try:
            min_beat = min(b["beat"] for b in beats_list if isinstance(b, dict) and "beat" in b)
        except (ValueError, KeyError):
            return False, None
        return min_beat > 1, min_beat
    return False, None


# ---------------------------------------------------------------------------
# Segment generation
# ---------------------------------------------------------------------------

def _generate_segments(bar_numbers: list, bars_per_group: int, repeats: int, lang: str) -> list:
    """
    Group bar_numbers into chunks of bars_per_group.
    end_bar uses the exclusive-end convention: first bar AFTER the segment.
    The last segment's end_bar = last_bar + 1 (runtime treats null t_ms as Infinity).
    """
    if not bar_numbers:
        return []

    groups = [bar_numbers[i:i + bars_per_group] for i in range(0, len(bar_numbers), bars_per_group)]
    last_bar = bar_numbers[-1]
    segments = []

    for idx, group in enumerate(groups):
        is_last = idx == len(groups) - 1
        end_bar = groups[idx + 1][0] if not is_last else last_bar + 1

        segments.append({
            "segment_id":        _make_segment_id(idx),
            "label":             _make_label(idx, lang),
            "start_bar":         group[0],
            "start_beat":        1,
            "end_bar":           end_bar,
            "end_beat":          1,
            "suggested_repeats": repeats,
            "order":             idx + 1,
        })

    return segments


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate starter learning_segments for a MyKey song.json file.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  python tools/generate_segments.py songs/my_song.json
  python tools/generate_segments.py songs/my_song.json --bars 2 --repeats 3
  python tools/generate_segments.py songs/my_song.json --bars 4 --in-place

After generating, review the output for:
  - Musical phrase boundaries (adjust start_bar / end_bar)
  - Meaningful labels (not just "Frasa A")
  - Appropriate suggested_repeats (1-3 for most passages)
  - Beat precision (start_beat / end_beat are set to 1 — refine if needed)

Then validate with:
  python tools/validate_song.py songs/my_song.json
        """,
    )
    parser.add_argument("input", help="Path to song.json")
    parser.add_argument(
        "--bars", type=int, default=4, metavar="N",
        help="Bar group size per segment (default: 4)",
    )
    parser.add_argument(
        "--repeats", type=int, default=1, metavar="N",
        help="Default suggested_repeats per segment (default: 1)",
    )
    parser.add_argument(
        "--lang", choices=["id", "en"], default="id",
        help="Label language: id=Indonesian, en=English (default: id)",
    )
    parser.add_argument(
        "--in-place", action="store_true",
        help="Write learning_segments back into the input file (modifies in place). "
             "Without this flag, output is printed to stdout.",
    )
    args = parser.parse_args()

    if args.bars <= 0:
        print("ERROR: --bars must be a positive integer", file=sys.stderr)
        sys.exit(1)
    if args.repeats <= 0:
        print("ERROR: --repeats must be a positive integer", file=sys.stderr)
        sys.exit(1)

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERROR: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    try:
        with open(input_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON — {e}", file=sys.stderr)
        sys.exit(1)
    except OSError as e:
        print(f"ERROR: Cannot read file — {e}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(data, dict) or "score" not in data or "bars" not in data.get("score", {}):
        print("ERROR: Missing score.bars in song.json", file=sys.stderr)
        sys.exit(1)

    bars_data   = data["score"]["bars"]
    bar_numbers = sorted(
        b["bar"] for b in bars_data
        if isinstance(b, dict) and isinstance(b.get("bar"), int)
    )

    if not bar_numbers:
        print("ERROR: No bars found in score.bars", file=sys.stderr)
        sys.exit(1)

    meta        = data.get("meta", {})
    title       = meta.get("title", input_path.stem)
    total_bars  = len(bar_numbers)
    num_segs    = (total_bars + args.bars - 1) // args.bars  # ceiling division

    # Pickup detection — informational only
    is_pickup, min_beat = _detect_pickup(bars_data)
    if is_pickup:
        print(
            f"Note: Bar 1 appears to be a pickup bar (minimum beat = {min_beat}). "
            f"It is included in the first segment.",
            file=sys.stderr,
        )

    segments = _generate_segments(bar_numbers, args.bars, args.repeats, args.lang)

    if args.in_place:
        existing = data.get("learning_segments")
        if existing is not None:
            print(
                f"Warning: {input_path} already has {len(existing)} learning_segment(s). "
                f"They will be replaced.",
                file=sys.stderr,
            )
        data["learning_segments"] = segments
        try:
            with open(input_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write("\n")
        except OSError as e:
            print(f"ERROR: Cannot write file — {e}", file=sys.stderr)
            sys.exit(1)
        print(
            f"Written {len(segments)} segment(s) to {input_path} "
            f"({total_bars} bars → {num_segs} segment(s) @ {args.bars} bars each)"
        )
    else:
        header = (
            f"# Song    : {title}\n"
            f"# Bars    : {total_bars} bars -> {num_segs} segment(s) @ {args.bars} bars each\n"
            f"# Language: {'Indonesian' if args.lang == 'id' else 'English'}\n"
            f"#\n"
            f"# Paste this into your song.json as \"learning_segments\".\n"
            f"# Review and refine labels, repeats, and beat precision before shipping.\n"
            f"# Then validate: python tools/validate_song.py {input_path}\n"
        )
        print(header)
        print(json.dumps(segments, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
