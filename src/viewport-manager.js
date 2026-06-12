'use strict';

/**
 * ViewportManager — Viewport Foundation (Phase 1 / 1.5)
 *
 * Owns: zoom state, pan state, fullscreen state, viewport transforms, orientation awareness.
 * Does NOT own: playback timing, notation semantics, renderer logic, event lifecycle.
 *
 * Contract: docs/contracts/viewport-manager-contract.md
 * Architecture: docs/architecture/viewport-foundation.md
 */
class ViewportManager {

  constructor() {
    this._viewportEl         = null;
    this._cameraEl           = null;
    this._scale              = 1.0;
    this._panX               = 0;    // pre-scale (camera) coordinates
    this._fitMode            = false;
    this._isFullscreen       = false;
    this._rafPending         = false;
    this._resizeTimer        = null;
    this._orientation        = 'portrait';
    this._cleanupFns         = [];
    this._onScaleChange      = null;
    this._onFullscreenChange = null;

    // Matches CANVAS_W constant in notation-renderer.js
    this._naturalW  = 960;
    this._minScale  = 0.15;
    this._maxScale  = 4.0;
    this._zoomStep  = 0.15;
  }

  /**
   * Connect to DOM. Must be called before any zoom/pan operations.
   * @param {HTMLElement} viewportEl  #notation-viewport (scroll + clip area)
   * @param {HTMLElement} cameraEl    #notation-camera   (transform layer)
   */
  init(viewportEl, cameraEl) {
    this._viewportEl = viewportEl;
    this._cameraEl   = cameraEl;
    this._attachEvents();
    this._detectOrientation();
    return this;
  }

  /** Callback fired whenever scale changes. */
  onScaleChange(fn) {
    this._onScaleChange = fn;
    return this;
  }

