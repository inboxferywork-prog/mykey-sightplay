#!/usr/bin/env python3
"""
validate_song.py — MyKey Music Labs / ariyadigital
Validates a song.json file against the SPEC Bagian 11.8 data contract.

Run after mxl_to_song.py to verify output before adding to the app.

Usage:
    python tools/validate_song.py songs/output.json
    python tools/validate_song.py songs/output.json --strict

Exit codes:
    0 = passed (no errors)
    1 = one or more errors found
"""

import argparse
import json
import re
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_TYPES    = {"note", "chord", "rest"}
VALID_CLEFS    = {"treble", "bass"}
VALID_LEVELS   = {"early_beginner", "beginner", "intermediate", "advanced"}
VALID_MODES    = {"rh_only", "lh_only", "both"}
VALID_DURATIONS = {"w", "h.", "h", "q.", "q", "8.", "8", "16.", "16", "32"}

# Placeholder values from MuseScore defaults and mxl_to_song.py fallbacks.
# A song carrying one of these in meta.title or meta.composer is not publish-ready.
_PLACEHOLDER_TITLES    = {"untitled", "untitled score", "untitled_score"}
_PLACEHOLDER_COMPOSERS = {"unknown", "composer / arranger", "composer/arranger"}

# ev_000001 … ev_999999
EVENT_ID_RE = re.compile(r"^ev_\d{6}$")

# C4, F#3, Bb5, C##4, Dbb3  (step + optional 1-2 accidentals + single octave digit)
NOTE_RE = re.compile(r"^[A-G](#{1,2}|b{1,2})?[0-9]$")


# ---------------------------------------------------------------------------
# Result accumulator
# ---------------------------------------------------------------------------

class Result:
    """Collects errors and warnings during validation."""

    def __init__(self):
        self.errors   = []
        self.warnings = []

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def warn(self, msg: str) -> None:
        self.warnings.append(msg)

    @property
    def passed(self) -> bool:
        return len(self.errors) == 0


# ---------------------------------------------------------------------------
# Event collection — extract flat event list from score.bars[]
# ---------------------------------------------------------------------------

def collect_events(score_bars: list, result: Result):
    """
    Flatten score.bars[].beats[] into a single event list.
    Returns (events, events_by_bar).
    """
    events       = []
    events_by_bar = {}

    if not isinstance(score_bars, list):
        result.error("score.bars: must be an array")
        return [], {}

    for bar_item in score_bars:
        if not isinstance(bar_item, dict):
            result.error("score.bars[]: each item must be an object")
            continue

        bar_n = bar_item.get("bar")
        beats = bar_item.get("beats", [])

        if not isinstance(beats, list):
            result.error(f"score.bars[bar={bar_n}].beats: must be an array")
            continue

        events_by_bar.setdefault(bar_n, [])
        for ev in beats:
            events.append(ev)
            events_by_bar[bar_n].append(ev)

    return events, events_by_bar


# ---------------------------------------------------------------------------
# Check — meta block (SPEC Bagian 4.1 + 11.8 rule: BPM valid)
# ---------------------------------------------------------------------------

