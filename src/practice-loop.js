/**
 * practice-loop.js — MyKey Music Labs
 * Runtime Practice Loop Foundation (Session 51)
 *
 * A temporary, session-scoped playback viewport.
 * ARCHITECTURE RULE: Completely separate from learning_segments.
 *
 *   runtimeState.practiceLoop  ≠  runtimeState.learningSegment
 *
 *   learning_segments = authored curriculum (permanent, in song.json)
 *   practiceLoop      = ephemeral session viewport (runtime-only, never persisted)
 *
 * A user may be inside "Frasa B" (activeSegmentIndex=1) while ALSO
 * temporarily looping bars 5–6, without modifying any authored structure.
 *
 * This class NEVER:
 *   - Reads or modifies learning_segments
 *   - Modifies song.json or any authored data
 *   - Controls rendering or timing directly
 *   - Persists state beyond the current session
 *
 * Integration model:
 *   - Caller passes activate() the loop params + current songData (read-only)
 *   - PracticeLoop resolves bar/beat → t_ms internally
 *   - Caller uses .start_ms / .end_ms / .bars to drive runtime.play() + renderer.render()
 *   - deactivate() returns state to zero — caller restores previous segment/full-song scope
 */

'use strict';

class PracticeLoop {

  constructor() {
    // Loop configuration — public read
    this.active         = false;
    this.start_bar      = null;
    this.start_beat     = 1;
    this.end_bar        = null;
    this.end_beat       = 1;
    this.visible_clefs  = null;   // null = respect caller's clef filter
    this.repeat_enabled = false;

    // Resolved from song data on activate() — private
    this._start_ms = null;
    this._end_ms   = null;
    this._bars     = [];
  }

  /**
   * Activate a practice loop.
   * Resolves bar+beat boundaries to t_ms using the provided song data.
   * songData is read-only — not modified.
   *
   * @param {object} params
   *   { start_bar, start_beat=1, end_bar, end_beat=1, visible_clefs=null, repeat_enabled=false }
   * @param {object} songData — loaded song.json object (read-only)
   */
  activate(params, songData) {
    if (!songData) throw new Error('PracticeLoop.activate: songData required');

    const {
      start_bar,
      start_beat     = 1,
      end_bar,
      end_beat       = 1,
      visible_clefs  = null,
      repeat_enabled = false,
    } = params;

    this.active         = true;
    this.start_bar      = start_bar;
    this.start_beat     = start_beat;
    this.end_bar        = end_bar;
    this.end_beat       = end_beat;
    this.visible_clefs  = visible_clefs;
    this.repeat_enabled = repeat_enabled;

    this._start_ms = this._resolveMs(songData, start_bar, start_beat, false) ?? 0;
    this._end_ms   = this._resolveMs(songData, end_bar,   end_beat,   true)  ?? Infinity;
    this._bars     = this._resolveBars(songData, start_bar, end_bar, end_beat);
  }

  /**
   * Activate loop from two semantic event IDs.
   * Looks up each event's t_ms directly — no bar/beat resolution needed.
   * Swaps start/end if the user clicked in reverse order.
   * Does NOT modify songData or learning_segments.
   *
   * @param {string} startId — event ID of start note (from data-event-id attribute)
   * @param {string} endId   — event ID of end note
   * @param {object} songData — loaded song.json (read-only)
   */
  activateFromEvents(startId, endId, songData) {
    if (!songData) throw new Error('PracticeLoop.activateFromEvents: songData required');

    let startEv = null, startBarN = null;
    let endEv   = null, endBarN   = null;

    for (const bar of songData.score.bars) {
      for (const ev of (bar.beats || bar.events || [])) {
        if (ev.id === startId) { startEv = ev; startBarN = bar.bar; }
        if (ev.id === endId)   { endEv   = ev; endBarN   = bar.bar; }
      }
    }

    if (!startEv || !endEv) {
      throw new Error('PracticeLoop.activateFromEvents: one or both event IDs not found');
    }

    // Ensure temporal order — user may click end before start
    const forward  = startEv.t_ms <= endEv.t_ms;
    const firstEv  = forward ? startEv  : endEv;
    const firstBar = forward ? startBarN : endBarN;
    const lastEv   = forward ? endEv    : startEv;
    const lastBar  = forward ? endBarN  : startBarN;

    this.active        = true;
    this.start_bar     = firstBar;
    this.start_beat    = firstEv.beat;
    this.end_bar       = lastBar;
    this.end_beat      = lastEv.beat;
    this.visible_clefs = null;
    // repeat_enabled preserved — caller controls

    this._start_ms = firstEv.t_ms ?? 0;
    this._end_ms   = (lastEv.t_ms ?? 0) + (lastEv.duration_ms ?? 0);

    // Include all bars from first to last, inclusive
    this._bars = songData.score.bars
      .filter(b => b.bar >= firstBar && b.bar <= lastBar)
      .map(b => b.bar);
  }

  /**
   * Deactivate loop and reset all state to zero.
   * Call when: user clears loop, new song loads, or loop is cancelled.
   * Does NOT touch learning_segments or rendering — caller handles restoration.
   */
  deactivate() {
    this.active         = false;
    this.start_bar      = null;
    this.start_beat     = 1;
    this.end_bar        = null;
    this.end_beat       = 1;
    this.visible_clefs  = null;
    this.repeat_enabled = false;
    this._start_ms      = null;
    this._end_ms        = null;
    this._bars          = [];
  }

  // Resolved playback boundaries — pass to runtime.play({ start_ms, end_ms })
  get start_ms() { return this._start_ms ?? 0; }
  get end_ms()   { return this._end_ms   ?? Infinity; }
  get bars()     { return this._bars; }

  // -------------------------------------------------------------------------
  // Private: bar+beat → t_ms resolution
  // Identical semantics to SongLoader._resolveSegmentMs / _computeSegmentBars.
  // Duplicated here to keep PracticeLoop self-contained and independent of SongLoader.
  // -------------------------------------------------------------------------

  // forEnd=false (start): t_ms of first event at or after beat.
  // forEnd=true  (end):   when beat>1, t_ms + duration_ms so the runtime condition
  //   (event.t_ms < scopeEnd) includes that beat's full duration.
  //   When beat==1, t_ms unchanged (whole-bar exclusive convention preserved).
  _resolveMs(data, bar, beat, forEnd) {
    for (const b of data.score.bars) {
      if (b.bar !== bar) continue;
      const evs = b.beats || b.events || [];
      for (const ev of evs) {
        if (ev.beat >= beat) {
          if (forEnd && beat > 1) return (ev.t_ms ?? 0) + (ev.duration_ms ?? 0);
          return ev.t_ms ?? 0;
        }
      }
      const first = evs[0];
      if (!first) return null;
      return forEnd && beat > 1
        ? ((first.t_ms ?? 0) + (first.duration_ms ?? 0))
        : (first.t_ms ?? null);
    }
    return null;
  }

  // When endBeat==1: endBar is exclusive (whole-bar convention).
  // When endBeat>1:  endBar is inclusive (segment plays through endBeat).
  _resolveBars(data, startBar, endBar, endBeat = 1) {
    const maxBar = endBeat > 1 ? endBar : endBar - 1;
    return data.score.bars
      .filter(b => b.bar >= startBar && b.bar <= maxBar)
      .map(b => b.bar);
  }
}

// ---------------------------------------------------------------------------
// Export — browser global + Node.js CommonJS
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined') module.exports = { PracticeLoop };
else (typeof globalThis !== 'undefined' ? globalThis : window).PracticeLoop = PracticeLoop;
