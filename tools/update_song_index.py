"""
update_song_index.py — Regenerate songs/index.json from songs/*.json files.

Usage (from project root):
    python tools/update_song_index.py

    # Override the songs directory:
    python tools/update_song_index.py --songs-dir songs/

Exit codes:
    0 — success
    1 — no songs found
"""

import argparse
import json
import sys
from pathlib import Path


def _default_songs_dir() -> Path:
    """Return <project_root>/songs, where project_root is the parent of this script's directory."""
    return Path(__file__).resolve().parent.parent / "songs"


def _display_title(meta: dict, stem: str) -> str:
    """Return a human-readable title, falling back to the filename stem when needed."""
    title = (meta.get("title") or "").strip()
    if title.lower() in ("", "untitled score", "untitled"):
        return stem
    return title


def _time_sig(meta: dict) -> str:
    ts = meta.get("time_signature", [4, 4])
    if isinstance(ts, (list, tuple)) and len(ts) == 2:
        return f"{ts[0]}/{ts[1]}"
    return str(ts)


def _has_pickup(bars: list) -> bool:
    """Return True if bar 1 has all events starting after beat 1 (pickup bar).
    song.json uses 'beats' as the key for the events array inside each bar object.
    """
    if not bars:
        return False
    # Find bar 1 (may not be the first entry if bars are unsorted)
    bar1 = next((b for b in bars if b.get("bar") == 1), bars[0])
    events = bar1.get("beats", [])   # song.json key is "beats", not "events"
    if not events:
        return False
    beat_values = []
    for event in events:
        b = event.get("beat")
        if b is not None:
            try:
                beat_values.append(float(b))
            except (TypeError, ValueError):
                pass
    if not beat_values:
        return False
    return min(beat_values) > 1


def _build_label(meta: dict, bars: list, learning_segments: list, stem: str) -> str:
    """Construct the human-readable label string for one song."""
    title = _display_title(meta, stem)
    ts = _time_sig(meta)
    bpm = meta.get("bpm", 120)
    bar_count = len(bars)
    key = (meta.get("key_signature") or "C").strip()

    parts = [f"{title} — {ts} · {bpm} BPM · {bar_count} bars"]

    tags = []
    if _has_pickup(bars):
        tags.append("pickup")
    if key and key.upper() != "C":
        tags.append(f"Key {key}")
    if learning_segments:
        tags.append("segments")

    if tags:
        parts.append(" · ".join(tags))
        return " · ".join(parts)  # re-join with middle dot separator
    return parts[0]


def _process_file(path: Path) -> dict | None:
    """Read a single song JSON and return its index entry, or None on error."""
    try:
        with path.open(encoding="utf-8") as fh:
            data = json.load(fh)
    except json.JSONDecodeError as exc:
        print(f"WARNING: skipping {path.name} — JSON parse error: {exc}", file=sys.stderr)
        return None
    except OSError as exc:
        print(f"WARNING: skipping {path.name} — cannot read file: {exc}", file=sys.stderr)
        return None

    meta = data.get("meta", {})
    score = data.get("score", {})
    bars = score.get("bars", [])
    learning_segments = data.get("learning_segments") or []

    label = _build_label(meta, bars, learning_segments, path.stem)

    # Always use forward slashes so the path is valid as a URL/fetch key in the browser.
    src = f"songs/{path.name}"
    return {"src": src, "label": label}


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--songs-dir",
        type=Path,
        default=None,
        help="Path to the songs directory (default: <project_root>/songs)",
    )
    args = parser.parse_args()

    songs_dir: Path = args.songs_dir.resolve() if args.songs_dir else _default_songs_dir()

    if not songs_dir.is_dir():
        print(f"ERROR: songs directory not found: {songs_dir}", file=sys.stderr)
        return 1

    # Collect all *.json files except index.json itself, sorted by stem.
    song_files = sorted(
        (p for p in songs_dir.glob("*.json") if p.name != "index.json"),
        key=lambda p: p.stem.lower(),
    )

    entries = []
    for path in song_files:
        entry = _process_file(path)
        if entry is not None:
            entries.append(entry)

    if not entries:
        print("ERROR: no valid song files found — index.json not written.", file=sys.stderr)
        return 1

    index_path = songs_dir / "index.json"
    payload = {"songs": entries}
    with index_path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print(f"Written {len(entries)} songs to {index_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
