#!/usr/bin/env python3
"""
authoring_server.py — Local server for Authoring.html .mscz import pipeline.

Receives a .mscz file from Authoring.html, exports SVG + MXL via MuseScore CLI,
converts MXL to song.json via mxl_to_song.py, and returns the complete song.json.

Usage:
    python tools/authoring_server.py            # default port 7777
    python tools/authoring_server.py --port 8888

Requirements:
    pip install flask
    pip install music21   (already required by mxl_to_song.py)
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

try:
    from flask import Flask, request, jsonify, Response
except ImportError:
    print("ERROR: Flask not installed.")
    print("Run: pip install flask")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR  = Path(__file__).parent
APP_ROOT    = SCRIPT_DIR.parent
SONGS_DIR   = APP_ROOT / "songs"
SVG_DIR     = SONGS_DIR / "svg"
CONFIG_FILE = SCRIPT_DIR / "server_config.json"
MXL_TO_SONG = SCRIPT_DIR / "mxl_to_song.py"

DEFAULT_PORT = 7777

# Standard Windows installation paths (checked in order)
MS4_CANDIDATE_PATHS = [
    Path(r"C:\Program Files\MuseScore 4\bin\MuseScore4.exe"),
    Path(r"D:\Program Files\MuseScore 4\bin\MuseScore4.exe"),
    Path(r"E:\Program Files\MuseScore 4\bin\MuseScore4.exe"),
    Path(r"C:\Program Files (x86)\MuseScore 4\bin\MuseScore4.exe"),
]
MS3_CANDIDATE_PATHS = [
    Path(r"C:\Program Files\MuseScore 3\bin\MuseScore3.exe"),
    Path(r"D:\Program Files\MuseScore 3\bin\MuseScore3.exe"),
    Path(r"E:\Program Files\MuseScore 3\bin\MuseScore3.exe"),
    Path(r"C:\Program Files (x86)\MuseScore 3\bin\MuseScore3.exe"),
]

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__)


@app.after_request
def _add_cors(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/", methods=["OPTIONS"])
@app.route("/<path:p>", methods=["OPTIONS"])
def _options(p=""):
    return Response("", 204, headers={
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    })


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def _load_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_config(cfg: dict) -> None:
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------------------
# MuseScore detection
# ---------------------------------------------------------------------------

def _find_musescore(prefer_version: int | None = None):
    """
    Return (Path, version) for the best available MuseScore exe.
    prefer_version: 3 or 4 to prefer that version, None to try 4 then 3.
    """
    cfg = _load_config()

    def _check(path_str, version):
        if path_str:
            p = Path(path_str)
            if p.exists():
                return p, version
        return None, None

    # Config takes priority
    if prefer_version in (None, 4):
        p, v = _check(cfg.get("musescore4_exe"), 4)
        if p:
            return p, v
    if prefer_version in (None, 3):
        p, v = _check(cfg.get("musescore3_exe"), 3)
        if p:
            return p, v

    # Auto-detect standard paths
    if prefer_version in (None, 4):
        for cand in MS4_CANDIDATE_PATHS:
            if cand.exists():
                return cand, 4
    if prefer_version in (None, 3):
        for cand in MS3_CANDIDATE_PATHS:
            if cand.exists():
                return cand, 3

    return None, None


def _detect_mscz_version(mscz_path: Path) -> int:
    """Return 4 if MS4 format (.mscz contains audiosettings.json), else 3."""
    try:
        with zipfile.ZipFile(mscz_path) as z:
            if any("audiosettings.json" in n for n in z.namelist()):
                return 4
    except Exception:
        pass
    return 3


def _get_exe_for(mscz_path: Path) -> Path | None:
    """Return MuseScore exe appropriate for this .mscz (MS3/MS4 aware)."""
    preferred = _detect_mscz_version(mscz_path)
    exe, _ = _find_musescore(preferred)
    if exe:
        return exe
    # Fallback: try the other version
    exe, _ = _find_musescore(3 if preferred == 4 else 4)
    return exe


# ---------------------------------------------------------------------------
# SVG crop helper (mirrors _compute_svg_crop in mxl_to_song.py)
# ---------------------------------------------------------------------------
_CROP_PAD_TOP = 150
_CROP_PAD     = 60
_CROP_MIN_H   = 600


def _compute_svg_crop(svg_path: Path) -> dict | None:
    try:
        content = svg_path.read_text(encoding="utf-8")
    except OSError:
        return None
    m = re.search(r'viewBox="([^"]+)"', content)
    if not m:
        return None
    parts = m.group(1).split()
    vbW, vbH = float(parts[2]), float(parts[3])
    matrices = re.findall(r'transform="matrix\(([^)]+)\)"', content)
    xs, ys = [], []
    for mat in matrices:
        ps = mat.split(",")
        if len(ps) >= 6:
            try:
                xs.append(float(ps[4]))
                ys.append(float(ps[5]))
            except ValueError:
                pass
    if not xs:
        return None
    xMin, xMax = min(xs), max(xs)
    yMin, yMax = min(ys), max(ys)
    top    = max(0, int(yMin) - _CROP_PAD_TOP)
    left   = max(0, int(xMin) - _CROP_PAD)
    right  = max(0, int(vbW - xMax) - _CROP_PAD)
    offset = int(yMin) - top
    min_h  = offset + int(yMax - yMin) + _CROP_PAD + _CROP_MIN_H
    bottom = min(max(0, int(vbH - yMax) - _CROP_PAD),
                 max(0, int(vbH) - top - min_h))
    return {"top": top, "bottom": bottom, "left": left, "right": right}


# ---------------------------------------------------------------------------
# Slug helper
# ---------------------------------------------------------------------------

def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s)
    return s.strip("-") or "untitled"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.route("/status")
def status():
    exe4, _ = _find_musescore(4)
    exe3, _ = _find_musescore(3)
    cfg = _load_config()
    return jsonify({
        "ok": True,
        "musescore4": str(exe4) if exe4 else None,
        "musescore3": str(exe3) if exe3 else None,
        "musescore_found": bool(exe4 or exe3),
        "config": cfg,
    })


@app.route("/config", methods=["POST"])
def set_config():
    data = request.get_json(force=True)
    cfg  = _load_config()
    for key in ("musescore3_exe", "musescore4_exe"):
        if key in data:
            cfg[key] = data[key]
    _save_config(cfg)
    # Re-detect after saving
    exe4, _ = _find_musescore(4)
    exe3, _ = _find_musescore(3)
    return jsonify({
        "ok": True,
        "config": cfg,
        "musescore_found": bool(exe4 or exe3),
    })


@app.route("/import-mscz", methods=["POST"])
def import_mscz():
    if "mscz" not in request.files:
        return jsonify({"error": "No mscz file in request"}), 400

    mscz_file = request.files["mscz"]
    bpm        = request.form.get("bpm", "").strip()
    level      = request.form.get("level", "early_beginner")
    part_size  = request.form.get("part_size", "4")
    song_id    = request.form.get("song_id", "").strip()

    with tempfile.TemporaryDirectory() as tmp_str:
        tmp = Path(tmp_str)

        # Save .mscz
        mscz_name = mscz_file.filename or "song.mscz"
        mscz_path = tmp / mscz_name
        mscz_file.save(str(mscz_path))

        # Derive slug
        stem = song_id or Path(mscz_name).stem
        slug = _slugify(stem)

        # Resolve MuseScore exe
        exe = _get_exe_for(mscz_path)
        if not exe:
            return jsonify({
                "error": "MuseScore not found. Configure the path in Authoring.html → Import .mscz panel."
            }), 500

        # ── Step 1: Export .mxl ─────────────────────────────────────────
        mxl_path = tmp / f"{slug}.mxl"
        try:
            r = subprocess.run(
                [str(exe), "-o", str(mxl_path), str(mscz_path)],
                capture_output=True, timeout=90,
            )
            if not mxl_path.exists():
                stderr = r.stderr.decode(errors="replace")
                return jsonify({"error": f"MXL export failed:\n{stderr}"}), 500
        except subprocess.TimeoutExpired:
            return jsonify({"error": "MuseScore timed out during MXL export (>90s)"}), 500
        except Exception as e:
            return jsonify({"error": f"MuseScore MXL export error: {e}"}), 500

        # ── Step 2: Export .svg ─────────────────────────────────────────
        SVG_DIR.mkdir(parents=True, exist_ok=True)
        svg_base = SVG_DIR / f"{slug}.svg"
        try:
            subprocess.run(
                [str(exe), "-o", str(svg_base), str(mscz_path)],
                capture_output=True, timeout=90,
            )
        except subprocess.TimeoutExpired:
            return jsonify({"error": "MuseScore timed out during SVG export (>90s)"}), 500
        except Exception as e:
            return jsonify({"error": f"MuseScore SVG export error: {e}"}), 500

        # MuseScore adds page suffix: slug-1.svg, slug-2.svg, ...
        svg_pages = sorted(SVG_DIR.glob(f"{slug}-*.svg"))
        if not svg_pages and svg_base.exists():
            svg_pages = [svg_base]
        if not svg_pages:
            return jsonify({"error": "SVG export produced no output (check MuseScore installation)"}), 500
        svg_file = svg_pages[0]

        # ── Step 3: mxl_to_song.py ─────────────────────────────────────
        json_out = tmp / f"{slug}.json"
        cmd = [
            sys.executable, str(MXL_TO_SONG),
            str(mxl_path), str(json_out),
            "--level", level,
            "--part-size", part_size,
        ]
        if bpm:
            cmd += ["--bpm", bpm]
        if song_id:
            cmd += ["--id", song_id]

        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if not json_out.exists():
                return jsonify({"error": f"mxl_to_song.py failed:\n{r.stderr[-2000:]}"}), 500
        except subprocess.TimeoutExpired:
            return jsonify({"error": "mxl_to_song.py timed out (>120s)"}), 500
        except Exception as e:
            return jsonify({"error": f"mxl_to_song.py error: {e}"}), 500

        # ── Step 4: Patch _svg_file + _svg_crop ────────────────────────
        song_data = json.loads(json_out.read_text(encoding="utf-8"))

        svg_rel = str(svg_file.relative_to(APP_ROOT)).replace("\\", "/")
        song_data["meta"]["_svg_file"] = svg_rel

        crop = _compute_svg_crop(svg_file)
        if crop:
            song_data["meta"]["_svg_crop"] = crop

        return jsonify(song_data)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="MyKey Authoring Server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help=f"Port to listen on (default: {DEFAULT_PORT})")
    args = parser.parse_args()

    exe4, _ = _find_musescore(4)
    exe3, _ = _find_musescore(3)

    print(f"MyKey Authoring Server  —  http://localhost:{args.port}")
    print()
    if exe4:
        print(f"  MuseScore 4 : {exe4}")
    if exe3:
        print(f"  MuseScore 3 : {exe3}")
    if not exe4 and not exe3:
        print("  WARNING: MuseScore not found at standard paths.")
        print("  Open Authoring.html → Import .mscz → configure the MuseScore path.")
    print()
    print("  Ready. Open Authoring.html in browser.")
    print("  Press Ctrl+C to stop.")
    print()

    app.run(host="localhost", port=args.port, debug=False)


if __name__ == "__main__":
    main()
