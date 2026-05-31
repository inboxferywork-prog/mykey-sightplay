#!/usr/bin/env python3
"""
mxl_to_song.py — MyKey Music Labs / ariyadigital
Converts MusicXML (.mxl / .xml / .musicxml) to song.json (timeline event structure).

Offline tool only. Run once per song before adding to the app.
Engine JS tidak tahu Python — hanya membaca song.json.
Tidak ada koneksi ke browser atau runtime engine.

Sprint 4A: after building score.bars the tool automatically invokes
linear_learning_path_generator to produce learning_path and lp_bar-based parts[].
score.bars is never modified.

Usage:
    python tools/mxl_to_song.py input.mxl songs/output.json
    python tools/mxl_to_song.py input.mxl songs/output.json \\
        --part-size 4 --bpm 72 --level early_beginner --id my_song_id

Requirements:
    pip install music21
"""

import argparse
import json
import re
import sys
from pathlib import Path

# Learning path generator — sibling module in the same tools/ directory.
sys.path.insert(0, str(Path(__file__).parent))
from linear_learning_path_generator import generate_learning_path  # noqa: E402

# music21 — pip install music21
from music21 import (
    articulations as m21_articulations,
    bar as m21_bar,
    chord as m21_chord,
    clef as m21_clef,
    converter,
    note as m21_note,
    repeat as m21_repeat,
    spanner as m21_spanner,
)


# ---------------------------------------------------------------------------
# Defaults — mirror of SPEC.md Bagian 4.1
# ---------------------------------------------------------------------------

DEFAULT_HINT_CONFIG = {
    "auto_hint_timeout_ms": 7000,
    "auto_play_timeout_ms": 12000,
    "show_note_name_always": True,
    "show_keyboard_highlight": True,
    "show_fingering_always": True,
    "hint_penalty": {
        "auto_highlight": -3,
        "auto_play": -5,
        "tap_note": -5,
        "question_mark": -8,
        "wrong_2x_narrowing": -5,
    },
}

DEFAULT_SCORING_CONFIG = {
    "perfect_window_ms": 150,
    "good_window_ms": 400,
    "points_per_note": {
        "perfect": 10,
        "good": 6,
        "late": 3,
        "miss": 0,
    },
    "timing_bonus": True,
    "streak_bonus": {"every": 5, "bonus": 10},
}

# quarterLength → duration string (SPEC Bagian 11.4 Step 4)
DURATION_MAP = {
    4.0:   "w",
    3.0:   "h.",
    2.0:   "h",
    1.5:   "q.",
    1.0:   "q",
    0.75:  "8.",
    0.5:   "8",
    0.375: "16.",
    0.25:  "16",
    0.125: "32",
}


# ---------------------------------------------------------------------------
# music21 compatibility
# ---------------------------------------------------------------------------

def _flatten(stream_obj):
    """Flatten a music21 stream. Supports v5 (.flat) and v7+ (.flatten())."""
    if hasattr(stream_obj, "flatten"):
        return stream_obj.flatten()
    return stream_obj.flat


# ---------------------------------------------------------------------------
# String helpers
# ---------------------------------------------------------------------------

def slugify(text):
    """'C Position March' → 'c_position_march'"""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s-]+", "_", text)
    return text.strip("_") or "untitled"


def pitch_to_str(pitch):
    """
    Convert music21 Pitch to string format per SPEC Bagian 4.3:
    'C4', 'F#3', 'Bb5', '##' for double-sharp, 'bb' for double-flat.
    music21 uses '-' for flat (e.g., 'B-') — converted here to 'Bb'.
    """
    step = pitch.step
    octave = pitch.octave if pitch.octave is not None else 4
    acc = ""
    if pitch.accidental:
        name = pitch.accidental.name
        if name == "sharp":
            acc = "#"
        elif name == "flat":
            acc = "b"
        elif name == "double-sharp":
            acc = "##"
        elif name == "double-flat":
            acc = "bb"
    return f"{step}{acc}{octave}"


def ql_to_duration(quarter_length):
    """
    Convert quarterLength to duration string (SPEC Bagian 11.4 Step 4).
    music21 quarterLength already includes dots — no manual calculation needed.
    Returns 'q' fallback if unrecognized (e.g., triplets).
    """
    ql = round(float(quarter_length), 6)
    if ql in DURATION_MAP:
        return DURATION_MAP[ql]
    # Fuzzy match for floating-point near-miss
    for key, val in DURATION_MAP.items():
        if abs(ql - key) < 0.002:
            return val
    return "q"


