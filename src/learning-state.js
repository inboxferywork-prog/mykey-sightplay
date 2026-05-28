/**
 * learning-state.js — MyKey Music Labs / ariyadigital
 * Guided Learning Interaction Foundation (Session 39)
 *
 * Ownership: presentation-layer state ABOVE the frozen semantic renderer.
 *
 * Knows  : song meta (level, hand_mode, active_clefs), user filter choices
 * Does NOT know: renderer internals, runtime timing, VexFlow, scoring, gameplay
 *
 * This module is the single owner of:
 *   - Hand semantic identity (treble=RH, bass=LH — determines which CSS class to apply)
 *   - Clef filter (which clef's events trigger audio + highlights in the UI)
 *   - Keyboard highlight state (hook for future visual piano keyboard)
 *   - Level-derived always-visible overlay rules (note names, fingering)
 *
 * It NEVER:
 *   - Mutates song.json or any semantic event field (t_ms, duration_ms, notes, ties)
 *   - Calls renderer.render() or changes notation layout
 *   - Calls runtime-engine methods or changes playback timing
 *   - Contains scoring, gameplay, or stage progression logic
 *
 * Communication pattern (SPEC §3.6):
 *   runtime events → interaction adapter (index.html) → queries this module
 *   → renderer.highlight() / _playNote() / future keyboard component
 *
 * SPEC references:
 *   §3.4  Engine boundaries — learning state is presentation layer, not a gameplay engine
 *   §3.5  State ownership — learningPresentationState + keyboardHighlightState
 *   §5.4  Stage 1 Explore — highlight orange (hand-color mode: treble=blue, bass=warm)
 *   §7.1  Always-visible hints per level (note name overlay, finger overlay, hand colors)
 */

class LearningModeState {

  // ---------------------------------------------------------------------------
  // Hand-color identity — immutable visual constants (SPEC §7.1)
  // ---------------------------------------------------------------------------
  //
  // These are semantic identity tokens for the two hands, not aesthetic choices.
  // treble = "biru" (blue), bass = "merah/oranye" (warm orange-red)
  // Used for highlight styles, future keyboard coloring, and clef filter buttons.
  //
  // Do NOT change these without updating CSS classes and all consumer components.

  constructor() {

    // ── State loaded from song meta ──────────────────────────────────────────
    this._level       = 'beginner';          // meta.level: early_beginner|beginner|intermediate|advanced
    this._handMode    = 'both';              // meta.hand_mode: 'both'|'rh_only'|'lh_only'
    this._activeClefs = ['treble', 'bass'];  // meta.active_clefs

    // ── Presentation rules derived from level ────────────────────────────────
    // handColorMode: true → apply RH/LH semantic classes (theme controls colors)
    //                false → apply unified 'active' class (early_beginner simplicity)
    // noteNameOverlay: true → note name text shown below each notehead (early_beginner)
    // fingerOverlay: true → finger numbers shown on keys (early_beginner)
    this._handColorMode   = true;
    this._noteNameOverlay = false;
    this._fingerOverlay   = false;

    // ── User-controlled presentation toggles ─────────────────────────────────
    // clefFilter: 'both' | 'treble' | 'bass'
    // Controls which clef's events produce audio + SVG highlights in the UI.
    // Does NOT affect renderer.render() — all notation is always visible.
    // Does NOT affect runtime dispatch — all events always fire.
    this._clefFilter = 'both';

    // ── Keyboard highlight state ─────────────────────────────────────────────
    // Hook for future visual piano keyboard component.
    // null when idle; { notes, clef, color, eventId } when a note is active.
    this._keyboardState = null;

    // ── Callbacks ────────────────────────────────────────────────────────────
    this._onStateChange  = null;  // fn(LearningModeState)  — fired on any state change
    this._onKeyHighlight = null;  // fn({ notes, clef, color, eventId } | null)
  }

  // ---------------------------------------------------------------------------
  // Load — call once per song load, before first playback tick
  // ---------------------------------------------------------------------------

  /**
   * Initialize presentation state from song.json meta.
   * Resets clef filter to match song hand_mode.
   * Derives overlay rules from level.
   */
  loadFromMeta(meta) {
    this._level       = meta.level        || 'beginner';
    this._handMode    = meta.hand_mode    || 'both';
    this._activeClefs = meta.active_clefs || ['treble', 'bass'];

    // Level-derived always-visible hint rules (SPEC §7.1)
    const isEarlyBeginner = this._level === 'early_beginner';
    this._noteNameOverlay = isEarlyBeginner;
    this._fingerOverlay   = isEarlyBeginner;
    // Hand-color mode: always active — treble=blue, bass=warm orange-red.
    // All levels benefit from consistent hand identity; early_beginner is no exception.
    this._handColorMode = true;

    // Reset clef filter to match song hand_mode
    this._clefFilter = this._handMode === 'rh_only' ? 'treble'
                     : this._handMode === 'lh_only'  ? 'bass'
                     : 'both';

    this._keyboardState = null;
    this._notifyStateChange();
  }

  // ---------------------------------------------------------------------------
  // Presentation queries — called by interaction adapter per runtime event
  // ---------------------------------------------------------------------------

