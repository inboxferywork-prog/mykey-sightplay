#!/usr/bin/env python3
"""
export_svg.py — Export MuseScore .mscz to SVG and patch song.json _svg_file field.

Usage (single song):
    python tools/export_svg.py \\
        --mscz "D:/path/to/song.mscz" \\
        --json "songs/Song Name.json"

Usage (batch — auto-match all song JSONs to .mscz files):
    python tools/export_svg.py --batch

The --batch flag scans songs/*.json, finds a matching .mscz in MSCZ_SEARCH_PATHS,
exports SVG to songs/svg/, and patches _svg_file into the song meta.
Songs that already have _svg_file are skipped (use --overwrite to force).
"""

import argparse
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

# MuseScore binaries — MuseScore 4 takes priority for MS4 format files
MUSESCORE3_EXE = Path(r"D:\Program Files\MuseScore 3\bin\MuseScore3.exe")
MUSESCORE4_EXE = Path(r"C:\Program Files\MuseScore 4\bin\MuseScore4.exe")

# Search paths for .mscz files (checked in order)
MSCZ_SEARCH_PATHS = [
    Path(r"D:\Download D\Project Apps Music Learning\kumpulan musescore files"),
    Path(r"D:\Download D\Project Apps Music Learning\kumpulan musescore files\Yamaha Primary"),
]

SCRIPT_DIR = Path(__file__).parent
APP_ROOT   = SCRIPT_DIR.parent
SONGS_DIR  = APP_ROOT / "songs"
SVG_DIR    = SONGS_DIR / "svg"

# Song JSONs to skip in batch mode
_SKIP_FILES = {"index.json", "collections.json", "simple_test.json"}


def musescore_exe_for(mscz_path: Path) -> Path:
    """
    Return the appropriate MuseScore binary for the given .mscz file.
    MuseScore 4 .mscz files contain audiosettings.json; MuseScore 3 files do not.
    Falls back to whichever binary is available.
    """
    is_ms4 = False
    try:
        with zipfile.ZipFile(mscz_path) as z:
            is_ms4 = any("audiosettings.json" in n for n in z.namelist())
    except Exception:
        pass
    if is_ms4 and MUSESCORE4_EXE.exists():
        return MUSESCORE4_EXE
    if MUSESCORE3_EXE.exists():
        return MUSESCORE3_EXE
    return MUSESCORE4_EXE  # last resort


def slugify(name: str) -> str:
    """'0503 An Ukrainian Girl' → '0503-an-ukrainian-girl'"""
    s = name.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    return s.strip("-")


def find_mscz(json_stem: str) -> Path | None:
    """
    Locate a .mscz that corresponds to json_stem.
    Strategy:
      1. Exact match: json_stem + '.mscz'
      2. Prefix match on the leading 4-char number code (e.g. '0101')
    """
    for search_dir in MSCZ_SEARCH_PATHS:
        if not search_dir.exists():
            continue
        # Exact
        candidate = search_dir / (json_stem + ".mscz")
        if candidate.exists():
            return candidate
        # Prefix (number code)
        prefix = json_stem[:4]
        if prefix.isdigit() or (len(prefix) == 4 and prefix[:2].isdigit()):
            for f in sorted(search_dir.glob("*.mscz")):
                if f.stem.startswith(prefix):
                    return f
    return None


def run_musescore_export(mscz_path: Path, svg_base: Path) -> list[Path]:
    """
    Run the appropriate MuseScore CLI to export svg_base.svg.
    Auto-detects MuseScore 3 vs 4 format and uses the matching binary.
    Returns sorted list of generated .svg files, empty on failure.
    """
    SVG_DIR.mkdir(parents=True, exist_ok=True)
    exe = musescore_exe_for(mscz_path)
    try:
        subprocess.run(
            [str(exe), "-o", str(svg_base), str(mscz_path)],
            check=True, capture_output=True, timeout=90,
        )
    except subprocess.CalledProcessError as e:
        print(f"  ERROR MuseScore exit {e.returncode}", file=sys.stderr)
        return []
    except subprocess.TimeoutExpired:
        print("  ERROR MuseScore timed out", file=sys.stderr)
        return []
    except FileNotFoundError:
        print(f"  ERROR MuseScore not found: {MUSESCORE_EXE}", file=sys.stderr)
        return []

    # Collect output pages: stem-1.svg, stem-2.svg …
    stem = svg_base.stem
    pages = sorted(SVG_DIR.glob(f"{stem}-*.svg"))
    if not pages and svg_base.exists():
        pages = [svg_base]
    return pages