def format_key_sig(tonic_name, mode):
    """
    Format key signature string per confirmed decision:
    - Major: 'C', 'G', 'Bb' (music21 'B-' → 'Bb')
    - Minor: 'Am', 'Em', 'Dm' (explicit minor, not relative major)
    """
    name = tonic_name.replace("-", "b")
    return name + "m" if mode == "minor" else name


# ---------------------------------------------------------------------------
# Tempo map — cumulative t_ms (SPEC Bagian 11.4 Step 3 + 11.6)
# ---------------------------------------------------------------------------

def build_tempo_map(score, default_bpm):
    """
    Build sorted list of (offset_ql, bpm) from MetronomeMark elements.
    offset_ql = absolute quarter-length from song start.

    Handles multi-part scores where the same MetronomeMark may appear
    in multiple parts — deduplicates by offset (first value wins).
    """
    marks = {}
    try:
        for el in _flatten(score).getElementsByClass("MetronomeMark"):
            if el.number is not None:
                offset = float(el.offset)
                if offset not in marks:
                    marks[offset] = float(el.number)
    except Exception:
        pass

    if not marks:
        return [(0.0, float(default_bpm))]

    result = sorted(marks.items())

    # Ensure coverage from offset 0
    if result[0][0] > 0.0:
        result.insert(0, (0.0, float(default_bpm)))

    return result


def offset_to_ms(offset_ql, tempo_map):
    """
    Convert absolute quarter-length offset to milliseconds.

    Uses cumulative segment calculation — correct for tempo changes.
    This is intentionally NOT the simplified single-BPM formula from SPEC
    pseudocode, which only works for constant tempo. The cumulative formula
    preserves timeline integrity across tempo changes (SPEC Bagian 11.6 + 2.2).

    For constant tempo: result is identical to offset * (60000 / bpm).
    """
    offset_ql = float(offset_ql)
    total_ms = 0.0

    for i in range(len(tempo_map)):
        seg_start, seg_bpm = tempo_map[i]
        seg_end = tempo_map[i + 1][0] if i + 1 < len(tempo_map) else float("inf")

        if offset_ql <= seg_start:
            break

        covered = min(offset_ql, seg_end) - seg_start
        total_ms += covered * (60000.0 / seg_bpm)

    return round(total_ms)


# ---------------------------------------------------------------------------
# Score metadata extraction
# ---------------------------------------------------------------------------

def detect_clef(part):
    """Detect 'treble' or 'bass' from first Clef element in part."""
    for el in _flatten(part).getElementsByClass("Clef"):
        if isinstance(el, m21_clef.TrebleClef):
            return "treble"
        if isinstance(el, m21_clef.BassClef):
            return "bass"
        # Handle sub-types via class name as fallback
        clef_type = type(el).__name__.lower()
        if "treble" in clef_type:
            return "treble"
        if "bass" in clef_type:
            return "bass"
    return "treble"


def get_initial_bpm(score, default_bpm):
    """Return BPM from first MetronomeMark in score, or default_bpm."""
    try:
        for el in _flatten(score).getElementsByClass("MetronomeMark"):
            if el.number is not None:
                return float(el.number)
    except Exception:
        pass
    return float(default_bpm)


def get_time_signature(score):
    """Return time signature as [numerator, denominator]."""
    try:
        for el in _flatten(score).getElementsByClass("TimeSignature"):
            return [int(el.numerator), int(el.denominator)]
    except Exception:
        pass
    return [4, 4]


def get_key_signature(score):
    """
    Return key signature string per confirmed decision:
    Major: 'C', 'G', 'F', 'Bb'. Minor: 'Am', 'Em', 'Dm'.
    Tries Key class first (has mode info), falls back to KeySignature.
    """
    try:
        for el in _flatten(score).getElementsByClass("Key"):
            return format_key_sig(el.tonic.name, el.mode)
    except Exception:
        pass
    try:
        for el in _flatten(score).getElementsByClass("KeySignature"):
            k = el.asKey()
            return format_key_sig(k.tonic.name, k.mode)
    except Exception:
        pass
    return "C"