def check_meta(meta: dict, result: Result) -> None:
    if not isinstance(meta, dict):
        result.error("meta: must be an object")
        return

    # Required string fields
    for field in ("id", "title", "composer"):
        val = meta.get(field)
        if val is None:
            result.error(f"meta.{field}: missing required field")
        elif not isinstance(val, str) or not val.strip():
            result.error(f"meta.{field}: must be a non-empty string")

    # Placeholder detection — warns but does not block (publish-readiness signal)
    _t = (meta.get("title") or "").strip().lower()
    if _t in _PLACEHOLDER_TITLES:
        result.warn(f"meta.title: '{meta.get('title')}' appears to be a placeholder — set the real title before publishing")
    _c = (meta.get("composer") or "").strip().lower()
    if _c in _PLACEHOLDER_COMPOSERS:
        result.warn(f"meta.composer: '{meta.get('composer')}' appears to be a placeholder — set the real name or leave empty in MuseScore")

    # level
    level = meta.get("level")
    if level is None:
        result.error("meta.level: missing required field")
    elif level not in VALID_LEVELS:
        result.error(f"meta.level: '{level}' not valid — must be one of {sorted(VALID_LEVELS)}")

    # bpm — SPEC 11.8: BPM valid (> 0)
    bpm = meta.get("bpm")
    if bpm is None:
        result.error("meta.bpm: missing required field")
    elif not isinstance(bpm, (int, float)) or bpm <= 0:
        result.error(f"meta.bpm: must be a number > 0, got {bpm!r}")

    # time_signature
    ts = meta.get("time_signature")
    if ts is None:
        result.error("meta.time_signature: missing required field")
    elif not (isinstance(ts, list) and len(ts) == 2
              and all(isinstance(x, int) and x > 0 for x in ts)):
        result.error(f"meta.time_signature: must be [numerator, denominator] positive ints, got {ts!r}")

    # key_signature
    ks = meta.get("key_signature")
    if ks is None:
        result.error("meta.key_signature: missing required field")
    elif not isinstance(ks, str) or not ks.strip():
        result.error("meta.key_signature: must be a non-empty string")

    # hand_mode
    hm = meta.get("hand_mode")
    if hm is None:
        result.error("meta.hand_mode: missing required field")
    elif hm not in VALID_MODES:
        result.error(f"meta.hand_mode: '{hm}' not valid — must be one of {sorted(VALID_MODES)}")

    # active_clefs
    ac = meta.get("active_clefs")
    if ac is None:
        result.error("meta.active_clefs: missing required field")
    elif not isinstance(ac, list) or not ac:
        result.error("meta.active_clefs: must be a non-empty array")
    else:
        for c in ac:
            if c not in VALID_CLEFS:
                result.error(f"meta.active_clefs: '{c}' not valid — must be 'treble' or 'bass'")

    # freq_split_hz
    fsh = meta.get("freq_split_hz")
    if fsh is None:
        result.error("meta.freq_split_hz: missing required field")
    elif not isinstance(fsh, (int, float)) or fsh <= 0:
        result.error(f"meta.freq_split_hz: must be a number > 0, got {fsh!r}")

    # part_size_bars
    psb = meta.get("part_size_bars")
    if psb is None:
        result.error("meta.part_size_bars: missing required field")
    elif not isinstance(psb, int) or psb <= 0:
        result.error(f"meta.part_size_bars: must be a positive int, got {psb!r}")

    # hint_config — presence check only
    if "hint_config" not in meta:
        result.warn("meta.hint_config: missing — engine will use defaults")
    elif not isinstance(meta["hint_config"], dict):
        result.error("meta.hint_config: must be an object")

    # audio fields — null is expected from generator, remind Fay to fill
    if meta.get("background_music") is None:
        result.warn("meta.background_music: null — fill manually after MP3 production (SPEC 11.9)")
    if meta.get("example_audio") is None:
        result.warn("meta.example_audio: null — fill manually after MP3 production (SPEC 11.9)")


# ---------------------------------------------------------------------------
# Check — events (SPEC Bagian 11.8 core rules)
# ---------------------------------------------------------------------------

