// SongLoader — song fetch, parse, and engine initialization.
// Extracted from index.html (Session 46) to reduce God Shell complexity.
// See docs/runtime-integration-roadmap.md §4 Priority 2b.
//
// Responsibilities:
//   load(src)              — fetch JSON, init engines, update DOM meta
//   selectedPart           — tracks active part ('': full song, else part_id)
//   setSelectedPart(id)    — updates selection and syncs parts bar UI
//   resolvedSegments       — bar+beat segments converted to t_ms at load time
//
// NOT responsible for:
//   Progress/time display  — tick-driven by onTimelineUpdate in index.html
//   Learning controls UI   — _syncLearningControls() stays in index.html
//   UI state machine       — _setUIState() stays in index.html
//   Audio synthesis        — _playNote() stays in index.html (future: audio-engine.js)

'use strict';

const TEMPO_BPM = { easy: 36, grave: 45, andante: null, moderato: 100 };

class SongLoader {
  // config: {
  //   runtime, renderer, learningState, keyboardViz,
  //   elements: { scoreEl, partsBar, songTitle,
  //               metaBpm, metaTimeSig, metaKey, metaBars, metaLevel },
  //   onBeforeLoad()          — sync; reset UI state before fetch begins
  //   onSuccess(data)         — called after all engines initialised
  //   onError(err)            — called on fetch or parse failure
  //   onTempoScaleUpdate(s)   — called when selected tempo button's scale is recomputed
  // }
  constructor(config) {
    this._runtime       = config.runtime;
    this._renderer      = config.renderer;
    this._learningState = config.learningState;
    this._keyboardViz   = config.keyboardViz;
    this._el            = config.elements;
    this._onBeforeLoad       = config.onBeforeLoad       || (() => {});
    this._onSuccess          = config.onSuccess          || (() => {});
    this._onError            = config.onError            || (() => {});
    this._onTempoScaleUpdate = config.onTempoScaleUpdate || (() => {});
    this._getRenderOpts      = config.getRenderOpts      || (() => ({}));
    this._selectedPart       = '';
    this._resolvedSegments   = [];
  }

  get selectedPart()     { return this._selectedPart; }
  get resolvedSegments() { return this._resolvedSegments; }

  setSelectedPart(partId) {
    this._selectedPart = partId;
    this._syncPartsBar();
  }

  load(src) {
    this._runtime.stop();
    this._renderer.clearAll();
    this._keyboardViz.clear();
    this._onBeforeLoad();

    this._el.scoreEl.innerHTML     = '<div class="score-loading">Loading notation…</div>';
    this._el.songTitle.textContent = 'Loading…';

    fetch(src)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(data => {
        this._runtime.load(data);
        this._renderer.render(data, this._el.scoreEl, this._getRenderOpts());

        const m = data.meta;
        this._el.songTitle.textContent   = m.title;
        this._el.metaBpm.textContent     = m.bpm + ' BPM';
        this._el.metaTimeSig.textContent = m.time_signature.join('/');
        this._el.metaKey.textContent     = 'key ' + m.key_signature;
        this._el.metaBars.textContent    = data.score.bars.length + ' bars';
        this._el.metaLevel.textContent   = m.level || '';

        this._updateTempoButtons(m.bpm);
        this._learningState.loadFromMeta(m);
        this._keyboardViz.setRangeFromSong(data);

        this._rebuildPartsBar(data.parts || []);
        this._selectedPart = '';
        this._syncPartsBar();

        this._resolvedSegments = this._resolveSegments(data);

        this._onSuccess(data);
      })
      .catch(err => {
        this._el.scoreEl.innerHTML     = '<div class="score-loading">Error: ' + err.message + '</div>';
        this._el.songTitle.textContent = 'Error';
        this._onError(err);
      });
  }

  // ---------- private ----------

  _updateTempoButtons(nativeBPM) {
    document.querySelectorAll('.tempo-btn').forEach(btn => {
      const key    = btn.dataset.tempoKey;
      const target = TEMPO_BPM[key] ?? nativeBPM;  // andante = native BPM
      const scale  = target / nativeBPM;
      btn.dataset.scale = scale.toFixed(4);

      const bpmLabel = key === 'andante'
        ? `(${nativeBPM} BPM)`
        : `(${Math.round(target)} BPM)`;
      btn.title = bpmLabel;

      if (btn.classList.contains('selected')) {
        this._onTempoScaleUpdate(scale);
      }
    });
  }