def detect_pickup(score):
    """
    Detect anacrusis (pickup bar).
    Returns True if first measure has number == 0 or is shorter than full bar.
    Per Opsi A: pickup bar becomes bar 1 in output (sequential from 1).
    """
    try:
        measures = list(score.parts[0].getElementsByClass("Measure"))
        if not measures:
            return False
        m = measures[0]
        if m.number == 0:
            return True
        # Check if first measure is shorter than a full bar
        ts = m.timeSignature
        if ts is None:
            ts_list = list(_flatten(m).getElementsByClass("TimeSignature"))
            ts = ts_list[0] if ts_list else None
        if ts and float(m.duration.quarterLength) < float(ts.barDuration.quarterLength):
            return True
    except Exception:
        pass
    return False


# ---------------------------------------------------------------------------
# Element-level helpers
# ---------------------------------------------------------------------------

def get_fingering(el):
    """
    Extract fingering number (1–5) from note element.
    Checks articulations (standard music21 location) then notations fallback.
    Returns None if no fingering annotation found.
    """
    try:
        for art in el.articulations:
            if isinstance(art, m21_articulations.Fingering):
                return int(art.fingerNumber)
    except Exception:
        pass
    if hasattr(el, "notations"):
        for n in el.notations:
            if hasattr(n, "fingerNumber"):
                try:
                    return int(n.fingerNumber)
                except (ValueError, TypeError):
                    pass
    return None


def get_tie_flags(el):
    """Return (tie_start, tie_stop) booleans from element's tie attribute."""
    if el.tie is None:
        return False, False
    t = el.tie.type
    return t in ("start", "continue"), t in ("stop", "continue")


def get_articulations(el):
    """Return list of articulation strings present on element, or []."""
    arts = []
    try:
        if any(isinstance(a, m21_articulations.Staccato) for a in el.articulations):
            arts.append("staccato")
    except Exception:
        pass
    return arts


def get_slur_flags(el):
    """Return (slur_start, slur_stop) booleans from spanner sites."""
    slur_start = False
    slur_stop = False
    try:
        for sp in el.getSpannerSites():
            if isinstance(sp, m21_spanner.Slur):
                if sp.isFirst(el):
                    slur_start = True
                if sp.isLast(el):
                    slur_stop = True
    except Exception:
        pass
    return slur_start, slur_stop


def get_beat(el):
    """
    Return beat position within measure.
    Integer for whole beats (1, 2, 3, 4), float for subdivisions (1.5, 2.5).
    Falls back to 1 if computation fails.
    """
    try:
        b = float(el.beat)
        return int(b) if b == int(b) else round(b, 4)
    except Exception:
        return 1


# ---------------------------------------------------------------------------
# Part parsing (SPEC Bagian 11.4 Steps 1–4)
# ---------------------------------------------------------------------------

