/**
 * runtime-engine.js — MyKey Music Labs / ariyadigital
 * Layer 1: Timeline Authority (SPEC Bagian 3.4)
 *
 * Single owner of: playhead, currentTime, activeEvents, timeline state.
 * Knows   : song timeline, event metadata, timing state.
 * Does NOT know: SVG, DOM, VexFlow, scoring, audio waveform, hint animation.
 *
 * Output — callbacks only, one direction (SPEC Bagian 3.6):
 *   onEventEnter(event)     — event window opened
 *   onEventExit(event)      — event window closed
 *   onTimelineUpdate(ms)    — every tick
 *   onEnd()                 — scope finished
 */

class RuntimeEngine {

  constructor() {
    // Song data (set by load())
    this._song   = null;
    this._events = [];       // flat, sorted by t_ms (guaranteed after load)

    // Playback state
    this._state        = 'idle';   // idle | playing | paused | ended
    this._currentTime  = 0;        // song-time in ms (at native BPM scale)
    this._tempoScale   = 1.0;      // 1.0 = native BPM; 0.5 = half speed

    // Event tracking
    this._enterIdx     = 0;                // next event index to consider for enter
    this._activeEvents = new Map();        // id → event (currently inside window)

    // Timing
    this._rafId        = null;
    this._lastWallTime = null;

    // Scope — constrain playback to a time range (used for part-scoped play)
    this._scopeStart = 0;
    this._scopeEnd   = Infinity;

    // Callbacks (simple functions, not EventEmitter — SPEC 3.6)
    this._cbEnter  = null;
    this._cbExit   = null;
    this._cbUpdate = null;
    this._cbEnd    = null;
  }

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  /**
   * Load song data from a parsed song.json object.
   * Flattens score.bars[].beats[] into a single sorted event array.
   * Engine does NOT fetch or parse JSON — caller provides the object.
   */
  load(songData) {
    if (!songData?.score?.bars) {
      throw new Error('RuntimeEngine.load: invalid song data — missing score.bars');
    }
    this._song   = songData;
    this._events = _flattenEvents(songData.score.bars);
    this._reset();
    return this;
  }

  // ---------------------------------------------------------------------------
  // Callback registration (fluent)
  // ---------------------------------------------------------------------------

  onEventEnter(fn)    { this._cbEnter  = fn; return this; }
  onEventExit(fn)     { this._cbExit   = fn; return this; }
  onTimelineUpdate(fn){ this._cbUpdate = fn; return this; }
  onEnd(fn)           { this._cbEnd    = fn; return this; }

  // ---------------------------------------------------------------------------
  // Playback control
  // ---------------------------------------------------------------------------

  /**
   * Start or resume playback.
   * @param {object} [options]
   * @param {number} [options.start_ms]   — scope start in song-time ms (segment play)
   * @param {number} [options.end_ms]     — scope end in song-time ms (Infinity = song end)
   * @param {string} [options.partId]     — play a single part by part_id (ignored if start_ms set)
   * @param {number} [options.tempoScale] — override tempo scale for this play()
   *
   * Scope priority (fresh start only, not resume):
   *   1. start_ms / end_ms — direct t_ms scope (used by segment-scoped playback)
   *   2. partId            — part-bar scope via _applyPartScope()
   *   3. (default)         — full song, t=0 to song duration
   */
  play(options = {}) {
    if (!this._song) throw new Error('RuntimeEngine: call load() before play()');
    if (this._state === 'playing') return;

    if (options.tempoScale != null) {
      this.setTempo(options.tempoScale);
    }

    if (this._state !== 'paused') {
      // Fresh start — set scope, rewind to scope start
      if (options.start_ms != null) {
        // Direct t_ms scope — used for segment-scoped playback (learning_segments)
        this._scopeStart = options.start_ms;
        this._scopeEnd   = options.end_ms ?? this._songDuration();
      } else if (options.partId) {
        this._applyPartScope(options.partId);
      } else {
        this._scopeStart = 0;
        this._scopeEnd   = this._songDuration();
      }
      this._currentTime = this._scopeStart;
      this._activeEvents.clear();
      this._seekEnterIdx(this._currentTime);
    }

    this._state        = 'playing';
    this._lastWallTime = _now();
    this._scheduleTick();
  }

  pause() {
    if (this._state !== 'playing') return;
    this._state = 'paused';
    this._cancelTick();
  }

  /** Stop playback and reset to idle. */
  stop() {
    this._cancelTick();
    this._reset();
  }

  /**
   * Seek to an absolute song-time position (ms).
   * Exits all currently active events before jumping.
   */
  seek(time_ms) {
    const wasPlaying = this._state === 'playing';
    if (wasPlaying) this.pause();

    // Exit active events before the jump — renderer must clear highlights
    for (const ev of this._activeEvents.values()) this._fireExit(ev);
    this._activeEvents.clear();

    this._currentTime = Math.max(this._scopeStart,
                          Math.min(time_ms, this._scopeEnd));
    this._seekEnterIdx(this._currentTime);

    if (wasPlaying) this.play();
    return this;
  }

  /**
   * Set tempo scale.
   * scale = targetBPM / nativeBPM
   * Examples at native 72 BPM:
   *   Easy  (~36 BPM)  → 0.50
   *   Grave (~45 BPM)  → 0.63
   *   Andante (72 BPM) → 1.00  (default)
   *   Moderato (~100)  → 1.39
   */
  setTempo(scale) {
    this._tempoScale = Math.max(0.05, Number(scale) || 1.0);
    return this;
  }

  // ---------------------------------------------------------------------------
  // State queries
  // ---------------------------------------------------------------------------