def check_events(events: list, result: Result) -> None:
    """
    Core per-event and cross-event validation.

    Per-event (pass 1):
      - id unique + format ev_XXXXXX
      - required fields: t_ms, duration_ms, type, clef, bar
      - notes[] non-empty for note/chord
      - t_ms >= 0
      - duration_ms > 0
      - tie_start / tie_stop are booleans
      - finger 1–5 or null (note only)
      - tolerance_cents > 0 if present

    Cross-event (pass 2):
      - pair_with_id references an existing id
      - pair_with_id is mutual (A→B and B→A)
      - tie chain integrity (tie_start matched by tie_stop)
      - no overlapping events at same clef + t_ms
      - bar numbers sequential from 1 with no gaps
    """
    if not events:
        result.error("score: no events found")
        return

    seen_ids   = {}   # id → index (uniqueness check)
    all_ids    = set()
    tie_starts = []   # (ev_id, clef) for events with tie_start=True
    tie_stops  = []   # (ev_id, clef) for events with tie_stop=True

    # -----------------------------------------------------------------------
    # Pass 1 — per-event checks
    # -----------------------------------------------------------------------
    for i, ev in enumerate(events):
        if not isinstance(ev, dict):
            result.error(f"event[{i}]: must be an object")
            continue

        ev_id    = ev.get("id")
        ev_label = ev_id if ev_id else f"[index {i}]"

        # id — unique + format ev_XXXXXX
        if ev_id is None:
            result.error(f"event[{i}]: missing required field 'id'")
        elif not isinstance(ev_id, str):
            result.error(f"event[{i}].id: must be a string")
        elif not EVENT_ID_RE.match(ev_id):
            result.error(f"event '{ev_id}': id must match format ev_XXXXXX (6 digits)")
        elif ev_id in seen_ids:
            result.error(f"event '{ev_id}': duplicate id — first seen at index {seen_ids[ev_id]}")
        else:
            seen_ids[ev_id] = i
            all_ids.add(ev_id)

        # type
        ev_type = ev.get("type")
        if ev_type is None:
            result.error(f"event '{ev_label}': missing required field 'type'")
        elif ev_type not in VALID_TYPES:
            result.error(f"event '{ev_label}': type '{ev_type}' not valid — must be note/chord/rest")

        # clef
        ev_clef = ev.get("clef")
        if ev_clef is None:
            result.error(f"event '{ev_label}': missing required field 'clef'")
        elif ev_clef not in VALID_CLEFS:
            result.error(f"event '{ev_label}': clef '{ev_clef}' not valid — must be treble/bass")

        # bar
        ev_bar = ev.get("bar")
        if ev_bar is None:
            result.error(f"event '{ev_label}': missing required field 'bar'")
        elif not isinstance(ev_bar, int) or ev_bar <= 0:
            result.error(f"event '{ev_label}': bar must be a positive int, got {ev_bar!r}")

        # t_ms — no negative values (SPEC 11.8)
        t_ms = ev.get("t_ms")
        if t_ms is None:
            result.error(f"event '{ev_label}': missing required field 't_ms'")
        elif not isinstance(t_ms, (int, float)):
            result.error(f"event '{ev_label}': t_ms must be a number")
        elif t_ms < 0:
            result.error(f"event '{ev_label}': t_ms is negative ({t_ms})")

        # duration_ms > 0 (SPEC 11.8)
        dur_ms = ev.get("duration_ms")
        if dur_ms is None:
            result.error(f"event '{ev_label}': missing required field 'duration_ms'")
        elif not isinstance(dur_ms, (int, float)):
            result.error(f"event '{ev_label}': duration_ms must be a number")
        elif dur_ms <= 0:
            result.error(f"event '{ev_label}': duration_ms must be > 0, got {dur_ms}")

        # notes[] non-empty for note/chord (SPEC 11.8)
        if ev_type in ("note", "chord"):
            notes = ev.get("notes")
            if notes is None:
                result.error(f"event '{ev_label}': missing required field 'notes' for type '{ev_type}'")
            elif not isinstance(notes, list) or len(notes) == 0:
                result.error(f"event '{ev_label}': notes must be a non-empty array for type '{ev_type}'")
            else:
                for n in notes:
                    if not isinstance(n, str):
                        result.error(f"event '{ev_label}': note value must be a string, got {n!r}")
                    elif not NOTE_RE.match(n):
                        result.error(
                            f"event '{ev_label}': note '{n}' format invalid — "
                            f"expected 'C4', 'F#3', 'Bb5', 'C##4', 'Dbb3'"
                        )

        # rest should not carry notes
        if ev_type == "rest" and "notes" in ev:
            result.warn(f"event '{ev_label}': type=rest should not have a 'notes' field")

        # duration string — warn only (triplets are possible)
        dur_str = ev.get("duration")
        if dur_str is not None and dur_str not in VALID_DURATIONS:
            result.warn(
                f"event '{ev_label}': duration '{dur_str}' not in standard set "
                f"{sorted(VALID_DURATIONS)} — may be a triplet or unusual value"
            )

        # tolerance_cents
        if ev_type in ("note", "chord"):
            tc = ev.get("tolerance_cents")
            if tc is not None and (not isinstance(tc, (int, float)) or tc <= 0):
                result.error(f"event '{ev_label}': tolerance_cents must be > 0 if present")

        # finger 1–5 or null (note only)
        if ev_type == "note":
            finger = ev.get("finger")
            if finger is not None:
                if not isinstance(finger, int) or not (1 <= finger <= 5):
                    result.error(
                        f"event '{ev_label}': finger must be an int 1–5 or null, got {finger!r}"
                    )

        # tie flags — must be booleans
        if ev_type in ("note", "chord"):
            ts_flag = ev.get("tie_start")
            te_flag = ev.get("tie_stop")
            if ts_flag is not None and not isinstance(ts_flag, bool):
                result.error(f"event '{ev_label}': tie_start must be a boolean")
            if te_flag is not None and not isinstance(te_flag, bool):
                result.error(f"event '{ev_label}': tie_stop must be a boolean")
            if ts_flag is True and ev_id:
                tie_starts.append((ev_id, ev_clef))
            if te_flag is True and ev_id:
                tie_stops.append((ev_id, ev_clef))

    # -----------------------------------------------------------------------
    # Pass 2 — cross-event checks
    # -----------------------------------------------------------------------

    # pair_with_id — references an existing id + mutual pairing (SPEC 11.8)
    for ev in events:
        pwid = ev.get("pair_with_id")
        if pwid is None:
            continue
        src_id = ev.get("id", "?")
        if pwid not in all_ids:
            result.error(
                f"event '{src_id}': pair_with_id '{pwid}' does not reference an existing event id"
            )
        else:
            partner = next((e for e in events if e.get("id") == pwid), None)
            if partner and partner.get("pair_with_id") != src_id:
                result.error(
                    f"event '{src_id}' pair_with_id → '{pwid}', "
                    f"but '{pwid}'.pair_with_id = '{partner.get('pair_with_id')}' "
                    f"(expected '{src_id}') — pairing must be mutual"
                )

    # Tie chain integrity — tie_start must be matched by tie_stop (SPEC 11.8)
    if tie_starts and not tie_stops:
        result.error(
            f"{len(tie_starts)} tie_start event(s) found but no tie_stop events — "
            f"broken tie chain"
        )
    elif tie_stops and not tie_starts:
        result.error(
            f"{len(tie_stops)} tie_stop event(s) found but no tie_start events — "
            f"broken tie chain"
        )
    elif len(tie_starts) != len(tie_stops):
        result.warn(
            f"tie count mismatch: {len(tie_starts)} tie_start vs {len(tie_stops)} tie_stop "
            f"— verify tie chains are complete"
        )

    # Overlapping events — same clef + t_ms (SPEC 11.8)
    slot_map = {}   # (clef, t_ms) → [ev_ids]
    for ev in events:
        clef = ev.get("clef")
        t    = ev.get("t_ms")
        eid  = ev.get("id", "?")
        if clef and t is not None:
            slot_map.setdefault((clef, t), []).append(eid)

    for (clef, t), ids in slot_map.items():
        if len(ids) > 1:
            result.error(
                f"overlapping events at clef={clef}, t_ms={t}: {ids} — "
                f"only one event allowed per clef per timestamp"
            )

    # Bar numbers sequential from 1 with no gaps (SPEC 11.8)
    all_bars = sorted({
        ev.get("bar") for ev in events
        if isinstance(ev.get("bar"), int)
    })
    if all_bars:
        if all_bars[0] != 1:
            result.error(
                f"bar numbering must start at 1, found first bar = {all_bars[0]}"
            )
        expected = list(range(all_bars[0], all_bars[-1] + 1))
        missing  = sorted(set(expected) - set(all_bars))
        if missing:
            result.error(
                f"bar numbers not sequential — missing bars: {missing}"
            )