def stitch_svg_pages(pages: list[Path], out_path: Path) -> Path:
    """
    Stitch multiple MuseScore SVG pages into one tall SVG by stacking them
    vertically. Each page's content is wrapped in a <g translate(0,offset)>
    so all coordinates stay in the same space as _buildSvgNoteMap() expects.

    If only one page is given, it is returned as-is without writing out_path.
    The stitched file is written to out_path and that path is returned.
    """
    if len(pages) == 1:
        return pages[0]

    contents = [p.read_text(encoding="utf-8") for p in pages]

    def _viewbox(text):
        m = re.search(r'viewBox="([^"]+)"', text)
        if not m:
            return 0.0, 0.0, 3060.0, 3960.0  # MuseScore A4 default
        parts = m.group(1).split()
        return float(parts[0]), float(parts[1]), float(parts[2]), float(parts[3])

    vboxes = [_viewbox(c) for c in contents]
    vbW    = vboxes[0][2]
    total_h = sum(vb[3] for vb in vboxes)

    # ── Build combined SVG ────────────────────────────────────────────────
    # Take the opening <svg ...> tag from page 1 and update its viewBox.
    # Remove width/height attributes so the SVG scales responsively.
    first = contents[0]

    def _strip_wh(text):
        text = re.sub(r'\s+width="[^"]*"', '', text, count=1)
        text = re.sub(r'\s+height="[^"]*"', '', text, count=1)
        return text

    combined = re.sub(
        r'viewBox="[^"]*"',
        f'viewBox="0 0 {vbW} {total_h}"',
        _strip_wh(first),
        count=1,
    )
    # Strip closing </svg> from page 1 — we'll re-add it at the end
    combined = combined.rsplit("</svg>", 1)[0]

    # Append pages 2..N each inside a translated <g>
    y_offset = vboxes[0][3]
    for i, content in enumerate(contents[1:], 1):
        # Extract everything between <svg...> and </svg>
        m = re.search(r"<svg[^>]*>(.*)</svg>", content, re.DOTALL)
        body = m.group(1) if m else content
        combined += f'\n<g transform="translate(0,{y_offset:.2f})">\n{body}\n</g>\n'
        y_offset += vboxes[i][3]

    combined += "</svg>\n"

    out_path.write_text(combined, encoding="utf-8")
    return out_path


def export_svg(mscz_path: Path, svg_slug: str) -> Path | None:
    """
    Export mscz_path as SVG. Multi-page scores are stitched into one tall SVG.
    Returns the final SVG file path, or None on failure.
    """
    svg_base = SVG_DIR / f"{svg_slug}.svg"
    print(f"  Exporting: {mscz_path.name} ...", end=" ", flush=True)
    pages = run_musescore_export(mscz_path, svg_base)
    if not pages:
        print("FAILED")
        return None

    if len(pages) == 1:
        print("OK")
        return pages[0]

    # Multi-page: stitch into one tall SVG
    stitched = SVG_DIR / f"{svg_slug}-full.svg"
    stitch_svg_pages(pages, stitched)
    print(f"OK ({len(pages)} pages → stitched as {stitched.name})")
    return stitched


_SVG_CROP_PAD_TOP = 150  # top breathing room — leaves ~53px above first note for count-in pills
_SVG_CROP_PAD     = 60   # sides and bottom breathing room (SVG viewBox units)
_SVG_CROP_MIN_H   = 600  # minimum cropped viewBox height so short scores stay readable