  _rebuildPartsBar(parts) {
    if (!this._el.partsBar) return;
    this._el.partsBar.innerHTML = '';

    const allBtn        = document.createElement('button');
    allBtn.className    = 'part-btn selected';
    allBtn.dataset.part = '';
    allBtn.textContent  = 'All Sections';
    this._el.partsBar.appendChild(allBtn);

    parts.forEach(p => {
      const btn        = document.createElement('button');
      btn.className    = 'part-btn';
      btn.dataset.part = p.part_id;
      btn.textContent  = `${p.label || p.part_id} (${p.bars[0]}–${p.bars[p.bars.length - 1]})`;
      if (p.has_pickup) btn.title = 'Includes pickup';
      this._el.partsBar.appendChild(btn);
    });
  }

  _syncPartsBar() {
    if (!this._el.partsBar) return;
    this._el.partsBar.querySelectorAll('.part-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.part === this._selectedPart);
    });
  }

  // Resolve learning_segments bar+beat values to t_ms using loaded score timestamps.
  // Returns [] if song has no learning_segments field.
  // See docs/learning-segment-architecture.md §4.2 for the design rationale.
  _resolveSegments(data) {
    if (!data.learning_segments || !data.learning_segments.length) return [];

    return data.learning_segments
      .map(seg => {
        const endBeat = seg.end_beat ?? 1;
        return {
          id:         seg.segment_id,
          label:      seg.label,
          start_bar:  seg.start_bar,   // preserved for renderer.scrollToBar()
          start_beat: seg.start_beat ?? 1,
          end_bar:    seg.end_bar,
          end_beat:   endBeat,
          start_ms:   this._resolveSegmentMs(data, seg.start_bar, seg.start_beat),
          end_ms:     this._resolveSegmentMs(data, seg.end_bar, endBeat, true),
          bars:       this._computeSegmentBars(data, seg.start_bar, seg.end_bar, endBeat),
          repeat:     seg.suggested_repeats || 1,
          order:      seg.order != null ? seg.order : 999,
        };
      })
      .filter(s => s.start_ms !== null)  // null end_ms → play to song end (Infinity in runtime)
      .sort((a, b) => a.order - b.order);
  }

  // Returns bar numbers that belong to this segment.
  // When endBeat == 1: endBar is exclusive (whole-bar convention — endBar not included).
  // When endBeat > 1:  endBar is inclusive (mid-bar end — segment plays through endBeat).
  _computeSegmentBars(data, startBar, endBar, endBeat = 1) {
    const maxBar = endBeat > 1 ? endBar : endBar - 1;
    return data.score.bars
      .filter(b => b.bar >= startBar && b.bar <= maxBar)
      .map(b => b.bar);
  }

  // Returns t_ms boundary for a segment edge at (bar, beat).
  // forEnd=false (start): returns t_ms of first event at or after beat.
  // forEnd=true  (end):   when beat>1, returns t_ms + duration_ms so the runtime
  //   condition (event.t_ms < scopeEnd) includes that beat's full duration.
  //   When beat==1, returns t_ms unchanged (preserves whole-bar exclusive convention).
  // Returns null when the bar does not exist (caller treats null end_ms as Infinity).
  _resolveSegmentMs(data, bar, beat, forEnd = false) {
    for (const b of data.score.bars) {
      if (b.bar !== bar) continue;
      const evs = b.beats || b.events || [];
      for (const ev of evs) {
        if (ev.beat >= beat) {
          if (forEnd && beat > 1) return (ev.t_ms ?? 0) + (ev.duration_ms ?? 0);
          return ev.t_ms;
        }
      }
      const first = evs[0];
      if (!first) return null;
      return (forEnd && beat > 1)
        ? ((first.t_ms ?? 0) + (first.duration_ms ?? 0))
        : (first.t_ms ?? null);
    }
    return null;
  }
}

if (typeof module !== 'undefined') module.exports = { SongLoader, TEMPO_BPM };