# ---------------------------------------------------------------------------
# Check — parts block
# ---------------------------------------------------------------------------

def check_parts(parts: list, events_by_bar: dict, result: Result) -> None:
    if not isinstance(parts, list):
        result.error("parts: must be an array")
        return
    if not parts:
        result.warn("parts: empty — no parts defined")
        return

    seen_part_ids = set()

    for idx, part in enumerate(parts):
        pfx = f"parts[{idx}]"
        if not isinstance(part, dict):
            result.error(f"{pfx}: must be an object")
            continue

        # part_id unique
        pid = part.get("part_id")
        if not pid:
            result.error(f"{pfx}.part_id: missing or empty")
        elif pid in seen_part_ids:
            result.error(f"{pfx}.part_id: duplicate '{pid}'")
        else:
            seen_part_ids.add(pid)

        # label
        if not part.get("label"):
            result.warn(f"{pfx}.label: missing or empty")

        # bars — list of positive ints referencing actual bars in score
        bars = part.get("bars")
        if not isinstance(bars, list) or not bars:
            result.error(f"{pfx}.bars: must be a non-empty list of bar numbers")
        else:
            for b in bars:
                if not isinstance(b, int) or b <= 0:
                    result.error(f"{pfx}.bars: '{b}' is not a positive int bar number")
                elif b not in events_by_bar:
                    result.warn(f"{pfx}.bars: bar {b} listed but has no events in score")

        # has_pickup
        if "has_pickup" not in part:
            result.warn(f"{pfx}.has_pickup: missing field")

        # example_audio
        if part.get("example_audio") is None:
            result.warn(f"{pfx}.example_audio: null — fill manually after MP3 production (SPEC 11.9)")


