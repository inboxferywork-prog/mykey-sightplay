/**
 * keyboard-viz.js — MyKey Music Labs / ariyadigital
 * Keyboard Visualization Foundation (Session 40)
 *
 * Presentation consumer only. Receives typed highlight events via
 * LearningModeState.onKeyHighlight() and renders active note highlights
 * on a visual piano keyboard.
 *
 * Architecture: Semantic Playback Events → LearningModeState → KeyboardViz → DOM
 *
 * This module NEVER:
 *   - Interprets MusicXML or song.json semantics
 *   - Controls playback timing or semantic behavior
 *   - Reads or mutates renderer state
 *   - Becomes a second playback engine
 *
 * Communication pattern:
 *   learningState.onKeyHighlight(kh => keyboardViz.onHighlight(kh))
 *
 * kh protocol (from LearningModeState):
 *   { type: 'enter', notes, clef, color, eventId }  — note event begins
 *   { type: 'exit',  notes, clef, eventId }          — note event ends
 *   { type: 'clear' }                                — clear all (seek/stop/filter change)
 *
 * activeKeys Map handles simultaneous treble+bass events by tracking per-key
 * eventId sets — a key stays lit until ALL events that lit it have exited.
 *
 * SPEC references:
 *   §3.5  State ownership — keyboard visualization is presentation consumer
 *   §7.1  Hand-color identity — colors come from LearningModeState, not hardcoded here
 */

// ---------------------------------------------------------------------------
// Note → MIDI helper (module-level, no class dependency)
// ---------------------------------------------------------------------------
// Matches the convention in index.html _noteToHz(): (octave+1)*12 + semitone
// C4 = MIDI 60 (middle C, standard convention)