  get state()       { return this._state; }
  get currentTime() { return this._currentTime; }
  get duration()    { return this._songDuration(); }
  get scopeStart()  { return this._scopeStart; }
  get scopeEnd()    { return this._scopeEnd; }

  // ---------------------------------------------------------------------------
  // Tick loop — internal
  // ---------------------------------------------------------------------------

  _tick() {
    if (this._state !== 'playing') return;

    const wallNow   = _now();
    // Cap delta: prevents catch-up bunching when the browser stalls on the first frame
    // (e.g. DOM work after count-in removal). Notes still fire at correct wall-clock rate
    // because _lastWallTime is always set to the real timestamp, not the capped value.
    const wallDelta = Math.min(wallNow - this._lastWallTime, 100);
    this._lastWallTime = wallNow;

    // Advance song-time by wall delta × tempo scale
    this._currentTime += wallDelta * this._tempoScale;

    // Check scope end
    if (this._currentTime >= this._scopeEnd) {
      this._currentTime = this._scopeEnd;
      this._processEnters();
      this._processExits();
      if (this._cbUpdate) this._cbUpdate(this._currentTime);
      this._finishScope();
      return;
    }

    this._processEnters();
    this._processExits();
    if (this._cbUpdate) this._cbUpdate(this._currentTime);

    this._scheduleTick();
  }

  // ---------------------------------------------------------------------------
  // Event enter / exit processing
  // ---------------------------------------------------------------------------

  _processEnters() {
    while (
      this._enterIdx < this._events.length &&
      this._events[this._enterIdx].t_ms <= this._currentTime
    ) {
      const ev = this._events[this._enterIdx];
      this._enterIdx++;

      // Skip events outside current scope
      if (ev.t_ms < this._scopeStart || ev.t_ms >= this._scopeEnd) continue;

      this._activeEvents.set(ev.id, ev);
      this._fireEnter(ev);
    }
  }

  _processExits() {
    // Collect first to avoid mutating Map while iterating
    const toExit = [];
    for (const ev of this._activeEvents.values()) {
      if (ev.t_ms + ev.duration_ms <= this._currentTime) {
        toExit.push(ev);
      }
    }
    for (const ev of toExit) {
      this._activeEvents.delete(ev.id);
      this._fireExit(ev);
    }
  }

  _finishScope() {
    // Exit all remaining active events then stop
    for (const ev of this._activeEvents.values()) this._fireExit(ev);
    this._activeEvents.clear();
    this._state = 'ended';
    if (this._cbEnd) this._cbEnd();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  _fireEnter(ev) { if (this._cbEnter)  this._cbEnter(ev);  }
  _fireExit(ev)  { if (this._cbExit)   this._cbExit(ev);   }

  _reset() {
    this._cancelTick();
    this._state        = 'idle';
    this._currentTime  = 0;
    this._enterIdx     = 0;
    this._activeEvents.clear();
    this._scopeStart   = 0;
    this._scopeEnd     = this._songDuration();
    this._tempoScale   = 1.0;
  }

  /** Binary search: set _enterIdx to first event with t_ms >= time_ms. */
  _seekEnterIdx(time_ms) {
    let lo = 0, hi = this._events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._events[mid].t_ms < time_ms) lo = mid + 1;
      else hi = mid;
    }
    this._enterIdx = lo;
  }

  _applyPartScope(partId) {
    const part = (this._song.parts || []).find(p => p.part_id === partId);
    if (!part) throw new Error(`RuntimeEngine: part '${partId}' not found in song`);

    const partBars    = new Set(part.bars);
    const partEvents  = this._events.filter(ev => partBars.has(ev.bar));

    if (!partEvents.length) {
      this._scopeStart = 0;
      this._scopeEnd   = 0;
      return;
    }

    this._scopeStart = partEvents[0].t_ms;
    const last       = partEvents[partEvents.length - 1];
    this._scopeEnd   = last.t_ms + last.duration_ms;
  }

  _songDuration() {
    if (!this._events.length) return 0;
    const last = this._events[this._events.length - 1];
    return last.t_ms + last.duration_ms;
  }

  _scheduleTick() {
    if (typeof requestAnimationFrame !== 'undefined') {
      this._rafId = requestAnimationFrame(() => this._tick());
    } else {
      // Node.js fallback for offline testing (16ms ≈ 60fps)
      this._rafId = setTimeout(() => this._tick(), 16);
    }
  }

  _cancelTick() {
    if (this._rafId == null) return;
    if (typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._rafId);
    } else {
      clearTimeout(this._rafId);
    }
    this._rafId = null;
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers (private, not on prototype)
// ---------------------------------------------------------------------------

/**
 * Flatten score.bars[].beats[] into a single array sorted by t_ms.
 * Treble before bass when t_ms is equal (matches generator sort order).
 * Engine does NOT recalculate timing — t_ms and duration_ms from JSON are authoritative.
 */
function _flattenEvents(bars) {
  const events = [];
  for (const bar of bars) {
    for (const ev of (bar.beats || [])) events.push(ev);
  }
  events.sort((a, b) =>
    a.t_ms !== b.t_ms
      ? a.t_ms - b.t_ms
      : (a.clef === 'treble' ? -1 : 1)
  );
  return events;
}

/**
 * High-resolution timestamp in ms.
 * performance.now() in browser; Date.now() fallback in Node.js.
 */
function _now() {
  return (typeof performance !== 'undefined' ? performance : Date).now();
}

// ---------------------------------------------------------------------------
// Export — browser global + Node.js CommonJS
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RuntimeEngine };
} else {
  (typeof globalThis !== 'undefined' ? globalThis : window).RuntimeEngine = RuntimeEngine;
}