def parse_part(part, clef_name, tempo_map, ev_counter_start, ottava_notes=None):
    """
    Parse all notes/chords/rests from a single music21 Part into event dicts.

    Uses measure-by-measure iteration (not .flat) to enable voice filtering.
    Absolute offset computed as: measure.offset + element.offset_in_measure.

    Args:
        part            : music21 Part object
        clef_name       : 'treble' or 'bass'
        tempo_map       : list of (offset_ql, bpm) from build_tempo_map()
        ev_counter_start: starting integer for ev_XXXXXX ID generation

    Returns:
        (events, next_ev_counter, warnings)
        events           : list of event dicts ready for song.json
        next_ev_counter  : ev_counter_start + number of events created
        warnings         : list of human-readable warning strings
    """
    events = []
    ev_counter = ev_counter_start
    warnings = []

    measures = list(part.getElementsByClass("Measure"))

    for bar_idx, measure in enumerate(measures):
        # Opsi A: pickup = bar 1, first full bar = bar 2 (sequential from 1)
        bar_n = bar_idx + 1

        # measure.offset is absolute from start of part (= song start for piano)
        measure_offset = float(measure.offset)

        # Voice filtering: voice 1 only for MVP (SPEC Bagian 11.5)
        voices = list(measure.voices)
        if voices:
            # Sort by voice ID to reliably pick voice 1
            try:
                voices.sort(
                    key=lambda v: int(str(v.id)) if str(v.id).isdigit() else 999
                )
            except Exception:
                pass
            target_elements = list(voices[0].notesAndRests)
            if len(voices) > 1:
                warnings.append(
                    f"Bar {bar_n} ({clef_name}): {len(voices)} voices found — "
                    f"voice 1 only, voices 2–{len(voices)} skipped (MVP)."
                )
        else:
            target_elements = list(measure.notesAndRests)

        for el in target_elements:
            # Grace notes: skip for MVP (SPEC Bagian 11.5)
            if el.duration.isGrace:
                warnings.append(
                    f"Bar {bar_n} ({clef_name}): grace note skipped (MVP)."
                )
                continue

            # Absolute quarter-length offset from song start
            absolute_offset = measure_offset + float(el.offset)

            # t_ms via cumulative tempo map (SPEC Bagian 11.6)
            t_ms = offset_to_ms(absolute_offset, tempo_map)
            end_ms = offset_to_ms(
                absolute_offset + float(el.duration.quarterLength), tempo_map
            )
            duration_ms = end_ms - t_ms

            if duration_ms <= 0:
                warnings.append(
                    f"Bar {bar_n} ({clef_name}): element at offset "
                    f"{absolute_offset:.3f} has duration_ms={duration_ms} — skipped."
                )
                continue

            dur_str = ql_to_duration(el.duration.quarterLength)
            ql_rounded = round(float(el.duration.quarterLength), 6)
            if dur_str == "q" and ql_rounded not in DURATION_MAP:
                warnings.append(
                    f"Bar {bar_n} ({clef_name}): unrecognized quarterLength "
                    f"{el.duration.quarterLength:.4f} — fallback duration 'q'."
                )

            ev_id = f"ev_{ev_counter:06d}"
            beat = get_beat(el)

            # Build event dict per type (SPEC Bagian 11.4 Step 4)
            if el.isRest:
                ev = {
                    "id": ev_id,
                    "bar": bar_n,
                    "beat": beat,
                    "clef": clef_name,
                    "type": "rest",
                    "duration": dur_str,
                    "duration_ms": duration_ms,
                    "t_ms": t_ms,
                }

            elif isinstance(el, m21_chord.Chord):
                tie_start, tie_stop = get_tie_flags(el)
                arts = get_articulations(el)
                slur_start_flag, slur_stop_flag = get_slur_flags(el)
                ev = {
                    "id": ev_id,
                    "bar": bar_n,
                    "beat": beat,
                    "clef": clef_name,
                    "type": "chord",
                    "notes": [pitch_to_str(n.pitch) for n in el.notes],
                    "duration": dur_str,
                    "duration_ms": duration_ms,
                    "t_ms": t_ms,
                    "tie_start": tie_start,
                    "tie_stop": tie_stop,
                    "tolerance_cents": 50,
                }
                if arts:
                    ev["articulations"] = arts
                if slur_start_flag:
                    ev["slur_start"] = True
                if slur_stop_flag:
                    ev["slur_stop"] = True
                _ott = ottava_notes.get(id(el)) if ottava_notes else None
                if _ott:
                    ev["written_notes"] = ev["notes"][:]
                    ev["notes"] = [pitch_to_str(n.pitch.transpose(_ott["semitones"])) for n in el.notes]
                    if _ott["is_first"]:
                        ev["octave_mark_start"] = _ott["type"]
                    if _ott["is_last"]:
                        ev["octave_mark_stop"] = True

            elif isinstance(el, m21_note.Note):
                tie_start, tie_stop = get_tie_flags(el)
                arts = get_articulations(el)
                slur_start_flag, slur_stop_flag = get_slur_flags(el)
                ev = {
                    "id": ev_id,
                    "bar": bar_n,
                    "beat": beat,
                    "clef": clef_name,
                    "type": "note",
                    "notes": [pitch_to_str(el.pitch)],
                    "duration": dur_str,
                    "duration_ms": duration_ms,
                    "t_ms": t_ms,
                    "finger": get_fingering(el),
                    "tie_start": tie_start,
                    "tie_stop": tie_stop,
                    "tolerance_cents": 50,
                }
                if arts:
                    ev["articulations"] = arts
                if slur_start_flag:
                    ev["slur_start"] = True
                if slur_stop_flag:
                    ev["slur_stop"] = True
                _ott = ottava_notes.get(id(el)) if ottava_notes else None
                if _ott:
                    ev["written_notes"] = ev["notes"][:]
                    ev["notes"] = [pitch_to_str(el.pitch.transpose(_ott["semitones"]))]
                    if _ott["is_first"]:
                        ev["octave_mark_start"] = _ott["type"]
                    if _ott["is_last"]:
                        ev["octave_mark_stop"] = True

            else:
                continue  # unrecognized element type

            events.append(ev)
            ev_counter += 1

    return events, ev_counter, warnings