# ---------------------------------------------------------------------------
# Check — learning_segments block (optional)
# ---------------------------------------------------------------------------

def check_learning_segments(segs: list, score_bars: list, result: Result) -> None:
    """
    Validate the optional learning_segments[] block.

    Rules:
      - segment_id: required, unique, non-empty string
      - label: required, non-empty string
      - start_bar: required, positive int, must exist in score
      - end_bar: required, positive int, must be a score bar OR max_bar+1 (exclusive-end sentinel)
      - start_beat / end_beat: required, positive number >= 1
      - suggested_repeats: optional, positive int >= 1 if present
      - order: optional, number if present
      - No overlapping bar ranges (warning)
    """
    if not isinstance(segs, list):
        result.error("learning_segments: must be an array")
        return
    if not segs:
        result.warn("learning_segments: empty array — no segments defined")
        return

    # Build valid bar set from score
    bar_numbers = {
        b["bar"] for b in score_bars
        if isinstance(b, dict) and isinstance(b.get("bar"), int)
    }
    max_bar = max(bar_numbers) if bar_numbers else 0

    seen_ids = set()
    # Collect (start_bar, end_bar) tuples for overlap check
    ranges = []

    for idx, seg in enumerate(segs):
        pfx = f"learning_segments[{idx}]"
        if not isinstance(seg, dict):
            result.error(f"{pfx}: must be an object")
            continue

        # segment_id
        sid = seg.get("segment_id")
        if not sid:
            result.error(f"{pfx}.segment_id: missing or empty")
        elif not isinstance(sid, str):
            result.error(f"{pfx}.segment_id: must be a string")
        elif sid in seen_ids:
            result.error(f"{pfx}.segment_id: duplicate '{sid}'")
        else:
            seen_ids.add(sid)

        # label
        label = seg.get("label")
        if not label:
            result.error(f"{pfx}.label: missing or empty")
        elif not isinstance(label, str):
            result.error(f"{pfx}.label: must be a string")

        # start_bar
        start_bar = seg.get("start_bar")
        if start_bar is None:
            result.error(f"{pfx}.start_bar: missing required field")
        elif not isinstance(start_bar, int) or start_bar <= 0:
            result.error(f"{pfx}.start_bar: must be a positive integer, got {start_bar!r}")
        elif start_bar not in bar_numbers:
            result.error(f"{pfx}.start_bar: bar {start_bar} not found in score")

        # end_bar — valid if it's a score bar OR max_bar+1 (exclusive-end sentinel)
        end_bar = seg.get("end_bar")
        if end_bar is None:
            result.error(f"{pfx}.end_bar: missing required field")
        elif not isinstance(end_bar, int) or end_bar <= 0:
            result.error(f"{pfx}.end_bar: must be a positive integer, got {end_bar!r}")
        elif end_bar not in bar_numbers and end_bar != max_bar + 1:
            result.error(
                f"{pfx}.end_bar: bar {end_bar} not found in score and is not "
                f"max_bar+1 ({max_bar + 1}) — must be a valid bar or the exclusive-end sentinel"
            )

        # start_bar < end_bar
        if isinstance(start_bar, int) and isinstance(end_bar, int):
            if start_bar >= end_bar:
                result.warn(
                    f"{pfx}: start_bar ({start_bar}) >= end_bar ({end_bar}) — "
                    f"segment spans zero or negative bars"
                )
            else:
                ranges.append((start_bar, end_bar, pfx, sid or f"[{idx}]"))

        # start_beat
        sb = seg.get("start_beat")
        if sb is None:
            result.error(f"{pfx}.start_beat: missing required field")
        elif not isinstance(sb, (int, float)) or sb < 1:
            result.error(f"{pfx}.start_beat: must be a number >= 1, got {sb!r}")

        # end_beat
        eb = seg.get("end_beat")
        if eb is None:
            result.error(f"{pfx}.end_beat: missing required field")
        elif not isinstance(eb, (int, float)) or eb < 1:
            result.error(f"{pfx}.end_beat: must be a number >= 1, got {eb!r}")

        # suggested_repeats (optional)
        sr = seg.get("suggested_repeats")
        if sr is not None:
            if not isinstance(sr, int) or sr < 1:
                result.error(f"{pfx}.suggested_repeats: must be a positive integer >= 1, got {sr!r}")

        # order (optional)
        order = seg.get("order")
        if order is not None and not isinstance(order, (int, float)):
            result.error(f"{pfx}.order: must be a number if present, got {order!r}")

    # Overlap check — O(n²) is fine for the small segment counts expected
    for i, (s1, e1, pfx1, id1) in enumerate(ranges):
        for j, (s2, e2, pfx2, id2) in enumerate(ranges):
            if j <= i:
                continue
            # Segments overlap if one starts before the other ends (exclusive-end convention)
            if s1 < e2 and s2 < e1:
                result.warn(
                    f"learning_segments: '{id1}' (bars {s1}–{e1-1}) overlaps "
                    f"'{id2}' (bars {s2}–{e2-1})"
                )