def compute_svg_crop(svg_path: Path) -> dict | None:
    """
    Return crop values {top, bottom, left, right} for the given SVG file.
    Crops are in SVG viewBox units and remove MuseScore page margins / title area.
    Returns None if the SVG cannot be analysed.
    """
    try:
        content = svg_path.read_text(encoding="utf-8")
    except OSError:
        return None

    vb_m = re.search(r'viewBox="([^"]+)"', content)
    if not vb_m:
        return None
    vb_parts = vb_m.group(1).split()
    vbW, vbH = float(vb_parts[2]), float(vb_parts[3])

    matrices = re.findall(r'transform="matrix\(([^)]+)\)"', content)
    xs, ys = [], []
    for m in matrices:
        parts = m.split(",")
        if len(parts) >= 6:
            try:
                xs.append(float(parts[4]))
                ys.append(float(parts[5]))
            except ValueError:
                pass
    if not xs:
        return None

    xMin, xMax = min(xs), max(xs)
    yMin, yMax = min(ys), max(ys)

    top  = max(0, int(yMin) - _SVG_CROP_PAD_TOP)
    left = max(0, int(xMin) - _SVG_CROP_PAD)
    right = max(0, int(vbW - xMax) - _SVG_CROP_PAD)

    # Bottom: don't crop so aggressively that the viewBox height drops below MIN_H
    # (prevents single-system songs from collapsing to a thin sliver).
    content_offset = int(yMin) - top   # == _SVG_CROP_PAD_TOP
    min_crop_h   = content_offset + int(yMax - yMin) + _SVG_CROP_PAD + _SVG_CROP_MIN_H
    max_bottom   = max(0, int(vbH) - top - min_crop_h)
    raw_bottom   = max(0, int(vbH - yMax) - _SVG_CROP_PAD)
    bottom = min(raw_bottom, max_bottom)

    return {"top": top, "bottom": bottom, "left": left, "right": right}


def patch_json(json_path: Path, svg_rel: str, svg_crop: dict | None,
               overwrite: bool = False) -> bool:
    """Add/update _svg_file (and _svg_crop) in song meta. Returns True if file was written."""
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    existing = data.get("meta", {}).get("_svg_file")
    if existing and not overwrite:
        print(f"  SKIP patch: _svg_file already '{existing}'")
        return False
    data["meta"]["_svg_file"] = svg_rel
    if svg_crop:
        data["meta"]["_svg_crop"] = svg_crop
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    return True


def process_one(mscz_path: Path, json_path: Path, overwrite: bool = False) -> bool:
    svg_slug = slugify(json_path.stem)
    svg_path = export_svg(mscz_path, svg_slug)
    if svg_path is None:
        return False
    svg_rel  = str(svg_path.relative_to(APP_ROOT)).replace("\\", "/")
    svg_crop = compute_svg_crop(svg_path)
    if svg_crop:
        print(f"  Crop:     {svg_crop}")
    else:
        print("  Crop:     could not compute — skipped")
    modified = patch_json(json_path, svg_rel, svg_crop, overwrite=overwrite)
    if modified:
        print(f"  Patched:  {json_path.name}  ->  _svg_file = '{svg_rel}'")
    return True


def batch_mode(overwrite: bool = False):
    json_files = sorted(f for f in SONGS_DIR.glob("*.json") if f.name not in _SKIP_FILES)
    done = skipped = 0
    for jp in json_files:
        print(f"\n[{jp.name}]")
        if not overwrite:
            with open(jp, encoding="utf-8") as f:
                if json.load(f).get("meta", {}).get("_svg_file"):
                    print("  SKIP: already has _svg_file")
                    skipped += 1
                    continue
        mscz = find_mscz(jp.stem)
        if mscz is None:
            print("  SKIP: no matching .mscz found")
            skipped += 1
            continue
        print(f"  Found:  {mscz}")
        if process_one(mscz, jp, overwrite=overwrite):
            done += 1
        else:
            skipped += 1
    print(f"\nDone: {done} exported, {skipped} skipped.")


def main():
    parser = argparse.ArgumentParser(
        description="Export MuseScore .mscz to SVG and patch song.json",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Single song:
  python tools/export_svg.py --mscz "D:/kumpulan musescore files/0504 Ballon Trip.mscz" \\
                              --json "songs/0504 Ballon Trip.json"

  # Batch all songs with a matching .mscz:
  python tools/export_svg.py --batch

  # Force re-export even when _svg_file already set:
  python tools/export_svg.py --batch --overwrite
        """,
    )
    parser.add_argument("--mscz",      metavar="PATH",  help=".mscz input file")
    parser.add_argument("--json",      metavar="PATH",  help="song .json to patch")
    parser.add_argument("--batch",     action="store_true", help="auto-process all songs")
    parser.add_argument("--overwrite", action="store_true", help="re-export even if _svg_file exists")
    args = parser.parse_args()

    if args.batch:
        batch_mode(overwrite=args.overwrite)
    elif args.mscz and args.json:
        mscz_path = Path(args.mscz)
        json_path = Path(args.json)
        for p, label in [(mscz_path, "--mscz"), (json_path, "--json")]:
            if not p.exists():
                print(f"ERROR: {label} not found: {p}", file=sys.stderr)
                sys.exit(1)
        ok = process_one(mscz_path, json_path, overwrite=args.overwrite)
        sys.exit(0 if ok else 1)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
