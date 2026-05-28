'use strict';

/**
 * LandscapeViewportCoordinator — Viewport Layer Phase 1.6
 *
 * Manages orientation-aware CSS classes and the rotation transition guard only.
 * Does NOT modify renderer, runtime, or ViewportManager's internal transform state.
 *
 * Responsibilities:
 *   - Toggle .vp-landscape / .vp-portrait on .score-card
 *   - Toggle .vp-fullscreen-active on .score-card
 *   - Apply #notation-camera.vp-transitioning for 380ms on rotation events
 *
 * Architecture: additive, isolated, reversible. Revert = remove this file + script tag.
 */
class LandscapeViewportCoordinator {

  constructor() {
    this._scoreCardEl     = null;
    this._cameraEl        = null;
    this._viewportManager = null;
    this._orientation     = 'portrait';
    this._transitionTimer = null;
    this._cleanupFns      = [];
  }

  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.scoreCardEl   .score-card element
   * @param {HTMLElement} opts.cameraEl      #notation-camera element
   * @param {ViewportManager} opts.viewportManager
   */
  init({ scoreCardEl, cameraEl, viewportManager }) {
    this._scoreCardEl     = scoreCardEl;
    this._cameraEl        = cameraEl;
    this._viewportManager = viewportManager;
    this._orientation     = this._currentOrientation();
    this._attachEvents();
    this._syncClasses();
    return this;
  }

  destroy() {
    clearTimeout(this._transitionTimer);
    if (this._cameraEl) this._cameraEl.classList.remove('vp-transitioning');
    if (this._scoreCardEl) {
      this._scoreCardEl.classList.remove('vp-landscape', 'vp-portrait', 'vp-fullscreen-active');
    }
    this._cleanupFns.forEach(fn => fn());
    this._cleanupFns = [];
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  _currentOrientation() {
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  }

  _syncClasses() {
    if (!this._scoreCardEl) return;
    const isLandscape = this._orientation === 'landscape';
    const isFS = this._viewportManager ? this._viewportManager.isFullscreen : false;
    this._scoreCardEl.classList.toggle('vp-landscape',         isLandscape);
    this._scoreCardEl.classList.toggle('vp-portrait',          !isLandscape);
    this._scoreCardEl.classList.toggle('vp-fullscreen-active', isFS);
  }

  _applyTransitionGuard() {
    if (!this._cameraEl) return;
    this._cameraEl.classList.add('vp-transitioning');
    clearTimeout(this._transitionTimer);
    this._transitionTimer = setTimeout(() => {
      if (this._cameraEl) this._cameraEl.classList.remove('vp-transitioning');
    }, 380);
  }

  _attachEvents() {
    const onResize = () => {
      const next = this._currentOrientation();
      if (next !== this._orientation) {
        this._orientation = next;
        this._applyTransitionGuard();
      }
      this._syncClasses();
    };
    window.addEventListener('resize', onResize, { passive: true });
    this._cleanupFns.push(() => window.removeEventListener('resize', onResize));

    const onFSChange = () => { this._syncClasses(); };
    document.addEventListener('fullscreenchange',       onFSChange);
    document.addEventListener('webkitfullscreenchange', onFSChange);
    this._cleanupFns.push(
      () => document.removeEventListener('fullscreenchange',       onFSChange),
      () => document.removeEventListener('webkitfullscreenchange', onFSChange)
    );
  }
}