# ---------------------------------------------------------------------------
# Merge, sort, pair (SPEC Bagian 11.4 Steps 5–6)
# ---------------------------------------------------------------------------

def merge_and_sort(treble_events, bass_events):
    """
    Merge treble + bass event lists, sort by (t_ms, clef).
    Treble before bass when t_ms is equal (SPEC Bagian 11.4 Step 5).
    """
    all_events = treble_events + bass_events
    all_events.sort(key=lambda e: (e["t_ms"], 0 if e["clef"] == "treble" else 1))
    return all_events


def pair_simultaneous(events):
    """
    Set pair_with_id for treble/bass event pairs at identical t_ms.
    Pairing is mutual: treble[0] ↔ bass[0] (SPEC Bagian 11.4 Step 6).
    Only the first treble and first bass at each t_ms are paired.
    """
    by_time = {}
    for ev in events:
        by_time.setdefault(ev["t_ms"], []).append(ev)

    for group in by_time.values():
        treble = [e for e in group if e["clef"] == "treble"]
        bass = [e for e in group if e["clef"] == "bass"]
        if treble and bass:
            treble[0]["pair_with_id"] = bass[0]["id"]
            bass[0]["pair_with_id"] = treble[0]["id"]

    return events


# ---------------------------------------------------------------------------
# Build song.json structures (SPEC Bagian 11.4 Step 8)
# ---------------------------------------------------------------------------

def build_repeat_map(score):
    """
    Scan part 0 measures for repeat barlines and volta brackets.

    Returns dict: {bar_n: {"repeat_start": bool, "repeat_end": bool, "volta": int}}
    Only keys that are True/non-None are included in each entry.

    Sources:
      repeat_start — measure.leftBarline is a Repeat with direction='start'
      repeat_end   — measure.rightBarline is a Repeat with direction='end'
      volta        — RepeatBracket spanner whose first measure is this one
    """
    repeat_map = {}
    if not score.parts:
        return repeat_map

    measures = list(score.parts[0].getElementsByClass("Measure"))

    for bar_idx, measure in enumerate(measures):
        bar_n = bar_idx + 1
        entry = {}

        # repeat_start: forward repeat at left barline
        lb = measure.leftBarline
        if lb is not None and isinstance(lb, m21_bar.Repeat):
            if getattr(lb, "direction", None) == "start":
                entry["repeat_start"] = True

        # repeat_end: backward repeat at right barline
        rb = measure.rightBarline
        if rb is not None and isinstance(rb, m21_bar.Repeat):
            if getattr(rb, "direction", None) == "end":
                entry["repeat_end"] = True

        # volta: RepeatBracket spanner that begins on this measure
        try:
            for sp in measure.getSpannerSites():
                if sp.__class__.__name__ == "RepeatBracket" and sp.isFirst(measure):
                    num = getattr(sp, "number", None)
                    if num is not None:
                        try:
                            entry["volta"] = int(num)
                        except (ValueError, TypeError):
                            pass
        except Exception:
            pass

        if entry:
            repeat_map[bar_n] = entry

    return repeat_map


# Maps music21 class name → navigation string used in song.json.
# Fine is a RepeatExpressionMarker but maps to the navigation field (not a bool),
# because it is a textual command at a specific bar, not a score-position symbol.
_NAV_COMMAND_STR = {
    "Fine":           "Fine",
    "DaCapo":         "D.C.",
    "DalSegno":       "D.S.",
    "DaCapoAlFine":   "D.C. al Fine",
    "DalSegnoAlCoda": "D.S. al Coda",
    "DalSegnoAlFine": "D.S. al Fine",
}


