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

// Index = beat number - 1  (1=merah, 2=biru, 3=orange, 4=hijau, 5=pink, 6=tosca)
const _COLORS = ['#f44336', '#2196f3', '#ff9800', '#4caf50', '#ec407a', '#00bcd4'];

class CountIn {

  constructor() {
    this._scoreEl   = null;
    this._overlayEl = null;
    this._timer     = null;
    this._active    = false;
    this._audioCtx  = null;
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
      const beatNum = beats[idx];
      pill.style.setProperty('--pill-color', _COLORS[(beatNum - 1) % _COLORS.length]);
      pill.classList.add('nk-countin-pill--active');
      this._playBeat(beatNum);
      idx++;
      this._timer = setTimeout(tick, beatMs);
    };

    // 2-second preview: pills are visible (transparent) before counting starts.
    // Also gives scroll enough time to settle.
    this._timer = setTimeout(tick, 2000);
  }

  _playBeat(beatNum) {
    try {
      if (!this._audioCtx) {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();

      const now      = ctx.currentTime;
      const isAccent = (beatNum === 1);

      // Wood block: fundamental + slightly inharmonic overtone + noise transient

      // --- fundamental body ---
      const fundamental = isAccent ? 680 : 880;
      const osc1  = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(fundamental, now);
      gain1.gain.setValueAtTime(isAccent ? 0.8 : 0.55, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc1.start(now);
      osc1.stop(now + 0.12);

      // --- inharmonic overtone (wooden hollow character) ---
      const osc2  = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(fundamental * 2.76, now);
      gain2.gain.setValueAtTime(isAccent ? 0.35 : 0.22, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc2.start(now);
      osc2.stop(now + 0.05);

      // --- attack noise burst (the "clack" of the stick) ---
      const bufLen  = Math.ceil(ctx.sampleRate * 0.018);
      const buf     = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data    = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
      }
      const noise  = ctx.createBufferSource();
      noise.buffer = buf;
      const bpf    = ctx.createBiquadFilter();
      bpf.type     = 'bandpass';
      bpf.frequency.value = 1400;
      bpf.Q.value  = 0.8;
      const gainN  = ctx.createGain();
      noise.connect(bpf);
      bpf.connect(gainN);
      gainN.connect(ctx.destination);
      gainN.gain.setValueAtTime(isAccent ? 0.55 : 0.35, now);
      noise.start(now);
    } catch (_) {
      // audio not available — silent fallback
    }
  }

  _remove() {
    this._overlayEl?.remove();
    this._overlayEl = null;
  }
}
