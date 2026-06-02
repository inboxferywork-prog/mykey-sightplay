"""
update_song_index.py — Regenerate songs/index.json from songs/*.json files.

Schema version: 2

Field ownership:
  Derived from song.json (always overwritten):
    src, label, title, composer, level
  Curation fields (preserved from existing index.json):
    collectionId, listed

Migration defaults (applied only when no existing entry exists):
  listed = False  for files whose stem starts with 'test_' or is in KNOWN_FIXTURE_STEMS
  listed = True   for all other files (production songs)
  collectionId = None

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


# Non-test_* filestems that are fixtures, not production songs.
KNOWN_FIXTURE_STEMS: set[str] = {'simple_test'}

# MuseScore / importer placeholder values treated as absent.
PLACEHOLDER_TITLES: set[str]    = {'', 'untitled score', 'untitled'}
PLACEHOLDER_COMPOSERS: set[str] = {'', 'composer / arranger', 'composer/arranger'}


def _default_songs_dir() -> Path:
    return Path(__file__).resolve().parent.parent / 'songs'


def _is_fixture(stem: str) -> bool:
    """Return True for test/fixture files that should default to listed=False."""
    return stem.startswith('test_') or stem.lower() in KNOWN_FIXTURE_STEMS


def _display_title(meta: dict, stem: str) -> str:
    title = (meta.get('title') or '').strip()
    if title.lower() in PLACEHOLDER_TITLES:
        return stem
    return title


def _clean_composer(meta: dict) -> str | None:
    c = (meta.get('composer') or '').strip()
    if c.lower() in PLACEHOLDER_COMPOSERS:
        return None
    return c or None


def _time_sig(meta: dict) -> str:
    ts = meta.get('time_signature', [4, 4])
    if isinstance(ts, (list, tuple)) and len(ts) == 2:
        return f'{ts[0]}/{ts[1]}'
    return str(ts)


def _has_pickup(bars: list) -> bool:
    if not bars:
        return False
    bar1 = next((b for b in bars if b.get('bar') == 1), bars[0])
    events = bar1.get('beats', [])
    if not events:
        return False
    beat_values = []
    for event in events:
        b = event.get('beat')
        if b is not None:
            try:
                beat_values.append(float(b))
            except (TypeError, ValueError):
                pass
    return bool(beat_values) and min(beat_values) > 1


def _build_label(meta: dict, bars: list, learning_segments: list, stem: str) -> str:
    title     = _display_title(meta, stem)
    ts        = _time_sig(meta)
    bpm       = meta.get('bpm', 120)
    bar_count = len(bars)
    key       = (meta.get('key_signature') or 'C').strip()

    parts = [f'{title} — {ts} · {bpm} BPM · {bar_count} bars']
    tags  = []
    if _has_pickup(bars):
        tags.append('pickup')
    if key and key.upper() != 'C':
        tags.append(f'Key {key}')
    if learning_segments:
        tags.append('segments')
    if tags:
        parts.append(' · '.join(tags))
        return ' · '.join(parts)
    return parts[0]


def _load_existing_index(index_path: Path) -> dict[str, dict]:
    """
    Load the current index.json and return a {src: entry} map.
    Used to preserve curation fields (collectionId, listed) across regenerations.
    Returns an empty dict if the file does not exist or cannot be parsed.
    """
    if not index_path.exists():
        return {}
    try:
        data = json.loads(index_path.read_text(encoding='utf-8'))
        return {e['src']: e for e in data.get('songs', []) if e.get('src')}
    except Exception as exc:
        print(f'WARNING: could not read existing index.json ({exc}) — curation fields will use defaults', file=sys.stderr)
        return {}


def _process_file(path: Path, existing_entry: dict) -> dict | None:
    """
    Read one song.json and return its index entry.
    existing_entry: the current entry from index.json for this src path (may be empty dict).
    Returns None if the file cannot be parsed or is not a valid song.json.
    """
    try:
        with path.open(encoding='utf-8') as fh:
            data = json.load(fh)
    except json.JSONDecodeError as exc:
        print(f'WARNING: skipping {path.name} — JSON parse error: {exc}', file=sys.stderr)
        return None
    except OSError as exc:
        print(f'WARNING: skipping {path.name} — cannot read file: {exc}', file=sys.stderr)
        return None

    meta  = data.get('meta', {})
    score = data.get('score', {})

    # Require both meta and score — skips index copies, partial files, etc.
    if not meta or 'score' not in data:
        print(f'WARNING: skipping {path.name} — not a valid song.json (missing meta or score)', file=sys.stderr)
        return None

    bars              = score.get('bars', [])
    learning_segments = data.get('learning_segments') or []
    src               = f'songs/{path.name}'

    # ── Derived fields — always refreshed from song.json ──────────────────
    title    = _display_title(meta, path.stem)
    label    = _build_label(meta, bars, learning_segments, path.stem)
    composer = _clean_composer(meta)
    level    = meta.get('level') or None

    # ── Curation fields — preserved from existing entry; defaults on first run ──
    # listed: preserve if already set; otherwise default based on filename pattern.
    if 'listed' in existing_entry:
        listed = bool(existing_entry['listed'])
    else:
        listed = not _is_fixture(path.stem)

    # collectionId: preserve if already set; default None.
    collection_id = existing_entry.get('collectionId', None)

    # tags: preserve if already set; default empty list.
    existing_tags = existing_entry.get('tags', None)
    tags = existing_tags if isinstance(existing_tags, list) else []

    return {
        'src':          src,
        'label':        label,
        'title':        title,
        'composer':     composer,
        'level':        level,
        'collectionId': collection_id,
        'listed':       listed,
        'tags':         tags,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        '--songs-dir',
        type=Path,
        default=None,
        help='Path to the songs directory (default: <project_root>/songs)',
    )
    args = parser.parse_args()

    songs_dir: Path = args.songs_dir.resolve() if args.songs_dir else _default_songs_dir()

    if not songs_dir.is_dir():
        print(f'ERROR: songs directory not found: {songs_dir}', file=sys.stderr)
        return 1

    index_path   = songs_dir / 'index.json'
    existing_map = _load_existing_index(index_path)

    # Exclude index.json itself, collections.json, and any non-song JSON files.
    # Files without valid meta+score are skipped inside _process_file().
    excluded = {'index.json', 'index copy.json', 'collections.json'}
    song_files = sorted(
        (p for p in songs_dir.glob('*.json') if p.name not in excluded),
        key=lambda p: p.stem.lower(),
    )

    entries: list[dict] = []
    skipped = 0
    for path in song_files:
        existing_entry = existing_map.get(f'songs/{path.name}', {})
        entry = _process_file(path, existing_entry)
        if entry is not None:
            entries.append(entry)
        else:
            skipped += 1

    if not entries:
        print('ERROR: no valid song files found — index.json not written.', file=sys.stderr)
        return 1

    payload = {'version': 2, 'songs': entries}
    with index_path.open('w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write('\n')

    listed_count   = sum(1 for e in entries if e['listed'])
    unlisted_count = len(entries) - listed_count
    print(
        f'Written {len(entries)} songs to {index_path} '
        f'({listed_count} listed, {unlisted_count} unlisted)'
        + (f', {skipped} skipped' if skipped else '')
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