def build_nav_map(score):
    """
    Scan part 0 measures for navigation symbols (Segno, Coda, Fine, D.C., D.S.,
    D.C. al Fine, D.S. al Coda).

    Returns dict: {bar_n: {"segno": bool, "coda": bool, "navigation": str}}
    Only keys present in a bar are included in each entry.

    Sources (music21.repeat classes, resolved from MusicXML <sound> attributes):
      Segno            → segno: true
      Coda             → coda: true
      Fine             → navigation: "Fine"
      DaCapo           → navigation: "D.C."
      DalSegno         → navigation: "D.S."
      DaCapoAlFine     → navigation: "D.C. al Fine"
      DalSegnoAlCoda   → navigation: "D.S. al Coda"
    """
    nav_map = {}
    if not score.parts:
        return nav_map

    measures = list(score.parts[0].getElementsByClass("Measure"))

    for bar_idx, measure in enumerate(measures):
        bar_n = bar_idx + 1
        entry = {}

        try:
            for el in measure.recurse().getElementsByClass("RepeatExpression"):
                cls_name = type(el).__name__
                if cls_name == "Segno":
                    entry["segno"] = True
                elif cls_name == "Coda":
                    entry["coda"] = True
                elif cls_name in _NAV_COMMAND_STR:
                    entry["navigation"] = _NAV_COMMAND_STR[cls_name]
        except Exception:
            pass

        if entry:
            nav_map[bar_n] = entry

    return nav_map


def build_bars_structure(events, repeat_map=None, nav_map=None):
    """
    Group events into score.bars[] structure per SPEC Bagian 4.1.
    Events are sorted by t_ms within each bar (preserved from merge_and_sort).
    repeat_map injected when present: repeat_start / repeat_end / volta appear
    before 'beats' in each bar object.
    """
    bars_dict = {}
    for ev in events:
        bars_dict.setdefault(ev["bar"], []).append(ev)

    result = []
    for bar_n in sorted(bars_dict):
        bar_obj = {"bar": bar_n}
        if repeat_map:
            r = repeat_map.get(bar_n, {})
            if r.get("repeat_start"):
                bar_obj["repeat_start"] = True
            if r.get("repeat_end"):
                bar_obj["repeat_end"] = True
            if r.get("volta") is not None:
                bar_obj["volta"] = r["volta"]
        if nav_map:
            n = nav_map.get(bar_n, {})
            if n.get("segno"):
                bar_obj["segno"] = True
            if n.get("coda"):
                bar_obj["coda"] = True
            if n.get("navigation"):
                bar_obj["navigation"] = n["navigation"]
        bar_obj["beats"] = bars_dict[bar_n]
        result.append(bar_obj)
    return result


def build_parts_list(events, part_size, has_pickup):
    """
    Build parts[] grouped by part_size bars per SPEC Bagian 5.2.
    Pickup bar is bar 1 per Opsi A — included in part_1 with has_pickup=true.
    Last part may be shorter than part_size if total bars don't divide evenly.
    """
    if not events:
        return []

    max_bar = max(ev["bar"] for ev in events)
    parts = []
    part_idx = 1
    bar_start = 1

    while bar_start <= max_bar:
        bar_end = min(bar_start + part_size - 1, max_bar)
        parts.append({
            "part_id": f"part_{part_idx}",
            "label": f"Part {part_idx}",
            "bars": list(range(bar_start, bar_end + 1)),
            "has_pickup": has_pickup and part_idx == 1,
            "example_audio": None,
        })
        bar_start = bar_end + 1
        part_idx += 1

    return parts