# ---------------------------------------------------------------------------
# Check — scoring block
# ---------------------------------------------------------------------------

def check_scoring(scoring: dict, result: Result) -> None:
    if not isinstance(scoring, dict):
        result.error("scoring: must be an object")
        return

    pwin = scoring.get("perfect_window_ms")
    gwin = scoring.get("good_window_ms")

    for field, val in (("perfect_window_ms", pwin), ("good_window_ms", gwin)):
        if val is None:
            result.error(f"scoring.{field}: missing required field")
        elif not isinstance(val, (int, float)) or val <= 0:
            result.error(f"scoring.{field}: must be a number > 0, got {val!r}")

    if isinstance(pwin, (int, float)) and isinstance(gwin, (int, float)):
        if pwin >= gwin:
            result.error(
                f"scoring.perfect_window_ms ({pwin}) must be less than "
                f"good_window_ms ({gwin})"
            )

    ppm = scoring.get("points_per_note")
    if ppm is None:
        result.error("scoring.points_per_note: missing required field")
    elif isinstance(ppm, dict):
        for key in ("perfect", "good", "late", "miss"):
            v = ppm.get(key)
            if v is None:
                result.error(f"scoring.points_per_note.{key}: missing")
            elif not isinstance(v, (int, float)) or v < 0:
                result.error(f"scoring.points_per_note.{key}: must be >= 0, got {v!r}")
    else:
        result.error("scoring.points_per_note: must be an object")


