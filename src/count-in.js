'use strict';

/**
 * CountIn — animated beat counter shown before playback starts.
 *
 * Renders a row of pill-shaped beat indicators inside the score element
 * (above the treble stave, in the TREBLE_Y_OFF gap). Pills light up
 * one per beat at the song's tempo, then call onComplete.
 *
 * Beat sequences per time signature:
 *   2/4 → [1,2,1,2]       — 2 bars (feels too short with 1)
 *   3/4 → [1,2,3,1,2,3]   — 2 bars
 *   4/4 → [1,2,3,4]       — 1 bar
 *   6/8 → [1,2,3,4,5,6]   — 1 bar
 *
 * Colors are keyed by beat NUMBER so repeating beats share the same color
 * (e.g. both "1"s in [1,2,1,2] are green — reinforces beat identity).
 */

const _SEQUENCES = {
  '2/4': [1, 2, 1, 2],
  '3/4': [1, 2, 3, 1, 2, 3],
  '4/4': [1, 2, 3, 4],
  '6/8': [1, 2, 3, 4, 5, 6],
};

// Index = beat number - 1
const _COLORS = ['#4caf50', '#2196f3', '#ff9800', '#e91e63', '#9c27b0', '#00bcd4'];

class CountIn {

  constructor() {
    this._scoreEl   = null;
    this._overlayEl = null;
    this._timer     = null;
    this._active    = false;
  }

  /**
   * @param {HTMLElement} scoreEl  #score element (pills are appended here)
   */
  init(scoreEl) {
    this._scoreEl = scoreEl;
    return this;
  }

  /**
   * @param {string}   timeSig     '4/4' | '3/4' | '2/4' | '6/8'
   * @param {number}   bpm         native BPM of song
   * @param {number}   tempoScale  current tempo multiplier
   * @param {Function} onComplete  called after the last pill lights up
   */
  start({ timeSig, bpm, tempoScale, onComplete }) {
    this.cancel();
    this._active = true;

    const beats  = _SEQUENCES[timeSig] ?? [1, 2, 3, 4];
    const beatMs = Math.round(60000 / ((bpm ?? 120) * (tempoScale ?? 1)));

    this._build(beats);
    this._animate(beats, beatMs, onComplete);
  }

  cancel() {
    this._active = false;
    clearTimeout(this._timer);
    this._remove();
  }

  // ---------------------------------------------------------------------------

  _build(beats) {
    const overlay = document.createElement('div');
    overlay.className = 'nk-countin';

    beats.forEach(num => {
      const pill = document.createElement('div');
      pill.className = 'nk-countin-pill';
      pill.textContent = num;
      overlay.appendChild(pill);
    });

    this._scoreEl.appendChild(overlay);
    this._overlayEl = overlay;
  }

  _animate(beats, beatMs, onComplete) {
    const pills = Array.from(this._overlayEl.querySelectorAll('.nk-countin-pill'));
    let idx = 0;

    const tick = () => {
      if (!this._active) return;
      if (idx >= pills.length) {
        this._remove();
        onComplete?.();
        return;
      }
      const pill = pills[idx];
      pill.style.setProperty('--pill-color', _COLORS[(beats[idx] - 1) % _COLORS.length]);
      pill.classList.add('nk-countin-pill--active');
      idx++;
      this._timer = setTimeout(tick, beatMs);
    };

    // 80ms settle delay — lets instant scroll complete before first pill appears
    this._timer = setTimeout(tick, 80);
  }

  _remove() {
    this._overlayEl?.remove();
    this._overlayEl = null;
  }
}