def build_song_json(score, events, args, has_pickup, initial_bpm, repeat_map=None, nav_map=None):
    """
    Assemble final song.json dict per SPEC Bagian 4.1 data contract.
    Audio fields (background_music, example_audio) are null — filled manually
    by Fay after MP3 production (SPEC Bagian 11.9).
    """
    meta_title = "Untitled"
    meta_composer = "Unknown"
    try:
        if score.metadata:
            meta_title = score.metadata.title or meta_title
            meta_composer = score.metadata.composer or meta_composer
    except Exception:
        pass

    song_id = args.id or slugify(meta_title)
    n_parts = len(score.parts)
    hand_mode = "both" if n_parts >= 2 else "rh_only"

    # Detect active clefs from actual parsed events (handles bass-only single-part edge case)
    active_clefs = sorted(
        set(ev["clef"] for ev in events),
        key=lambda c: 0 if c == "treble" else 1,
    )

    # Use int for whole-number BPM (e.g. 72 not 72.0) for clean JSON output
    bpm_val = int(initial_bpm) if initial_bpm == int(initial_bpm) else initial_bpm

    return {
        "meta": {
            "id": song_id,
            "title": meta_title,
            "composer": meta_composer,
            "level": args.level,
            "bpm": bpm_val,
            "time_signature": get_time_signature(score),
            "key_signature": get_key_signature(score),
            "hand_mode": hand_mode,
            "active_clefs": active_clefs,
            "freq_split_hz": 261.63,
            "part_size_bars": args.part_size,
            "background_music": None,
            "example_audio": None,
            "hint_config": DEFAULT_HINT_CONFIG,
        },
        "parts": build_parts_list(events, args.part_size, has_pickup),
        "score": {
            "bars": build_bars_structure(events, repeat_map, nav_map),
        },
        "scoring": DEFAULT_SCORING_CONFIG,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Convert MusicXML (.mxl) to MyKey song.json (timeline event structure)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python tools/mxl_to_song.py input.mxl songs/output.json
  python tools/mxl_to_song.py input.mxl songs/output.json --part-size 4 --bpm 72 --level early_beginner
  python tools/mxl_to_song.py input.mxl songs/output.json --id thompson_lesson1_cposition

After generating:
  python tools/validate_song.py songs/output.json
        """,
    )
    parser.add_argument("input", help="Input .mxl / .xml / .musicxml file path")
    parser.add_argument("output", help="Output .json file path")
    parser.add_argument(
        "--part-size", type=int, default=4, dest="part_size", metavar="BARS",
        help="Number of bars per part (default: 4)",
    )
    parser.add_argument(
        "--bpm", type=float, default=72.0,
        help="Default BPM if score has no tempo marking (default: 72)",
    )
    parser.add_argument(
        "--level", default="early_beginner",
        choices=["early_beginner", "beginner", "intermediate", "advanced"],
        help="Difficulty level (default: early_beginner)",
    )
    parser.add_argument(
        "--id", default=None,
        help="Song ID override (default: slugified title)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Step 1: Parse MXL (SPEC Bagian 11.4 Step 1)
    # ------------------------------------------------------------------
    print(f"Parsing: {input_path.name}")
    try:
        score = converter.parse(str(input_path))
    except Exception as e:
        print(f"ERROR: Failed to parse MXL: {e}", file=sys.stderr)
        sys.exit(1)

    if not score.parts:
        print("ERROR: Score has no parts.", file=sys.stderr)
        sys.exit(1)

    n_score_parts = len(score.parts)
    print(f"Parts found: {n_score_parts}")

    # ------------------------------------------------------------------
    # Steps 2–3: Detect metadata + build tempo map
    # ------------------------------------------------------------------
    initial_bpm = get_initial_bpm(score, args.bpm)
    tempo_map = build_tempo_map(score, args.bpm)
    has_pickup = detect_pickup(score)
    time_sig = get_time_signature(score)
    key_sig = get_key_signature(score)

    print(f"BPM: {initial_bpm}")
    print(f"Time signature: {time_sig[0]}/{time_sig[1]}")
    print(f"Key signature: {key_sig}")
    print(f"Pickup bar: {has_pickup}")
    if len(tempo_map) > 1:
        print(f"Tempo changes: {len(tempo_map)} segments")

    # ------------------------------------------------------------------
    # Steps 4–5: Parse treble + bass parts
    # ------------------------------------------------------------------
    all_warnings = []
    treble_events = []
    bass_events = []
    ev_counter = 1

    # ------------------------------------------------------------------
    # Sprint 8A: Pre-parse Ottava spanners
    # ------------------------------------------------------------------
    ottava_notes = {}
    _ottava_span_count = 0
    for sp in score.spannerBundle:
        if not isinstance(sp, m21_spanner.Ottava):
            continue
        if sp.type not in ('8va', '8vb'):
            all_warnings.append(f"Ottava type {sp.type!r} not supported — skipped.")
            continue
        els = list(sp.getSpannedElements())
        if not els:
            continue
        semitones = 12 if sp.type == '8va' else -12
        for i, n in enumerate(els):
            ottava_notes[id(n)] = {
                'type': sp.type,
                'semitones': semitones,
                'is_first': i == 0,
                'is_last': i == len(els) - 1,
            }
        _ottava_span_count += 1
    if _ottava_span_count:
        print(f"Ottava spans: {_ottava_span_count} ({len(ottava_notes)} notes affected)")

    # Part 0 — typically treble for piano
    clef0 = detect_clef(score.parts[0])
    print(f"\nPart 0 ({clef0}): parsing...")
    treble_events, ev_counter, warns = parse_part(
        score.parts[0], clef0, tempo_map, ev_counter, ottava_notes
    )
    all_warnings.extend(warns)
    print(f"  {len(treble_events)} events")

    # Part 1 — typically bass for piano
    if n_score_parts >= 2:
        clef1 = detect_clef(score.parts[1])
        print(f"Part 1 ({clef1}): parsing...")
        bass_events, ev_counter, warns = parse_part(
            score.parts[1], clef1, tempo_map, ev_counter, ottava_notes
        )
        all_warnings.extend(warns)
        print(f"  {len(bass_events)} events")

    if n_score_parts > 2:
        all_warnings.append(
            f"Score has {n_score_parts} parts — only parts 0 and 1 processed. "
            f"Parts 2+ skipped."
        )

    # ------------------------------------------------------------------
    # Steps 5–6: Merge, sort, pair simultaneous events
    # ------------------------------------------------------------------
    all_events = merge_and_sort(treble_events, bass_events)
    if n_score_parts >= 2:
        all_events = pair_simultaneous(all_events)

    if not all_events:
        print("ERROR: No events parsed — check input file.", file=sys.stderr)
        sys.exit(1)

    print(f"\nTotal events: {len(all_events)}")

    # ------------------------------------------------------------------
    # Steps 7–8: Detect pickup, scan repeats/voltas, build song.json
    # ------------------------------------------------------------------
    repeat_map = build_repeat_map(score)
    if repeat_map:
        repeat_bars = sorted(repeat_map)
        print(f"\nRepeat/volta markings found in bars: {repeat_bars}")

    nav_map = build_nav_map(score)
    if nav_map:
        nav_bars = sorted(nav_map)
        print(f"Navigation symbols found in bars:    {nav_bars}")

    song_data = build_song_json(score, all_events, args, has_pickup, initial_bpm, repeat_map, nav_map)

    # ------------------------------------------------------------------
    # Sprint 4A: Generate learning path + lp_bar-based segments
    # ------------------------------------------------------------------
    song_data = generate_learning_path(song_data)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(song_data, f, indent=2, ensure_ascii=False)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    bars    = song_data["score"]["bars"]
    parts   = song_data["parts"]
    lp      = song_data.get("learning_path", {})
    lp_bars = lp.get("bars", [])

    print(f"\nOutput written: {output_path}")
    print(f"  Song ID    : {song_data['meta']['id']}")
    print(f"  Title      : {song_data['meta']['title']}")
    print(f"  Composer   : {song_data['meta']['composer']}")
    print(f"  Hand mode  : {song_data['meta']['hand_mode']}")
    print(f"  Bars       : {len(bars)} original")
    if lp_bars:
        ratio = len(lp_bars) / len(bars) if bars else 0
        print(f"  LP bars    : {len(lp_bars)} ({ratio:.2f}x expansion)")
    print(f"  Segments   : {len(parts)} (lp_bar references)")
    print(f"  Events     : {len(all_events)}")
    repeat_bars_with_fields = [
        b["bar"] for b in bars
        if b.get("repeat_start") or b.get("repeat_end") or b.get("volta") is not None
    ]
    ottava_marked = [e for b in bars for e in b['beats'] if 'octave_mark_start' in e]
    if ottava_marked:
        types_seen = sorted({e['octave_mark_start'] for e in ottava_marked})
        print(f"  Ottava     : {len(ottava_marked)} span-start notes ({', '.join(types_seen)})")
    if repeat_bars_with_fields:
        print(f"  Repeats    : bars {repeat_bars_with_fields} have repeat/volta fields")
    nav_bars_with_fields = [
        b["bar"] for b in bars
        if b.get("segno") or b.get("coda") or b.get("navigation")
    ]
    if nav_bars_with_fields:
        detail = {b["bar"]: {k: v for k, v in b.items()
                             if k in ("segno", "coda", "navigation")}
                  for b in bars if b["bar"] in nav_bars_with_fields}
        print(f"  Navigation : bars {nav_bars_with_fields} — {detail}")
    print()
    print("  [!] background_music and example_audio are null.")
    print("      Fill these manually after producing MP3s from MuseScore.")

    if all_warnings:
        print(f"\nWARNINGS ({len(all_warnings)}):")
        for w in all_warnings:
            print(f"  ! {w}")

    print(f"\nNext step: python tools/validate_song.py {output_path}")


if __name__ == "__main__":
    main()
