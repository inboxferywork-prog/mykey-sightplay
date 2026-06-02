#!/usr/bin/env python3
"""
replace_song.py — MyKey Music Labs
Safe atomic replace of an existing song.json from a new MXL source.

Workflow (7 steps):
  1. Backup  — copy existing song.json to .bak
  2. Convert — run mxl_to_song.py -> .tmp file
  3. Gate 1  — validate .tmp; abort on any error
  4. Merge   — copy preserved fields from existing into .tmp
  5. Gate 2  — validate merged .tmp; abort on any error
  6. Replace — os.replace(.tmp -> target) — atomic
  7. Reindex — run update_song_index.py

Preserved fields (from existing song.json, never overwritten):
  meta.id, meta.level
  meta.title   (if existing is non-placeholder)
  meta.composer (if existing is non-placeholder)
  learning_segments, scoring

Usage (from project root):
    python tools/replace_song.py <input.mxl> <songs/existing_song.json>
    python tools/replace_song.py <input.mxl> <songs/existing_song.json> --level beginner
    python tools/replace_song.py <input.mxl> <songs/existing_song.json> --bpm 96 --dry-run

Exit codes:
    0 — success (or dry-run completed with no errors)
    1 — validation failed, conversion failed, or merge error
    2 — usage / argument error
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Placeholder sets (must match validate_song.py)
# ---------------------------------------------------------------------------

_PLACEHOLDER_TITLES    = {"", "untitled", "untitled score", "untitled_score"}
_PLACEHOLDER_COMPOSERS = {"", "unknown", "composer / arranger", "composer/arranger"}


def _is_placeholder_title(val) -> bool:
    return (val or "").strip().lower() in _PLACEHOLDER_TITLES


def _is_placeholder_composer(val) -> bool:
    return (val or "").strip().lower() in _PLACEHOLDER_COMPOSERS


# ---------------------------------------------------------------------------
# Tool paths
# ---------------------------------------------------------------------------

_HERE = Path(__file__).resolve().parent


def _tool(name: str) -> Path:
    return _HERE / name


# ---------------------------------------------------------------------------
# Subprocess helpers
# ---------------------------------------------------------------------------

def _run(cmd: list[str], label: str) -> subprocess.CompletedProcess:
    """Run a subprocess. Returns the result (caller checks returncode)."""
    return subprocess.run(cmd, capture_output=True, text=True)


def _validate(song_path: Path, label: str) -> tuple[bool, str]:
    """
    Run validate_song.py against song_path.
    Returns (passed, output_text).
    """
    result = _run(
        [sys.executable, str(_tool("validate_song.py")), str(song_path)],
        label,
    )
    output = (result.stdout + result.stderr).strip()
    return (result.returncode == 0, output)


# ---------------------------------------------------------------------------
# Structural change detection
# ---------------------------------------------------------------------------

def _detect_changes(existing: dict, converted: dict) -> list[str]:
    """Return list of human-readable structural warnings between two song dicts."""
    warnings = []

    def _meta(d, key):
        return (d.get("meta") or {}).get(key)

    def _ts(d):
        ts = _meta(d, "time_signature")
        return f"{ts[0]}/{ts[1]}" if isinstance(ts, list) and len(ts) == 2 else str(ts)

    # Bar count
    old_bars = len((existing.get("score") or {}).get("bars") or [])
    new_bars = len((converted.get("score") or {}).get("bars") or [])
    if old_bars != new_bars:
        warnings.append(f"bar count changed: {old_bars} -> {new_bars}")

    # Time signature
    old_ts = _ts(existing)
    new_ts = _ts(converted)
    if old_ts != new_ts:
        warnings.append(f"time signature changed: {old_ts} -> {new_ts}")

    # Key signature
    old_key = _meta(existing, "key_signature") or ""
    new_key = _meta(converted, "key_signature") or ""
    if old_key != new_key:
        warnings.append(f"key signature changed: {old_key!r} -> {new_key!r}")

    # Clef count (via active_clefs)
    old_clefs = sorted(_meta(existing, "active_clefs") or [])
    new_clefs = sorted(_meta(converted, "active_clefs") or [])
    if old_clefs != new_clefs:
        warnings.append(f"active clefs changed: {old_clefs} -> {new_clefs}")

    return warnings


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------

def _merge(existing: dict, converted: dict) -> dict:
    """
    Apply preserved fields from existing into converted (in-place mutation of converted).
    Returns the merged dict.
    """
    ex_meta   = existing.get("meta") or {}
    conv_meta = converted.setdefault("meta", {})

    # Always preserve: id, level
    for field in ("id", "level"):
        val = ex_meta.get(field)
        if val is not None:
            conv_meta[field] = val

    # Preserve title only when existing is non-placeholder
    if not _is_placeholder_title(ex_meta.get("title")):
        conv_meta["title"] = ex_meta["title"]

    # Preserve composer only when existing is non-placeholder
    if not _is_placeholder_composer(ex_meta.get("composer")):
        conv_meta["composer"] = ex_meta["composer"]

    # Always preserve: learning_segments
    if "learning_segments" in existing:
        converted["learning_segments"] = existing["learning_segments"]

    # Always preserve: scoring
    if "scoring" in existing:
        converted["scoring"] = existing["scoring"]

    return converted


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("input",  type=Path, help="MXL source file")
    parser.add_argument("target", type=Path, help="Existing song.json to replace")
    parser.add_argument("--level", default=None,
                        help="Override meta.level for conversion (passed to mxl_to_song.py)")
    parser.add_argument("--bpm",   default=None, type=int,
                        help="Override meta.bpm for conversion (passed to mxl_to_song.py)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate and merge but do not write or replace any files")
    args = parser.parse_args()

    input_path  = args.input.resolve()
    target_path = args.target.resolve()

    # ── Argument checks ───────────────────────────────────────────────────
    if not input_path.exists():
        print(f"ERROR: input file not found: {input_path}", file=sys.stderr)
        return 2
    if not target_path.exists():
        print(f"ERROR: target song.json not found: {target_path}", file=sys.stderr)
        return 2
    if target_path.suffix.lower() != ".json":
        print(f"ERROR: target must be a .json file, got: {target_path.name}", file=sys.stderr)
        return 2

    tmp_path = Path(str(target_path) + ".tmp")
    bak_path = Path(str(target_path) + ".bak")

    # ── Step 1 — Backup ───────────────────────────────────────────────────
    if args.dry_run:
        print(f"[1/7] Backup  -> {bak_path.name}  (dry-run: skipped)")
    else:
        print(f"[1/7] Backup  -> {bak_path.name}")
        shutil.copy2(target_path, bak_path)

    # ── Step 2 — Convert ──────────────────────────────────────────────────
    print(f"[2/7] Convert {input_path.name} -> {tmp_path.name}")
    conv_cmd = [sys.executable, str(_tool("mxl_to_song.py")), str(input_path), str(tmp_path)]
    if args.level:
        conv_cmd += ["--level", args.level]
    if args.bpm:
        conv_cmd += ["--bpm", str(args.bpm)]

    conv_result = _run(conv_cmd, "mxl_to_song")
    if conv_result.returncode != 0:
        print("ERROR: conversion failed:", file=sys.stderr)
        print((conv_result.stdout + conv_result.stderr).strip(), file=sys.stderr)
        return 1
    if not tmp_path.exists():
        print(f"ERROR: mxl_to_song.py did not produce {tmp_path}", file=sys.stderr)
        return 1

    # ── Step 3 — Gate 1: validate converted ──────────────────────────────
    print("[3/7] Gate 1  — validate converted")
    passed_g1, output_g1 = _validate(tmp_path, "gate1")
    if output_g1:
        print(output_g1)
    if not passed_g1:
        print("ERROR: Gate 1 failed — aborting (original unchanged)", file=sys.stderr)
        tmp_path.unlink(missing_ok=True)
        return 1

    # ── Step 4 — Merge ────────────────────────────────────────────────────
    print("[4/7] Merge   — apply preserved fields from existing")
    try:
        existing  = json.loads(target_path.read_text(encoding="utf-8"))
        converted = json.loads(tmp_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"ERROR: could not read files for merge: {exc}", file=sys.stderr)
        tmp_path.unlink(missing_ok=True)
        return 1

    changes = _detect_changes(existing, converted)
    if changes:
        print("  Structural changes detected:")
        for c in changes:
            print(f"    WARNING: {c}")

    merged = _merge(existing, converted)
    tmp_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # ── Step 5 — Gate 2: validate merged ─────────────────────────────────
    print("[5/7] Gate 2  — validate merged")
    passed_g2, output_g2 = _validate(tmp_path, "gate2")
    if output_g2:
        print(output_g2)
    if not passed_g2:
        print("ERROR: Gate 2 failed — aborting (original unchanged)", file=sys.stderr)
        tmp_path.unlink(missing_ok=True)
        return 1

    # ── Step 6 — Atomic replace ───────────────────────────────────────────
    if args.dry_run:
        print(f"[6/7] Replace {tmp_path.name} -> {target_path.name}  (dry-run: skipped)")
        tmp_path.unlink(missing_ok=True)
    else:
        print(f"[6/7] Replace {tmp_path.name} -> {target_path.name}")
        os.replace(str(tmp_path), str(target_path))

    # ── Step 7 — Reindex ─────────────────────────────────────────────────
    if args.dry_run:
        print("[7/7] Reindex — update_song_index.py  (dry-run: skipped)")
    else:
        print("[7/7] Reindex — update_song_index.py")
        idx_result = _run(
            [sys.executable, str(_tool("update_song_index.py"))],
            "reindex",
        )
        idx_output = (idx_result.stdout + idx_result.stderr).strip()
        if idx_output:
            print(f"  {idx_output}")
        if idx_result.returncode != 0:
            print("WARNING: update_song_index.py returned non-zero — index may be stale", file=sys.stderr)

    # ── Done ──────────────────────────────────────────────────────────────
    if args.dry_run:
        print("\nDry-run complete. No files were modified.")
    else:
        print(f"\nDone. Backup: {bak_path.name}  |  Active: {target_path.name}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
