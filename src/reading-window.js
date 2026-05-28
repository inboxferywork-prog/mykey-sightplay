'use strict';

/**
 * ContextAwareReadingWindow — Task 2A / Task 2B zoom refinement
 *
 * Replaces reactive bar-tracking with a stable musical reading space.
 *
 * Architecture:
 *   Owns:        vertical scroll strategy during playback.
 *   Does NOT own: zoom/pan (ViewportManager), renderer, runtime, notation semantics.
 *   Replaces:    renderer.scrollToBar() in the playback onEventEnter path ONLY.
 *                Jump-to scrolls (segment nav, loop nav) continue using renderer.scrollToBar().
 *
 * Reading model:
 *   The active bar is positioned at readingPosition (upper portion of viewport),
 *   leaving the majority of visible space for upcoming bars — the "reading horizon."
 *   A dead zone prevents constant recentering: if the active bar is already within
 *   [deadZoneTop, deadZoneBottom], no scroll is issued. Coalescing absorbs rapid bar
 *   changes so the viewport responds calmly rather than on every note event.
 *
 * Zoom-aware tracking (Task 2B):
 *   At higher zoom levels, bars occupy more visual height. With a constant dead zone
 *   the active note can drift far down before a scroll fires — viewport feels passive.
 *   The effective dead zone bottom and reading position scale proportionally with
 *   _viewportScale so responsiveness increases as zoom increases, while calm scrolling
 *   at default scale (1.0) is completely preserved.
 *   Call setViewportScale() whenever ViewportManager's scale changes.
 *
 * Coordinate note:
 *   #notation-viewport (the scroll container) is unscaled. scrollTop and
 *   getBoundingClientRect() values are both in CSS pixels for the same coordinate
 *   system — no scale conversion is needed. deltaVisual = deltaScrollTop.
 *
 * Revert path: remove reading-window.js + script tag + init + restore
 *   renderer.scrollToBar() in the onEventEnter handler.
 */
class ContextAwareReadingWindow {

  constructor() {
    this._viewportEl    = null;
    this._coalesceTimer = null;
    this._pending       = null;

    /** Current viewport zoom scale — updated via setViewportScale().
     *  Default 1.0 (no zoom). Drives zoom-aware parameter computation in _execute(). */
    this._viewportScale = 1.0;

    /** ViewportManager reference — set via setViewportManager().
     *  Used to issue a soft orientation reset when horizontal pan has drifted
     *  past orientationThreshold during a playback reframe. */
    this._viewportManager = null;

    // -----------------------------------------------------------------------
    // Tuning parameters
    // All fractions are relative to viewportEl.clientHeight (0.0 = top, 1.0 = bottom).
    // These are the BASE values at scale 1.0. At higher zoom, effective values are
    // derived by the zoom-aware formulas in _execute().
    // -----------------------------------------------------------------------

    /** Vertical target for the active bar row (fraction from viewport top).
     *  Lower values → more future-content visible below the active bar.
     *  Base tuning range: 0.20 – 0.40. Effective value decreases at higher zoom. */
    this.readingPosition = 0.30;

    /** Dead zone upper bound — don't scroll if bar fraction is already ≥ this.
     *  Bars near the top of the viewport are fine: lots of future content is visible. */
    this.deadZoneTop     = 0.10;

    /** Dead zone lower bound — scroll once the active bar reaches this far down.
     *  Base tuning range: 0.55 – 0.75. Lower → more frequent scrolls (more reactive).
     *  Higher → calmer. Effective value decreases at higher zoom to prevent late tracking. */
    this.deadZoneBottom  = 0.65;

    /** Coalescing window (ms). Multiple bar changes within this window produce one scroll.
     *  Eliminates scroll bursts during tempo changes or fast passages.
     *  Tuning range: 60 – 200ms. */
    this.coalesceMs      = 100;

    /** Horizontal pan threshold for orientation reset (pre-scale px).
     *  If viewportManager.panX < -orientationThreshold during a reframe, a soft
     *  horizontal reset is issued via viewportManager.softOrientationReset().
     *  Value ≈ 5% of CANVAS_W (960); corresponds to the point where the left-side
     *  orientation anchors (clef, key signature) are hidden from view.
     *  Tuning range: 30 – 80. Lower → more eager resets. Higher → only resets on
     *  large drifts. No-op if viewportManager is not set. */
    this.orientationThreshold = 50;
  }

  /**
   * Connect to DOM. Must be called before scrollToBar().
   * @param {HTMLElement}  viewportEl  #notation-viewport (the scrollable clip container)
   */
  init(viewportEl) {
    this._viewportEl = viewportEl;
    return this;
  }