  /** Callback fired whenever fullscreen state changes. */
  onFullscreenChange(fn) {
    this._onFullscreenChange = fn;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Public zoom API
  // ---------------------------------------------------------------------------

  zoomIn() {
    this._fitMode = false;
    this._setScale(this._scale + this._zoomStep);
  }

  zoomOut() {
    this._fitMode = false;
    this._setScale(this._scale - this._zoomStep);
  }

  resetZoom() {
    this._fitMode = false;
    this._panX = 0;
    this._setScale(1.0);
  }

  /**
   * Scale camera so notation width equals the viewport's usable content width.
   * Vertical scroll remains available for long scores.
   * Horizontal padding is excluded from the fit calculation to prevent clipping.
   */
  fitWidth() {
    if (!this._viewportEl) return;
    const usableW = this._usableWidth();
    if (!usableW) return;
    this._fitMode = true;
    this._panX = 0;
    this._setScale(usableW / this._naturalW);
  }

  /**
   * Like fitWidth() but applies an extra zoom multiplier on top of the fit scale.
   * zoom > 1 makes notation larger — overflows viewport width, enabling pan/scroll.
   * zoom = 1.0 is identical to fitWidth().
   * @param {number} zoom  Scale multiplier (from meta._svg_zoom, default 1.0)
   */
  fitWidthZoomed(zoom = 1.0) {
    if (!this._viewportEl) return;
    const usableW = this._usableWidth();
    if (!usableW) return;
    this._fitMode = (zoom === 1.0);
    this._panX    = 0;
    this._setScale((usableW / this._naturalW) * zoom);
  }

  /**
   * Scale camera so the given natural height fits the viewport's usable height.
   * Used in landscape FAB mode so one grand-staff row fills the score card.
   * @param {number} naturalH  Native pixel height of one content row (e.g. rowHeight + padding)
   */
  fitHeight(naturalH) {
    if (!this._viewportEl || !naturalH) return;
    const cs = window.getComputedStyle(this._viewportEl);
    const usableH = this._viewportEl.clientHeight
      - (parseFloat(cs.paddingTop)    || 0)
      - (parseFloat(cs.paddingBottom) || 0);
    if (usableH <= 0) return;
    this._fitMode = false;
    this._panX    = 0;
    this._setScale(usableH / naturalH);
  }

  /**
   * Update the natural (unscaled) canvas width and sync the camera element width.
   * Call whenever the renderer produces a canvas wider or narrower than 960px.
   * @param {number} w  New natural width in px
   */
  setNaturalWidth(w) {
    this._naturalW = w;
    if (this._cameraEl) this._cameraEl.style.width = w + 'px';
  }

  // ---------------------------------------------------------------------------
  // Fullscreen
  // ---------------------------------------------------------------------------

  toggleFullscreen() {
    if (!this._isFullscreen) this._enterFullscreen();
    else this._exitFullscreen();
  }

  // ---------------------------------------------------------------------------
  // Pan (horizontal; vertical handled by native scroll)
  // ---------------------------------------------------------------------------

  /**
   * Pan by dx screen pixels. Active only when scale > 1.05.
   * Converts to pre-scale camera coordinates internally.
   */
  panBy(dx) {
    this._panX += dx / this._scale;
    this._clampPanX();
    this._scheduleTransform();
  }

  /**
   * Smoothly return horizontal pan to origin, restoring the left-side orientation anchor.
   * Called by ContextAwareReadingWindow when a playback reframe fires and panX has drifted
   * past the orientation threshold (clef/key-sig area is no longer visible).
   *
   * Uses the .vp-orientation-reset CSS class (transition: transform 0.35s ease-out)
   * — same pattern as LandscapeViewportCoordinator's vp-transitioning. The class is
   * removed after 400ms (fallback timeout) or immediately when the user starts panning.
   *
   * No-op if panX is within 4px of origin (negligible drift).
   */
  softOrientationReset() {
    if (!this._cameraEl) return;
    if (this._panX >= -4) return;    // already at or near origin — skip

    this._cameraEl.classList.add('vp-orientation-reset');
    this._panX = 0;
    this._clampPanX();
    this._applyTransform();          // immediate — transition active via CSS class

    // Remove class after transition completes. User pan-start also clears it.
    setTimeout(() => {
      if (this._cameraEl) this._cameraEl.classList.remove('vp-orientation-reset');
    }, 400);
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  get scale()        { return this._scale; }
  get panX()         { return this._panX; }
  get isFitMode()    { return this._fitMode; }
  get isFullscreen() { return this._isFullscreen; }
  get orientation()  { return this._orientation; }

  // ---------------------------------------------------------------------------
  // Private — viewport measurement
  // ---------------------------------------------------------------------------

  /**
   * Usable content width: clientWidth minus horizontal padding.
   * Must be used instead of clientWidth for fit calculations to prevent
   * notation clipping at scale boundaries.
   */
  _usableWidth() {
    if (!this._viewportEl) return 0;
    const cs = getComputedStyle(this._viewportEl);
    return this._viewportEl.clientWidth
      - parseFloat(cs.paddingLeft  || 0)
      - parseFloat(cs.paddingRight || 0);
  }

  // ---------------------------------------------------------------------------
  // Private — scale / transform
  // ---------------------------------------------------------------------------

  _setScale(v) {
    this._scale = Math.min(this._maxScale, Math.max(this._minScale, v));
    this._clampPanX();
    this._scheduleTransform();
    if (this._onScaleChange) this._onScaleChange(this._scale);
  }

  _clampPanX() {
    const usableW = this._usableWidth();
    if (!usableW) return;
    // Pan range in pre-scale coords: 0 (left edge) to -(available overflow)
    const overflow = this._naturalW - usableW / this._scale;
    if (overflow <= 0) {
      this._panX = 0;
    } else {
      this._panX = Math.max(-overflow, Math.min(0, this._panX));
    }
  }

  _scheduleTransform() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._applyTransform();
      this._rafPending = false;
    });
  }

  _applyTransform() {
    if (!this._cameraEl) return;
    // scale() then translate() — translate is in pre-scale camera space.
    // Omit translate entirely when panX = 0 to keep the transform minimal.
    if (this._panX === 0) {
      this._cameraEl.style.transform = `scale(${this._scale})`;
    } else {
      this._cameraEl.style.transform =
        `scale(${this._scale}) translate(${this._panX}px, 0px)`;
    }
  }

  // ---------------------------------------------------------------------------
  // Private — orientation
  // ---------------------------------------------------------------------------

  _detectOrientation() {
    this._orientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    document.documentElement.dataset.vpOrientation = this._orientation;
  }

  // ---------------------------------------------------------------------------
  // Private — fullscreen
  // ---------------------------------------------------------------------------

  _enterFullscreen() {
    // Request fullscreen on the score-card so notation fills the screen
    const target = this._viewportEl.closest('.score-card') || document.documentElement;
    const fn = target.requestFullscreen
      || target.webkitRequestFullscreen
      || target.mozRequestFullScreen;
    if (fn) fn.call(target).catch(() => {});
  }

  _exitFullscreen() {
    const fn = document.exitFullscreen
      || document.webkitExitFullscreen
      || document.mozCancelFullScreen;
    if (fn) fn.call(document).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Private — events
  // ---------------------------------------------------------------------------

  _attachEvents() {
    // Fullscreen change
    const onFSChange = () => {
      this._isFullscreen = !!(
        document.fullscreenElement || document.webkitFullscreenElement
      );
      if (this._onFullscreenChange) this._onFullscreenChange(this._isFullscreen);
      // Re-fit after fullscreen resizes the viewport
      if (this._fitMode) requestAnimationFrame(() => this.fitWidth());
    };
    document.addEventListener('fullscreenchange',       onFSChange);
    document.addEventListener('webkitfullscreenchange', onFSChange);
    this._cleanupFns.push(
      () => document.removeEventListener('fullscreenchange',       onFSChange),
      () => document.removeEventListener('webkitfullscreenchange', onFSChange)
    );

    // Resize — debounced 80ms to avoid excessive RAF calls during drag-resize
    const onResize = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this._detectOrientation();
        if (this._fitMode) this.fitWidth();
      }, 80);
    };
    window.addEventListener('resize', onResize, { passive: true });
    this._cleanupFns.push(() => {
      window.removeEventListener('resize', onResize);
      clearTimeout(this._resizeTimer);
    });

    this._attachTouchPan();
    this._attachMousePan();
  }

  _attachTouchPan() {
    let lastX = null;

    const onStart = e => {
      if (e.touches.length === 1 && this._scale > 1.05) {
        lastX = e.touches[0].clientX;
        // Immediately cancel any active orientation-reset transition so pan is instant.
        if (this._cameraEl) this._cameraEl.classList.remove('vp-orientation-reset');
      } else {
        lastX = null;
      }
    };

    const onMove = e => {
      if (lastX === null || e.touches.length !== 1 || this._scale <= 1.05) {
        lastX = null;
        return;
      }
      const dx = e.touches[0].clientX - lastX;
      lastX = e.touches[0].clientX;
      this.panBy(dx);
    };

    const onEnd = () => { lastX = null; };

    this._viewportEl.addEventListener('touchstart', onStart, { passive: true });
    this._viewportEl.addEventListener('touchmove',  onMove,  { passive: true });
    this._viewportEl.addEventListener('touchend',   onEnd,   { passive: true });

    this._cleanupFns.push(
      () => this._viewportEl.removeEventListener('touchstart', onStart),
      () => this._viewportEl.removeEventListener('touchmove',  onMove),
      () => this._viewportEl.removeEventListener('touchend',   onEnd)
    );
  }

  _attachMousePan() {
    let dragging = false;
    let lastX    = 0;

    const onDown = e => {
      if (this._scale <= 1.05) return;
      dragging = true;
      lastX    = e.clientX;
      this._viewportEl.style.cursor = 'grabbing';
      // Immediately cancel any active orientation-reset transition so pan is instant.
      if (this._cameraEl) this._cameraEl.classList.remove('vp-orientation-reset');
    };

    const onMove = e => {
      if (!dragging) return;
      this.panBy(e.clientX - lastX);
      lastX = e.clientX;
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      if (this._viewportEl) this._viewportEl.style.cursor = '';
    };

    this._viewportEl.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);

    this._cleanupFns.push(
      () => this._viewportEl.removeEventListener('mousedown', onDown),
      () => window.removeEventListener('mousemove', onMove),
      () => window.removeEventListener('mouseup',   onUp)
    );
  }

  destroy() {
    clearTimeout(this._resizeTimer);
    this._cleanupFns.forEach(fn => fn());
    this._cleanupFns = [];
    this._viewportEl = null;
    this._cameraEl   = null;
  }
}