  /**
   * Is this event's clef currently active for UI presentation?
   *
   * Used to decide: (1) call renderer.highlight() or not,
   *                 (2) call _playNote() or not.
   *
   * renderer.render() is NEVER conditioned on this — all notes are always rendered.
   */
  isClefActive(clef) {
    return this._clefFilter === 'both' || this._clefFilter === clef;
  }

  /**
   * Return the renderer highlight style string for this event.
   * Caller passes result to renderer.highlight(id, style) → applies CSS class nk-${style}.
   *
   * handColorMode ON  : treble → 'note-active-rh', bass → 'note-active-lh'
   * handColorMode OFF : 'active' (unified — SPEC §5.4 Stage 1 early_beginner)
   * rest events       : always 'active-rest' (dimmed, any mode)
   *
   * CSS for all highlight classes is defined in themes/base-ui.css using
   * semantic variables (--rh-color, --lh-color) owned by the active theme.
   */
  getHighlightStyle(ev) {
    if (ev.type === 'rest') return 'active-rest';
    if (!this._handColorMode) return 'active';
    return ev.clef === 'treble' ? 'note-active-rh' : 'note-active-lh';
  }

  /**
   * Should audio (_playNote) be called for this event?
   *
   * False when: rest event, tie_stop continuation, or clef not in current filter.
   * This is the ONLY place the clef filter affects audio behavior.
   */
  shouldPlayAudio(ev) {
    if (ev.type === 'rest') return false;
    if (ev.tie_stop)        return false;
    return this.isClefActive(ev.clef);
  }

  // ---------------------------------------------------------------------------
  // Event notification — call from interaction adapter's onEventEnter / onEventExit
  // ---------------------------------------------------------------------------

  /**
   * Called from interaction adapter when a note event enters.
   * Updates keyboard highlight state and fires onKeyHighlight callback.
   *
   * This is the primary hook for a future visual piano keyboard component:
   *   learningState.onKeyHighlight(kh => keyboardComponent.show(kh));
   *
   * Rests and filtered-clef events do not produce a keyboard highlight.
   */
  notifyEventEnter(ev) {
    if (ev.type === 'rest' || !this.isClefActive(ev.clef)) return;

    const payload = {
      type:  'enter',
      notes: ev.notes || [],
      clef:  ev.clef,   // 'treble' | 'bass' — KeyboardViz uses this to apply RH/LH class
      eventId: ev.id,
      // Pass tie_stop as a semantic signal so KeyboardViz can suppress re-attack
      // animation for tied continuations without duplicating tie logic.
      // Authority: song.json (tie_stop is set by mxl_to_song.py, never inferred here).
      isTieContinuation: !!ev.tie_stop,
    };
    this._keyboardState = payload;
    if (this._onKeyHighlight) this._onKeyHighlight(payload);
  }

  /**
   * Called from interaction adapter when an event exits.
   * Always fires callback for non-rest events so KeyboardViz can track per-key
   * release via eventId, even when multiple simultaneous events are active.
   * _keyboardState is cleared only when this event was the last stored one.
   */
  notifyEventExit(ev) {
    if (this._keyboardState?.eventId === ev.id) this._keyboardState = null;
    if (this._onKeyHighlight && ev.type !== 'rest') {
      this._onKeyHighlight({ type: 'exit', notes: ev.notes || [], clef: ev.clef, eventId: ev.id });
    }
  }

  // ---------------------------------------------------------------------------
  // User-controlled clef filter
  // ---------------------------------------------------------------------------

  /**
   * Set clef filter from UI (hand-filter buttons).
   * 'both' | 'treble' | 'bass'
   *
   * Fires onKeyHighlight(null) immediately to clear any pending keyboard state,
   * since the next event entering may be a different clef.
   * Fires onChange so the UI can resync button selection.
   */
  setClefFilter(filter) {
    if (this._clefFilter === filter) return;
    this._clefFilter = filter;
    // Clear keyboard state — active event may be for the newly-filtered clef
    this._keyboardState = null;
    if (this._onKeyHighlight) this._onKeyHighlight({ type: 'clear' });
    this._notifyStateChange();
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  get clefFilter()      { return this._clefFilter; }
  get level()           { return this._level; }
  get handMode()        { return this._handMode; }
  get activeClefs()     { return this._activeClefs; }
  get handColorMode()   { return this._handColorMode; }
  get noteNameOverlay() { return this._noteNameOverlay; }
  get fingerOverlay()   { return this._fingerOverlay; }
  get keyboardState()   { return this._keyboardState; }

  /**
   * True when song has both treble and bass clefs active.
   * Used by UI to decide whether to show the hand-filter control row.
   */
  get hasBothClefs() {
    return this._activeClefs.includes('treble') && this._activeClefs.includes('bass');
  }

  // ---------------------------------------------------------------------------
  // Callback registration (fluent, matching runtime-engine.js pattern)
  // ---------------------------------------------------------------------------

  onChange(fn)       { this._onStateChange  = fn; return this; }
  onKeyHighlight(fn) { this._onKeyHighlight = fn; return this; }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  _notifyStateChange() {
    if (this._onStateChange) this._onStateChange(this);
  }
}

// ---------------------------------------------------------------------------
// Export — browser global + Node.js CommonJS (matching notation-renderer.js pattern)
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LearningModeState };
} else {
  (typeof globalThis !== 'undefined' ? globalThis : window).LearningModeState = LearningModeState;
}