function _midiToNoteName(midi) {
  const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

function _kbNoteToMidi(name) {
  const m = name.match(/^([A-G])(#{1,2}|b{1,2})?(\d+)$/);
  if (!m) return null;
  const steps = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semi = steps[m[1]];
  const acc = m[2] || '';
  if      (acc === '#')  semi += 1;
  else if (acc === '##') semi += 2;
  else if (acc === 'b')  semi -= 1;
  else if (acc === 'bb') semi -= 2;
  return (parseInt(m[3]) + 1) * 12 + semi;
}

// ---------------------------------------------------------------------------
// KeyboardViz class
// ---------------------------------------------------------------------------

class KeyboardViz {

  // -------------------------------------------------------------------------
  // Piano layout constants
  // W  = white key width (px)      G   = gap between white keys (px)
  // P  = pitch stride = W + G      H   = white key height (px)
  // BW = black key width (px)      BH  = black key height (px)
  //
  // BOFF: black key left-edge x within its octave (from that octave's C).
  //   Key: semitone index (C#=1, D#=3, F#=6, G#=8, A#=10)
  //   Value: distance from octave C's left edge to black key's left edge
  //   Math: each white key stride = P=29. Black center ≈ between adjacent
  //   white key centers. BW=16, so left = center - 8.
  //     C#: center (14+43)/2=28.5 → left 20 (C center=14, D center=43)
  //     D#: center (43+72)/2=57.5 → left 49 (D center=43, E center=72)
  //     F#: center(101+130)/2=115.5→left 107 (F center=101, G center=130)
  //     G#: center(130+159)/2=144.5→left 136 (G center=130, A center=159)
  //     A#: center(159+188)/2=173.5→left 165 (A center=159, B center=188)
  //
  // IS_WHITE[semitone]: true = white key, false = black key
  // -------------------------------------------------------------------------

  constructor() {
    this._W  = 28;
    this._G  = 1;
    this._P  = 29;   // = W + G
    this._H  = 96;
    this._BW = 16;
    this._BH = 60;

    this._BOFF = { 1: 20, 3: 49, 6: 107, 8: 136, 10: 165 };
    this._IS_WHITE = [true,false,true,false,true,true,false,true,false,true,false,true];

    // Range — always snapped to C..B octave boundaries by setRange()
    this._loMidi = 48;   // C3
    this._hiMidi = 83;   // B5

    this._LABEL_H = 22;  // px height reserved above keys for note-name row

    this._container  = null;                     // root DOM element
    this._keyEls     = new Map();               // midi → HTMLElement
    this._labelEls   = new Map();               // midi → <span> label element
    this._activeKeys = new Map();               // midi → { color: string, eventIds: Set<string> }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Attach keyboard to a container element and render initial DOM.
   * Call once at app init.
   */
  render(containerEl) {
    this._container = containerEl;
    this._build();
  }

  /**
   * Set compact key dimensions — for landscape FAB mode.
   * Recalculates black-key offsets automatically from the new geometry.
   * @param {number} W       White key width (px)
   * @param {number} H       White key height (px)
   * @param {number} BW      Black key width (px)
   * @param {number} BH      Black key height (px)
   * @param {number} LABEL_H Note label row height (px)
   */
  setDimensions(W, H, BW, BH, LABEL_H) {
    this._W       = W;
    this._G       = 1;
    this._P       = W + 1;
    this._H       = H;
    this._BW      = BW;
    this._BH      = BH;
    this._LABEL_H = LABEL_H;
    // Recalculate black-key left-edge offsets from new white-key geometry.
    // White-key centers from octave C: C=W/2, D=P+W/2, E=2P+W/2 … B=6P+W/2.
    // Black-key center = midpoint of adjacent white-key centers; left = center - BW/2.
    const P = this._P, c = W / 2, h = BW / 2;
    this._BOFF = {
      1:  Math.floor(P   / 2 + c - h),   // C#
      3:  Math.floor(3*P / 2 + c - h),   // D#
      6:  Math.floor(7*P / 2 + c - h),   // F#
      8:  Math.floor(9*P / 2 + c - h),   // G#
      10: Math.floor(11*P/ 2 + c - h),   // A#
    };
    if (this._container) this._build();
  }

  /** Restore default key dimensions (undo setDimensions). */
  restoreDefaults() {
    this.setDimensions(28, 96, 16, 60, 22);
  }

  /**
   * Set MIDI range for keyboard display.
   * Snaps loMidi down to nearest C, hiMidi up to nearest B.
   * Rebuilds DOM if container is attached.
   */
  setRange(loMidi, hiMidi) {
    const loSemi = loMidi % 12;
    const hiSemi = hiMidi % 12;
    this._loMidi = loMidi - loSemi;          // snap down to C
    this._hiMidi = hiMidi + (11 - hiSemi);   // snap up to B
    this._activeKeys.clear();
    if (this._container) this._build();
  }

  /**
   * Scan all note events in songData and auto-set range to cover them.
   * Pads by one octave on each side so no note sits at the keyboard edge.
   * Falls back to C3–B5 if no notes found.
   */
  setRangeFromSong(songData) {
    let lo = 127, hi = 0;
    try {
      for (const bar of songData.score.bars) {
        for (const beat of bar.beats) {
          if (!beat.notes || beat.type === 'rest') continue;
          for (const n of beat.notes) {
            const midi = _kbNoteToMidi(n);
            if (midi == null) continue;
            if (midi < lo) lo = midi;
            if (midi > hi) hi = midi;
          }
        }
      }
    } catch (_) {
      // Malformed songData — fall back to default range
    }
    if (lo > hi) { lo = 48; hi = 83; }
    this.setRange(lo - 12, hi + 12);
  }

  /**
   * Handle a typed highlight event from LearningModeState.onKeyHighlight().
   *   kh.type === 'enter' : activate keys for this event's notes
   *   kh.type === 'exit'  : deactivate keys when all events for each key have exited
   *   kh.type === 'clear' : clear all key highlights immediately
   */
  onHighlight(kh) {
    if (!kh || kh.type === 'clear') {
      this._activeKeys.clear();
      this._refresh();
      return;
    }

    const notes = kh.notes || [];

    if (kh.type === 'enter') {
      for (const n of notes) {
        const midi = _kbNoteToMidi(n);
        if (midi == null) continue;
        const wasActive = this._activeKeys.has(midi);
        if (!wasActive) {
          this._activeKeys.set(midi, { clef: kh.clef, eventIds: new Set() });
        }
        const entry = this._activeKeys.get(midi);
        entry.eventIds.add(kh.eventId);
        entry.clef = kh.clef;  // last-in clef wins (treble/bass overlap edge case)

        // Re-attack visualization: same key pressed again — briefly flash off so the
        // user perceives the new attack. Pure visual effect; no timing semantics changed.
        // isTieContinuation comes from song.json tie_stop via LearningModeState payload;
        // tied notes sustain continuously — no flash. Repeated notes flash once.
        if (wasActive && !kh.isTieContinuation) this._triggerReattack(midi);
      }

    } else if (kh.type === 'exit') {
      for (const n of notes) {
        const midi = _kbNoteToMidi(n);
        if (midi == null) continue;
        const entry = this._activeKeys.get(midi);
        if (!entry) continue;
        entry.eventIds.delete(kh.eventId);
        if (entry.eventIds.size === 0) this._activeKeys.delete(midi);
      }
    }

    this._refresh();
  }

  /**
   * Clear all active highlights and reset state.
   * Call alongside renderer.clearAll() on stop / reset / seek.
   */
  clear() {
    this._activeKeys.clear();
    this._refresh();
  }

  // -------------------------------------------------------------------------
  // DOM build
  // -------------------------------------------------------------------------

  _build() {
    if (!this._container) return;
    this._keyEls.clear();
    this._labelEls.clear();

    const wrap = document.createElement('div');
    wrap.className = 'nk-kb';

    const { whiteKeys, blackKeys, totalWidth } = this._layout();
    wrap.style.width    = totalWidth + 'px';
    wrap.style.height = (this._H + this._LABEL_H) + 'px';

    // Label row — floats in the padding area above the keys
    const labelRow = document.createElement('div');
    labelRow.className = 'nk-kb-label-row';
    wrap.appendChild(labelRow);

    // White keys first (z-index: 1)
    for (const k of whiteKeys) {
      const el = document.createElement('div');
      el.className = 'nk-kb-white';
      if (k.isC) el.classList.add('nk-kb-c');
      if (k.midi === 60) el.classList.add('nk-kb-middlec');  // Middle C landmark
      el.style.left   = k.x + 'px';
      el.style.top    = this._LABEL_H + 'px';
      el.style.width  = this._W + 'px';
      el.style.height = this._H + 'px';
      wrap.appendChild(el);
      this._keyEls.set(k.midi, el);

      const lbl = document.createElement('span');
      lbl.className = 'nk-kb-note-label';
      lbl.textContent = _midiToNoteName(k.midi);
      lbl.style.left = (k.x + Math.round(this._W / 2)) + 'px';
      labelRow.appendChild(lbl);
      this._labelEls.set(k.midi, lbl);
    }

    // Black keys on top (z-index: 2)
    for (const k of blackKeys) {
      const el = document.createElement('div');
      el.className = 'nk-kb-black';
      el.style.left   = k.x + 'px';
      el.style.top    = this._LABEL_H + 'px';
      el.style.width  = this._BW + 'px';
      el.style.height = this._BH + 'px';
      wrap.appendChild(el);
      this._keyEls.set(k.midi, el);

      const lbl = document.createElement('span');
      lbl.className = 'nk-kb-note-label';
      lbl.textContent = _midiToNoteName(k.midi);
      lbl.style.left = (k.x + Math.round(this._BW / 2)) + 'px';
      labelRow.appendChild(lbl);
      this._labelEls.set(k.midi, lbl);
    }

    this._container.innerHTML = '';
    this._container.appendChild(wrap);
    this._refresh();
  }

  /**
   * Compute pixel positions for all keys from loMidi to hiMidi.
   * Returns { whiteKeys: [], blackKeys: [], totalWidth: number }.
   */
  _layout() {
    const whiteKeys = [];
    const blackKeys = [];
    let whiteIdx = 0;

    for (let midi = this._loMidi; midi <= this._hiMidi; midi++) {
      const semi    = midi % 12;
      const isWhite = this._IS_WHITE[semi];

      if (isWhite) {
        whiteKeys.push({ midi, x: whiteIdx * this._P, isC: semi === 0 });
        whiteIdx++;
      } else {
        blackKeys.push({ midi, x: this._octaveWhiteStart(midi) + this._BOFF[semi] });
      }
    }

    const totalWidth = whiteIdx * this._P - this._G;
    return { whiteKeys, blackKeys, totalWidth };
  }

  /**
   * Return the x-position (px) of the C that starts midi's octave,
   * measured from loMidi (which is always a C after setRange snapping).
   */
  _octaveWhiteStart(midi) {
    const octaveC = midi - (midi % 12);
    let count = 0;
    for (let m = this._loMidi; m < octaveC; m++) {
      if (this._IS_WHITE[m % 12]) count++;
    }
    return count * this._P;
  }

  /**
   * Apply semantic RH/LH classes to key DOM elements.
   * Called after every onHighlight mutation.
   * No inline colors — all visual styling owned by theme CSS.
   */
  _refresh() {
    for (const [midi, el] of this._keyEls) {
      const entry = this._activeKeys.get(midi);
      if (entry) {
        const isRH = entry.clef === 'treble';
        el.classList.add('nk-kb-active');
        el.classList.add(isRH ? 'nk-kb-active-rh' : 'nk-kb-active-lh');
        el.classList.remove(isRH ? 'nk-kb-active-lh' : 'nk-kb-active-rh');
      } else {
        el.classList.remove('nk-kb-active', 'nk-kb-active-rh', 'nk-kb-active-lh');
      }
    }
    // Sync note-name labels with active state
    for (const [midi, lbl] of this._labelEls) {
      const entry = this._activeKeys.get(midi);
      if (entry) {
        const isRH = entry.clef === 'treble';
        lbl.classList.add('nk-kb-note-label-active');
        lbl.classList.add(isRH ? 'nk-kb-note-label-active-rh' : 'nk-kb-note-label-active-lh');
        lbl.classList.remove(isRH ? 'nk-kb-note-label-active-lh' : 'nk-kb-note-label-active-rh');
      } else {
        lbl.classList.remove('nk-kb-note-label-active', 'nk-kb-note-label-active-rh', 'nk-kb-note-label-active-lh');
      }
    }
  }

  /**
   * Brief opacity dip for keys that are re-attacked while already lit.
   * Visually communicates "key pressed again" without altering semantic timing.
   */
  _triggerReattack(midi) {
    const el = this._keyEls.get(midi);
    if (!el) return;
    // Remove then re-add to restart animation if already running
    el.classList.remove('nk-kb-reattack');
    void el.offsetWidth;  // force reflow to restart animation
    el.classList.add('nk-kb-reattack');
    el.addEventListener('animationend', () => el.classList.remove('nk-kb-reattack'), { once: true });
  }

}

// ---------------------------------------------------------------------------
// Export — browser global + Node.js CommonJS (matching learning-state.js pattern)
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KeyboardViz, _kbNoteToMidi };
} else {
  (typeof globalThis !== 'undefined' ? globalThis : window).KeyboardViz = KeyboardViz;
}
