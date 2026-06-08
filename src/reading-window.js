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

    /** RAF id for flowing scroll animation (portrait mode). */
    this._flowRafId = null;

    /** Current viewport zoom scale — updated via setViewportScale().
     *  Default 1.0 (no zoom). Drives zoom-aware parameter computation in _execute(). */
    this._viewportScale = 1.0;

    /** ViewportManager reference — set via setViewportManager().
     *  Used to issue a soft orientation reset when horizontal pan has drifted
     *  past orientationThreshold during a playback reframe. */
    this._viewportManager = null;

    /** Scroll axis — 'vertical' (default) or 'horizontal' (landscape FAB mode). */
    this._axis = 'vertical';

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

  /**
   * Set the scroll axis for bar tracking during playback.
   * @param {'vertical'|'horizontal'} axis
   *   'vertical'   — default; uses scrollTop (portrait / multi-row layout)
   *   'horizontal' — uses scrollLeft (landscape FAB single-row layout)
   */
  setScrollAxis(axis) {
    this._axis = axis === 'horizontal' ? 'horizontal' : 'vertical';
  }

  cancelAnimation() {
    clearTimeout(this._coalesceTimer);
    this._pending = null;
    if (this._flowRafId) { cancelAnimationFrame(this._flowRafId); this._flowRafId = null; }
  }

  destroy() {
    this.cancelAnimation();
    this._viewportEl = null;
  }

  /**
   * Flowing scroll for portrait playback — animates scrollTop linearly over the
   * bar's musical duration so the viewport glides at the pace of the music.
   * Fires at the first note of each bar. Cancels any in-progress animation.
   * No-op in horizontal (landscape FAB) mode.
   *
   * @param {number}      barN       bar number
   * @param {number}      durationMs musical duration of this bar in ms (tempo-adjusted by caller)
   * @param {HTMLElement} scoreEl    #score element
   */
  scrollToBarFlowing(barN, durationMs, scoreEl) {
    if (!this._viewportEl || this._axis !== 'vertical') return;

    const barEl = this._findBarEl(barN, scoreEl);
    if (!barEl) return;

    const vpRect  = this._viewportEl.getBoundingClientRect();
    const barRect = barEl.getBoundingClientRect();
    const vpH     = this._viewportEl.clientHeight;
    if (vpH <= 0) return;

    const zoomExcess       = Math.max(0, this._viewportScale - 1.0);
    const effectiveReadPos = Math.max(0.20, this.readingPosition - zoomExcess * 0.04);

    const barVisualTop  = barRect.top - vpRect.top;
    const targetVisualTop = vpH * effectiveReadPos;
    const delta         = barVisualTop - targetVisualTop;

    if (Math.abs(delta) < 5) return;

    // Cancel previous flowing animation
    if (this._flowRafId) {
      cancelAnimationFrame(this._flowRafId);
      this._flowRafId = null;
    }

    const startScrollTop  = this._viewportEl.scrollTop;
    const targetScrollTop = Math.max(0, startScrollTop + delta);
    // Clamp duration so very short bars don't feel like a jump, very long bars don't drag
    const effectiveDuration = Math.max(500, Math.min(durationMs, 5000));
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed  = now - startTime;
      const progress = Math.min(1, elapsed / effectiveDuration);
      this._viewportEl.scrollTop = startScrollTop + delta * progress;
      if (progress < 1) {
        this._flowRafId = requestAnimationFrame(animate);
      } else {
        this._flowRafId = null;
        // Orientation anchor — restore left origin if panned too far right
        if (this._viewportManager &&
            this._viewportManager.panX < -this.orientationThreshold) {
          this._viewportManager.softOrientationReset();
        }
      }
    };

    this._flowRafId = requestAnimationFrame(animate);
  }

  /**
   * Hybrid scroll for portrait playback — viewport stays stationary inside the
   * comfortable reading zone and only repositions (ease-in-out, 800ms) when the
   * active bar drifts into the trigger zone near the bottom.
   *
   * Visual pattern: Pause… Pause… Slow reposition… Pause… Pause… Slow reposition…
   *
   * Fires at the first note of each bar (same trigger as Flowing).
   * Cancels any in-progress flowing animation.
   * No-op in horizontal (landscape FAB) mode.
   *
   * Tuning knobs (base values at scale 1.0):
   *   hybridDeadTop  0.10 — ignore if bar already near top (plenty of ahead-content)
   *   hybridTrigger  0.65 — reposition when bar drifts this far down
   *   hybridReadPos  0.40 — reposition target (leaves ~60% for preview)
   *   hybridDuration 800  — animation duration ms (fixed for initial A/B test)
   *
   * Zoom-aware trigger:
   *   The dead zone check uses the treble note's visual top (data-bar is always tagged
   *   on trebleItems[0]). At higher zoom levels the bass stave extends proportionally
   *   further below the treble note, so the trigger zone is tightened to prevent bass
   *   clef notes from overflowing the viewport bottom before a reposition fires.
   *   effTrigger shrinks 0.18 per scale unit above 1.0, floored at 0.42.
   *   effReadPos  shrinks 0.06 per scale unit above 1.0, floored at 0.26.
   *     scale 1.0 → trigger 0.65 / readPos 0.40
   *     scale 1.5 → trigger 0.56 / readPos 0.37
   *     scale 2.0 → trigger 0.47 / readPos 0.34
   *
   * @param {number}      barN    bar number
   * @param {HTMLElement} scoreEl #score element
   */
  scrollToBarHybrid(barN, scoreEl) {
    if (!this._viewportEl) return;

    if (this._flowRafId) {
      cancelAnimationFrame(this._flowRafId);
      this._flowRafId = null;
    }

    const barEl = this._findBarEl(barN, scoreEl);
    if (!barEl) return;

    const vpRect  = this._viewportEl.getBoundingClientRect();
    const barRect = barEl.getBoundingClientRect();
    const easeInOut = t => t < 0.5 ? 2 * t * t : -2 * t * t + 4 * t - 1;

    // -----------------------------------------------------------------------
    // Horizontal branch — landscape FAB single-row layout
    //
    // Zoom-aware adjustment intentionally skipped (same reason as _execute horizontal:
    // landscape fitHeight already fixes scale at 1.5–2.0, and there is no bass-clef
    // overflow concern on the horizontal axis — all bars are in one row).
    // -----------------------------------------------------------------------
    if (this._axis === 'horizontal') {
      const vpW = this._viewportEl.clientWidth;
      if (vpW <= 0) return;

      const barVisualLeft = barRect.left - vpRect.left;
      const fraction      = barVisualLeft / vpW;

      const hDeadLeft = this.deadZoneTop;  // 0.10 — left safe zone
      const hTrigger  = 0.55;             // reposition when bar drifts this far right
      const hReadPos  = 0.25;             // target: 25% from left (more preview space to the right)
      const hDuration = 900;             // longer duration for smoother horizontal glide

      if (fraction >= hDeadLeft && fraction <= hTrigger) return;

      const delta = barVisualLeft - vpW * hReadPos;
      if (Math.abs(delta) < 5) return;

      const startScrollLeft = this._viewportEl.scrollLeft;
      const startTime       = performance.now();
      // Cubic ease-in-out: smoother acceleration and deceleration than quadratic
      const easeH = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;

      const animate = (now) => {
        const elapsed  = now - startTime;
        const t        = Math.min(1, elapsed / hDuration);
        this._viewportEl.scrollLeft = Math.max(0, startScrollLeft + delta * easeH(t));
        if (t < 1) {
          this._flowRafId = requestAnimationFrame(animate);
        } else {
          this._flowRafId = null;
        }
      };

      this._flowRafId = requestAnimationFrame(animate);
      return;
    }

    // -----------------------------------------------------------------------
    // Vertical branch — portrait mode
    // -----------------------------------------------------------------------
    const vpH = this._viewportEl.clientHeight;
    if (vpH <= 0) return;

    const barVisualTop = barRect.top - vpRect.top;
    const fraction     = barVisualTop / vpH;

    const hybridDeadTop  = 0.10;
    const hybridTrigger  = 0.65;
    const hybridReadPos  = 0.40;
    const hybridDuration = 800;

    const zoomExcess  = Math.max(0, this._viewportScale - 1.0);
    const effTrigger  = Math.max(0.42, hybridTrigger - zoomExcess * 0.18);
    const effReadPos  = Math.max(0.26, hybridReadPos  - zoomExcess * 0.06);

    if (fraction >= hybridDeadTop && fraction <= effTrigger) return;

    const targetVisualTop = vpH * effReadPos;
    const delta           = barVisualTop - targetVisualTop;
    if (Math.abs(delta) < 5) return;

    const startScrollTop = this._viewportEl.scrollTop;
    const startTime      = performance.now();

    const animate = (now) => {
      const elapsed  = now - startTime;
      const t        = Math.min(1, elapsed / hybridDuration);
      this._viewportEl.scrollTop = startScrollTop + delta * easeInOut(t);
      if (t < 1) {
        this._flowRafId = requestAnimationFrame(animate);
      } else {
        this._flowRafId = null;
        if (this._viewportManager &&
            this._viewportManager.panX < -this.orientationThreshold) {
          this._viewportManager.softOrientationReset();
        }
      }
    };

    this._flowRafId = requestAnimationFrame(animate);
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

    const zoomExcess       = Math.max(0, this._viewportScale - 1.0);
    const effectiveBottom  = Math.max(0.42, this.deadZoneBottom  - zoomExcess * 0.12);
    const effectiveReadPos = Math.max(0.20, this.readingPosition - zoomExcess * 0.04);

    // -----------------------------------------------------------------------
    // Horizontal mode — landscape FAB single-row layout
    //
    // Zoom-aware formula (effectiveBottom / effectiveReadPos) intentionally
    // skipped here: fitHeight() sets scale 1.5–2.0 in landscape FAB, which
    // would tighten the dead zone to ~0.54 and pull readPos to ~0.26 —
    // causing over-frequent, large-delta scrolls that feel fast and jumpy.
    // Fixed parameters below are tuned for horizontal reading rhythm:
    //   hDeadRight  0.70  — bar can drift to 70% before scroll fires (wider rest zone)
    //   hReadPos    0.35  — target anchor at 35% from left (smaller jump per scroll)
    // Rollback / retune: change only these two numbers.
    // -----------------------------------------------------------------------
    if (this._axis === 'horizontal') {
      const hDeadRight = 0.70;
      const hReadPos   = 0.35;
      const vpW = this._viewportEl.clientWidth;
      if (vpW <= 0) return;
      const barVisualLeft = barRect.left - vpRect.left;
      const fraction      = barVisualLeft / vpW;
      if (fraction >= this.deadZoneTop && fraction <= hDeadRight) return;
      const delta          = barVisualLeft - vpW * hReadPos;
      const targetScrollLeft = Math.max(0, this._viewportEl.scrollLeft + delta);
      // 'instant' — note sedang highlight tidak boleh bergeser selama animasi scroll.
      // 'smooth' menyebabkan bar aktif sliding ke kiri selama ~300-500ms saat masih menyala.
      this._viewportEl.scrollTo({ left: targetScrollLeft, behavior: 'instant' });
      return;
    }

    // -----------------------------------------------------------------------
    // Vertical mode (default) — original behavior unchanged
    // -----------------------------------------------------------------------
    const vpH = this._viewportEl.clientHeight;
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