# ---------------------------------------------------------------------------
# Top-level orchestrator
# ---------------------------------------------------------------------------

def validate(data: dict, result: Result) -> None:
    """Run all validation checks on parsed song.json."""
    if not isinstance(data, dict):
        result.error("root: song.json must be a JSON object")
        return

    # meta
    if "meta" not in data:
        result.error("root: missing required 'meta' block")
    else:
        check_meta(data["meta"], result)

    # score → collect events first (needed by check_parts)
    if "score" not in data:
        result.error("root: missing required 'score' block")
    elif not isinstance(data["score"], dict) or "bars" not in data["score"]:
        result.error("score: must be an object with 'bars' array")

    bars = data.get("score", {}).get("bars", [])
    events, events_by_bar = collect_events(bars, result)
    check_events(events, result)

    # parts
    if "parts" not in data:
        result.warn("root: missing 'parts' block")
    else:
        check_parts(data["parts"], events_by_bar, result)

    # learning_segments (optional — absence is valid, not an error or warning)
    if "learning_segments" in data:
        check_learning_segments(data["learning_segments"], bars, result)

    # scoring
    if "scoring" not in data:
        result.error("root: missing required 'scoring' block")
    else:
        check_scoring(data["scoring"], result)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate a MyKey song.json against SPEC Bagian 11.8",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python tools/validate_song.py songs/output.json
  python tools/validate_song.py songs/output.json --strict

Exit codes:
  0 = passed (no errors)
  1 = one or more errors found
        """,
    )
    parser.add_argument("input", help="Path to song.json file")
    parser.add_argument(
        "--strict", action="store_true",
        help="Treat warnings as errors (exit 1 if any warnings exist)",
    )
    args = parser.parse_args()

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

    result = Result()
    validate(data, result)

    # ------------------------------------------------------------------
    # Summary header — show key stats from meta if available
    # ------------------------------------------------------------------
    meta = data.get("meta", {}) if isinstance(data, dict) else {}
    events_flat, _ = collect_events(
        data.get("score", {}).get("bars", []) if isinstance(data, dict) else [],
        Result(),   # discard duplicate errors
    )
    bars_count  = len(data.get("score", {}).get("bars", [])) if isinstance(data, dict) else 0
    parts_count = len(data.get("parts", [])) if isinstance(data, dict) else 0
    segs_count  = len(data.get("learning_segments", [])) if isinstance(data, dict) else 0

    print(f"Validating: {input_path}")
    print()
    if meta:
        print(f"  Song ID  : {meta.get('id', '?')}")
        print(f"  Title    : {meta.get('title', '?')}")
        print(f"  Composer : {meta.get('composer', '?')}")
        print(f"  Level    : {meta.get('level', '?')}")
        print(f"  BPM      : {meta.get('bpm', '?')}")
        print(f"  Events   : {len(events_flat)}")
        print(f"  Bars     : {bars_count}")
        print(f"  Parts    : {parts_count}")
        print(f"  Segments : {segs_count}")
        print()

    # ------------------------------------------------------------------
    # Print findings
    # ------------------------------------------------------------------
    if not result.errors and not result.warnings:
        print("  All checks passed.")
    else:
        for w in result.warnings:
            print(f"  WARN  {w}")
        for e in result.errors:
            print(f"  ERROR {e}")

    print()

    # ------------------------------------------------------------------
    # Final verdict
    # ------------------------------------------------------------------
    failed = not result.passed or (args.strict and result.warnings)
    status = "FAILED" if failed else "PASSED"
    print(
        f"Result: {status}  |  errors: {len(result.errors)}"
        f"  |  warnings: {len(result.warnings)}"
    )

    if not failed:
        if result.warnings:
            print("No errors. Warnings above are advisory — review before shipping.")
        else:
            print("song.json is ready for runtime engine.")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