  /**
   * Queue a scroll for barN. Called from the playback onEventEnter handler.
   * Coalesced: only the last call within coalesceMs window executes.
   *
   * @param {number}      barN     bar number from RuntimeEngine event
   * @param {HTMLElement} scoreEl  #score element (bar elements tagged data-bar live here)
   */
  scrollToBar(barN, scoreEl) {
    this._pending = { barN, scoreEl };
    clearTimeout(this._coalesceTimer);
    this._coalesceTimer = setTimeout(() => {
      const p = this._pending;
      this._pending = null;
      if (p) this._execute(p.barN, p.scoreEl);
    }, this.coalesceMs);
  }

  /**
   * Notify the reading window of the current viewport zoom scale.
   * Should be called whenever ViewportManager fires onScaleChange.
   * Drives zoom-aware dead zone and reading position in _execute().
   * Safe to call at any time, including during playback.
   *
   * @param {number} scale  Current scale from ViewportManager (e.g. 1.5, 2.0)
   */
  setViewportScale(scale) {
    this._viewportScale = scale;
  }

  /**
   * Provide a ViewportManager reference for orientation-aware horizontal correction.
   * When a vertical reframe fires and horizontal pan has drifted past orientationThreshold,
   * viewportManager.softOrientationReset() is called to smoothly restore the left-side anchor.
   * Optional: if not set, orientation correction is silently skipped.
   *
   * @param {ViewportManager} vm
   */
  setViewportManager(vm) {
    this._viewportManager = vm;
  }

  destroy() {
    clearTimeout(this._coalesceTimer);
    this._pending    = null;
    this._viewportEl = null;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _execute(barN, scoreEl) {
    if (!this._viewportEl) return;

    const barEl = this._findBarEl(barN, scoreEl);
    if (!barEl) return;

    const vpRect  = this._viewportEl.getBoundingClientRect();
    const barRect = barEl.getBoundingClientRect();
    const vpH     = this._viewportEl.clientHeight;
    if (vpH <= 0) return;

    // Visual top of the active bar's row, relative to the viewport's top edge.
    // getBoundingClientRect() is post-transform, post-scroll — already in the right space.
    // The scroll container is unscaled, so CSS px ≡ visual px for scroll arithmetic.
    const barVisualTop = barRect.top - vpRect.top;
    const fraction     = barVisualTop / vpH;

    // -----------------------------------------------------------------------
    // Zoom-aware effective parameters
    //
    // At scale 1.0: effective values equal the base tuning values — behavior unchanged.
    // At higher zoom: bars are taller on screen, so the constant base values would let
    // the active note drift near the bottom edge before reframing. We tighten both
    // parameters proportionally so the viewport reacts slightly earlier while remaining calm.
    //
    //   effectiveBottom:
    //     Shrinks 0.12 per scale unit above 1.0, floored at 0.42.
    //     scale 1.0 → 0.65 | scale 1.5 → 0.59 | scale 2.0 → 0.53 | scale 3.0 → 0.42
    //
    //   effectiveReadingPos:
    //     Shifts upward 0.04 per scale unit above 1.0, floored at 0.20.
    //     Gives more forward-reading horizon at higher zoom without moving bar to extreme top.
    //     scale 1.0 → 0.30 | scale 1.5 → 0.28 | scale 2.0 → 0.26 | scale 3.0 → 0.22
    // -----------------------------------------------------------------------
    const zoomExcess        = Math.max(0, this._viewportScale - 1.0);
    const effectiveBottom   = Math.max(0.42, this.deadZoneBottom  - zoomExcess * 0.12);
    const effectiveReadPos  = Math.max(0.20, this.readingPosition - zoomExcess * 0.04);

    // Dead zone: bar is in a comfortable reading position — hold the viewport still.
    if (fraction >= this.deadZoneTop && fraction <= effectiveBottom) return;

    // Target: bring bar to effective reading position, leaving the lower majority for
    // upcoming bars (reading horizon). Upper positioning is intentional — not centering.
    const targetVisualTop = vpH * effectiveReadPos;
    const delta           = barVisualTop - targetVisualTop;

    // scrollTop is in CSS px (viewport unscaled); delta is in CSS px → direct addition.
    const targetScrollTop = Math.max(0, this._viewportEl.scrollTop + delta);

    this._viewportEl.scrollTo({ top: targetScrollTop, behavior: 'smooth' });

    // Orientation anchor — if horizontal pan has drifted past the threshold, smoothly
    // return to the left origin as part of this natural reframe. Bar changes are phrase
    // boundaries: a natural moment to restore the clef/key-sig reading anchor.
    // Only fires when a vertical scroll is already being issued (not on every bar change).
    if (this._viewportManager &&
        this._viewportManager.panX < -this.orientationThreshold) {
      this._viewportManager.softOrientationReset();
    }
  }

  /**
   * Locate the element tagged by notation-renderer with data-bar for this bar number.
   * notation-renderer.js tags the first note element of each bar at render time:
   *   el.dataset.bar = barData.bar
   */
  _findBarEl(barN, scoreEl) {
    return (scoreEl && scoreEl.querySelector(`[data-bar="${barN}"]`)) || null;
  }
}
