/**
 * notation-renderer.js — MyKey Music Labs / ariyadigital
 * Layer 2: Visual Notation (SPEC §3.4)
 *
 * Renders song.json notation via VexFlow SVG.
 * OWNS    : SVG element mapping, highlight state
 * DOES NOT OWN: timeline, currentTime, scoring, audio, gameplay
 *
 * Requires: VexFlow 5.0.0 CJS/UMD bundle loaded as window.VexFlow before render(),
 *   bridged via: window.Vex = { Flow: window.VexFlow }
 *
 * Public API:
 *   render(songData, containerEl, opts)  — draw score into containerEl
 *     opts.visibleBars:  number[] — render only these bar numbers (absent = all bars)
 *     opts.visibleClefs: string[] — e.g. ['treble'], ['bass'] (absent = both clefs)
 *     Backwards compatible: render(data, el) with no opts = full score, both clefs.
 *   highlight(eventId, style)           — style: 'active'|'explore'|'question'
 *   clearHighlight(eventId)             — remove highlight from one event
 *   clearAll()                          — remove all highlights (call on stop())
 *   dimEvent(eventId)                   — dim one event (out-of-scope beat indicator)
 *   clearDim()                          — remove all dim overlays
 *   scrollToBar(barN)                   — smooth-scroll bar N into view
 *
 * Semantic authority: all engraving decisions derive from song.json (SPEC §4).
 * This renderer does not own timing, pitch truth, or playback state.
 * See docs/music-notation-semantics.md for layer authority definitions.
 */

class NotationRenderer {

  constructor() {
    this._noteElMap  = new Map();  // eventId → SVG <g> element
    this._barElMap   = new Map();  // barN    → SVG element (for scrollToBar)
    this._noteObjMap = new Map();  // eventId → { note, stave }  — for tie rendering
    this._container  = null;
    this._song       = null;
    this._canvasW    = 960;
  }

  get canvasWidth()  { return this._canvasW; }
  get rowHeight()    { return this._rowH ?? 280; }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  render(songData, containerEl, opts = {}) {
    // opts.visibleBars:  number[] | null/undefined — bar numbers to render. Absent/null = all bars.
    // opts.visibleClefs: string[] | null/undefined — e.g. ['treble'] or ['bass']. Absent/null = both clefs.
    // Backwards compatible: render(data, el) with no opts renders full score identically to before.
    if (typeof Vex === 'undefined') {
      throw new Error('NotationRenderer: VexFlow (Vex) must be loaded before render()');
    }
    this._song        = songData;
    this._container   = containerEl;
    this._renderOpts  = opts;
    this._noteElMap.clear();
    this._barElMap.clear();
    this._noteObjMap.clear();
    containerEl.innerHTML = '';
    this._drawScore();
    return this;
  }

  /** style: 'active' | 'active-rest' | 'note-active-rh' | 'note-active-lh' | 'explore' | 'question' */
  highlight(eventId, style = 'active') {
    const el = this._noteElMap.get(eventId);
    if (!el) return;
    el.classList.remove(
      'nk-active', 'nk-active-rest', 'nk-note-active-rh', 'nk-note-active-lh',
      'nk-explore', 'nk-question'
    );
    el.classList.add('nk-' + style);
  }

  clearHighlight(eventId) {
    const el = this._noteElMap.get(eventId);
    if (el) el.classList.remove(
      'nk-active', 'nk-active-rest', 'nk-note-active-rh', 'nk-note-active-lh',
      'nk-explore', 'nk-question'
    );
  }

  /** Remove all highlights. Must be called on stop() because RuntimeEngine
   *  does not fire onEventExit on stop() — per runtime-contract.md §4. */
  clearAll() {
    for (const el of this._noteElMap.values()) {
      el.classList.remove(
        'nk-active', 'nk-active-rest', 'nk-note-active-rh', 'nk-note-active-lh',
        'nk-explore', 'nk-question'
      );
    }
  }

  /** Dim one event — used for beat-boundary out-of-scope notes (presentation only). */
  dimEvent(eventId) {
    const el = this._noteElMap.get(eventId);
    if (el) el.classList.add('nk-dim');
  }

  /** Remove all dim overlays. Dim state is also cleared on the next render() call. */
  clearDim() {
    for (const el of this._noteElMap.values()) {
      el.classList.remove('nk-dim');
    }
  }

  /** Mark a note as a loop boundary. role: 'start' | 'end'. */
  markLoopBoundary(eventId, role) {
    const el = this._noteElMap.get(eventId);
    if (!el) return;
    el.classList.remove('nk-loop-start', 'nk-loop-end');
    el.classList.add('nk-loop-' + role);
  }

  /** Remove all loop boundary marks. */
  clearLoopMarks() {
    for (const el of this._noteElMap.values()) {
      el.classList.remove('nk-loop-start', 'nk-loop-end');
    }
  }

  scrollToBar(barN) {
    const el = this._barElMap.get(barN);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------------------------------------------------------------------------
  // Score layout
  // ---------------------------------------------------------------------------

  _drawScore() {
    const VF   = Vex.Flow;
    const meta = this._song.meta;
    const [numBeats, beatValue] = meta.time_signature;

    // Apply bar filter from opts
    const visibleBarsSet = this._renderOpts?.visibleBars?.length
      ? new Set(this._renderOpts.visibleBars)
      : null;
    const bars = visibleBarsSet
      ? this._song.score.bars.filter(b => visibleBarsSet.has(b.bar))
      : this._song.score.bars;

    // Apply clef filter from opts
    const visibleClefs = this._renderOpts?.visibleClefs || ['treble', 'bass'];
    const showTreble = visibleClefs.includes('treble');
    const showBass   = visibleClefs.includes('bass');
    const showBoth   = showTreble && showBass;

    // Layout constants
    const barsPerRowOpt = this._renderOpts?.barsPerRow;
    const BARS_PER_ROW  = barsPerRowOpt === 'all' ? Math.max(1, bars.length) : (typeof barsPerRowOpt === 'number' ? barsPerRowOpt : 4);
    const CANVAS_W      = barsPerRowOpt === 'all' ? Math.max(960, bars.length * 240) : 960;
    const MARGIN_X     = 20;   // 20px left margin — brace extends ~16px left of stave x; 10px was insufficient
    const TREBLE_Y_OFF = 20;                        // treble stave always at y+20 from row top
    const BASS_Y_OFF   = showBoth ? 135 : 20;       // bass at y+135 (grand staff) OR y+20 (solo)
    // 2-bar only: pick row height from 3 density levels using max _barNoteWeight.
    // All values reduced ~20% from initial experiment for tighter vertical rhythm.
    const _2barMaxW = barsPerRowOpt === 2 ? Math.max(...bars.map(_barNoteWeight)) : 0;
    const ROW_H     = barsPerRowOpt === 2
      ? (_2barMaxW > 7.0 ? (showBoth ? 355 : 155)   // high density
       : _2barMaxW > 4.5 ? (showBoth ? 275 : 120)   // medium density
       :                   (showBoth ? 240 : 105))   // low density
      : (showBoth ? 225 : 100);                      // 4-bar / landscape
    this._rowH = ROW_H;  // expose to _drawSlurs — single-clef uses 120, grand staff uses 280

    // Optical scale experiment: thinner staff lines so note heads feel more dominant.
    // Passed as 4th arg to every Stave constructor. Silently no-op if VF5 ignores width.
    const STAVE_OPTS = { line_config: Array(5).fill({ visible: true, width: 0.9 }) };

    const rowLayout        = _computeRowLayout(bars, BARS_PER_ROW);  // filtered bars
    const numRows          = rowLayout.length;
    const globalAvg        = _globalAvgBarW(bars);  // filtered bars — score-wide anchor
    const totalH           = numRows * ROW_H + 20;
    const lastBarGlobalIdx = bars.length - 1;       // uses filtered bars, not this._song.score.bars

    const vfRenderer = new VF.Renderer(this._container, VF.Renderer.Backends.SVG);
    vfRenderer.resize(CANVAS_W, totalH);
    this._canvasW = CANVAS_W;
    const ctx = vfRenderer.getContext();

    let barGlobalIdx = 0;
    this._rowBounds     = new Map();  // row index → { leftNoteX, rightX } — used by _drawSlurs
    this._rowFirstStave = new Map();  // row index → { treble, bass }  — used by _drawOttava

    for (let row = 0; row < numRows; row++) {
      const rowBars = rowLayout[row];
      const rowY    = row * ROW_H;

      const barWidths = _computeRowWidths(rowBars, meta, CANVAS_W, MARGIN_X, BARS_PER_ROW, globalAvg);

      // Pass 1 — create and draw staves
      const staveInfos = [];
      let x = MARGIN_X;

      for (let i = 0; i < rowBars.length; i++) {
        const barData    = rowBars[i];
        const isFirstBar = i === 0;
        const isLastBar  = (barGlobalIdx + i) === lastBarGlobalIdx;
        const barW       = barWidths[i];
        const endType    = VF.Barline && VF.Barline.type ? VF.Barline.type.END : 3;

        let treble = null;
        let bass   = null;

        if (showTreble) {
          treble = new VF.Stave(x, rowY + TREBLE_Y_OFF, barW, STAVE_OPTS);
          if (isFirstBar) {
            treble.addClef('treble').addKeySignature(meta.key_signature)
                  .addTimeSignature(`${numBeats}/${beatValue}`);
          }
          if (barData.repeat_end && VF.Barline && VF.Barline.type) {
            treble.setEndBarType(VF.Barline.type.REPEAT_END);
          } else if (isLastBar) {
            treble.setEndBarType(endType);
          }
          if (barData.repeat_start && VF.Barline && VF.Barline.type) {
            treble.setBegBarType(VF.Barline.type.REPEAT_BEGIN);
          }
          if (barData.volta != null && VF.Volta) {
            const voltaType  = _getVoltaType(rowBars, i, VF);
            const voltaLabel = String(Array.isArray(barData.volta) ? barData.volta[0] : barData.volta) + '.';
            treble.addModifier(new VF.Volta(voltaType, voltaLabel, x, 0));
          }
          // Navigation symbols: modifiers must be added before draw().
          // Segno is excluded here — it is drawn post-stave via _drawSegno().
          _addNavModifiers(treble, barData, VF);
          treble.setContext(ctx).draw();
          // Segno drawn post-draw: VF.Repetition.SEGNO_LEFT uses ctx.fillText() with a
          // PUA codepoint that requires @font-face, which VexFlow SVG backend does not
          // inject. Use VF.Glyph path rendering instead.
          if (barData.segno) _drawSegno(ctx, treble, VF);
          if (barData.bar !== 1) _drawBarNumber(ctx, barData.bar, treble);
        }

        if (showBass) {
          const bassY = rowY + BASS_Y_OFF;
          bass = new VF.Stave(x, bassY, barW, STAVE_OPTS);
          if (isFirstBar) {
            bass.addClef('bass').addKeySignature(meta.key_signature)
                .addTimeSignature(`${numBeats}/${beatValue}`);
          }
          if (barData.repeat_end && VF.Barline && VF.Barline.type) {
            bass.setEndBarType(VF.Barline.type.REPEAT_END);
          } else if (isLastBar) {
            bass.setEndBarType(endType);
          }
          if (barData.repeat_start && VF.Barline && VF.Barline.type) {
            bass.setBegBarType(VF.Barline.type.REPEAT_BEGIN);
          }
          bass.setContext(ctx).draw();
          if (!showTreble && barData.bar !== 1) _drawBarNumber(ctx, barData.bar, bass);
        }

        // Layer3-dynamics: static markings rendered after stave.draw().
        // Grand-staff: placed in the gap between treble and bass staves.
        // Bass-only fallback: placed below the bass stave (treble is null).
        // Hairpins (crescendo/decrescendo) deferred — see semantics §10.4.
        if (showBass && bass && barData.dynamics) {
          _drawDynamic(ctx, barData.dynamics, bass, treble);
        }

        // Grand-staff connectors at leftmost bar of each row — only when both clefs shown
        if (isFirstBar && showBoth) {
          new VF.StaveConnector(treble, bass)
            .setType(VF.StaveConnector.type.BRACE)
            .setContext(ctx).draw();
          new VF.StaveConnector(treble, bass)
            .setType(VF.StaveConnector.type.SINGLE_LEFT)
            .setContext(ctx).draw();
        }

        staveInfos.push({ treble, bass, barData, barW });
        x += barW;
      }

      // Record row boundary coordinates for cross-row slur / ottava rendering.
      if (staveInfos.length > 0) {
        const firstStave = staveInfos[0].treble || staveInfos[0].bass;
        this._rowBounds.set(row, {
          leftNoteX: firstStave ? firstStave.getNoteStartX() : MARGIN_X,
          rightX: x,
        });
        this._rowFirstStave.set(row, { treble: staveInfos[0].treble, bass: staveInfos[0].bass });
      }

      // System-end connector: single barline spanning treble-to-bass at row right edge.
      // Non-final rows only — final row uses setEndBarType() double barline instead.
      if (showBoth && row < numRows - 1) {
        const last = staveInfos[staveInfos.length - 1];
        if (last.treble && last.bass) {
          new VF.StaveConnector(last.treble, last.bass)
            .setType(VF.StaveConnector.type.SINGLE_RIGHT)
            .setContext(ctx).draw();
        }
      }

      // Pass 2 — draw notes into staves
      for (const info of staveInfos) {
        this._drawBarNotes(ctx, VF, info, numBeats, beatValue, meta.bpm);
      }

      barGlobalIdx += rowBars.length;
    }

    // INVARIANT: ties and slurs are pure visual overlays drawn after the full layout pass.
    // All note x/y positions must be committed by Voice.draw() before either runs.
    // Neither has any effect on note spacing, stem direction, or bar layout geometry.
    // Slur infrastructure is entirely separate from ties — see Semantic Invariant I11.
    this._drawTies(ctx, VF);
    this._drawSlurs(ctx, VF);
    this._drawOttava(ctx, VF);
  }

  _drawBarNotes(ctx, VF, { treble, bass, barData, barW }, numBeats, beatValue, bpm) {
    const beats = barData.beats || [];

    const showTreble   = treble !== null;
    const showBass     = bass !== null;
    const showBoth     = showTreble && showBass;
    const primaryStave = treble ?? bass;  // for noteAreaW calculation
    if (!primaryStave) return;  // guard: empty visibleClefs — nothing to draw

    // Note building — only for visible clefs
    const keySig      = this._song.meta.key_signature;
    const trebleItems = showTreble
      ? this._buildNotes(VF, beats.filter(e => e.clef === 'treble'), 'treble', keySig)
      : [];
    const bassItems = showBass
      ? this._buildNotes(VF, beats.filter(e => e.clef === 'bass'), 'bass', keySig)
      : [];

    // Fallback whole rest when a visible clef has no events in this bar
    const tTickables = showTreble
      ? (trebleItems.length ? trebleItems.map(i => i.note) : [_wholeRest(VF, 'treble')])
      : [];
    const bTickables = showBass
      ? (bassItems.length ? bassItems.map(i => i.note) : [_wholeRest(VF, 'bass')])
      : [];

    // Optical pickup alignment: prepend GhostNotes for missing leading beats so
    // VexFlow places pickup content at its correct temporal position within the bar
    // (e.g. a single beat-4 quarter sits 3/4 across the stave, not at the left edge).
    // Generic — triggers for any incomplete bar, no bar-index or song-specific logic.
    const fullBarQL = numBeats * 4 / beatValue;
    const tUsedQL   = showTreble ? (trebleItems.length ? _sumBarQL(beats.filter(e => e.clef === 'treble')) : fullBarQL) : fullBarQL;
    const bUsedQL   = showBass   ? (bassItems.length   ? _sumBarQL(beats.filter(e => e.clef === 'bass'))   : fullBarQL) : fullBarQL;
    const tMissQL   = showTreble ? Math.round((fullBarQL - tUsedQL) * 1000) / 1000 : 0;
    const bMissQL   = showBass   ? Math.round((fullBarQL - bUsedQL) * 1000) / 1000 : 0;
    const tGhosts   = (showTreble && tMissQL > 0.1) ? _qlToDurations(tMissQL).map(d => new VF.GhostNote({ duration: d })) : [];
    const bGhosts   = (showBass   && bMissQL > 0.1) ? _qlToDurations(bMissQL).map(d => new VF.GhostNote({ duration: d })) : [];

    // Voice creation — only for visible clefs
    const tv = showTreble ? new VF.Voice({ num_beats: numBeats, beat_value: beatValue }).setStrict(false) : null;
    const bv = showBass   ? new VF.Voice({ num_beats: numBeats, beat_value: beatValue }).setStrict(false) : null;
    if (tv) tv.addTickables([...tGhosts, ...tTickables]);
    if (bv) bv.addTickables([...bGhosts, ...bTickables]);

    // Shared rhythmic grid: both voices formatted together — beat positions align across staves.
    // Note area derived from stave geometry: excludes clef/key/time overhead automatically.
    const noteAreaW = Math.max(50,
      primaryStave.getWidth() - (primaryStave.getNoteStartX() - primaryStave.getX()) - 12
    );
    // Reserve optical margin before the barline — 15% for tuplet bars (tick inflation
    // from nominal durations can crowd the right edge), 10% for normal bars.
    const hasTuplets = trebleItems.some(it => it.tupletGroup) || bassItems.some(it => it.tupletGroup);
    const formatW = noteAreaW * (hasTuplets ? 0.85 : 0.90);

    // Formatter — conditional on what voices exist
    if (showBoth && tv && bv) {
      try {
        new VF.Formatter().joinVoices([tv]).joinVoices([bv]).format([tv, bv], formatW);
      } catch (_) {
        try { new VF.Formatter().joinVoices([tv]).format([tv], formatW); } catch (_) {}
        try { new VF.Formatter().joinVoices([bv]).format([bv], formatW); } catch (_) {}
      }
    } else if (tv) {
      try { new VF.Formatter().joinVoices([tv]).format([tv], formatW); } catch (_) {}
    } else if (bv) {
      try { new VF.Formatter().joinVoices([bv]).format([bv], formatW); } catch (_) {}
    }

    // INVARIANT: VexFlow Formatter.format() auto-computes and overwrites stem directions
    // during layout, discarding whatever was passed to the StaveNote constructor.
    // setStemDirection() called post-format bypasses this recomputation and sticks.
    // This loop runs before _beatGroupedBeams so that beam groups can override individual
    // per-note directions with a unified groupDir without fighting the formatter again.
    for (const it of trebleItems) {
      if (!it.note.isRest()) it.note.setStemDirection(it.step < _TREBLE_MID ? 1 : -1);
    }
    for (const it of bassItems) {
      if (!it.note.isRest()) it.note.setStemDirection(it.step < _BASS_MID ? 1 : -1);
    }

    // INVARIANT: beam objects must be created BEFORE Voice.draw().
    // VF.Beam.generateBeams() sets note.beam on each note in the group, which causes
    // StaveNote.draw() to suppress the individual flag. If beams are created after
    // voices are drawn, flags render first and appear as double-flags behind the beam line.
    const trebleBeats = showTreble ? beats.filter(e => e.clef === 'treble') : [];
    const bassBeats   = showBass   ? beats.filter(e => e.clef === 'bass')   : [];
    const tBeams = showTreble ? _beatGroupedBeams(VF, trebleItems, trebleBeats, numBeats, beatValue, 'treble') : [];
    const bBeams = showBass   ? _beatGroupedBeams(VF, bassItems,   bassBeats,   numBeats, beatValue, 'bass')   : [];

    // Voice drawing — guard with null checks
    if (tv && treble) tv.draw(ctx, treble);
    if (bv && bass)   bv.draw(ctx, bass);

    // Draw beam lines after voices so beam pixel positions (set during note draw) are ready.
    [...tBeams, ...bBeams].forEach(b => b.setContext(ctx).draw());

    // Draw tuplet brackets after beams — note positions and stem directions are finalized.
    if (VF.Tuplet) {
      const tTuplets = showTreble ? _collectTuplets(VF, trebleItems) : [];
      const bTuplets = showBass   ? _collectTuplets(VF, bassItems)   : [];
      [...tTuplets, ...bTuplets].forEach(t => { try { t.setContext(ctx).draw(); } catch (_) {} });
    }

    // Map event IDs → SVG elements.
    // VexFlow 5.x: note.attrs has no .el — use getSVGElement() (DOM lookup by prefixed ID).
    // trebleItems/bassItems are already empty for non-visible clefs — loop handles null cases.
    for (const { note, eventId } of [...trebleItems, ...bassItems]) {
      if (eventId) {
        const el = note.getSVGElement();
        if (el) {
          this._noteElMap.set(eventId, el);
          el.dataset.eventId = eventId;  // stable identity for click-to-event resolution
        }
      }
    }

    // Store note objects (with stave reference) for post-render tie drawing.
    for (const { note, eventId } of trebleItems) {
      if (eventId) this._noteObjMap.set(eventId, { note, stave: treble });
    }
    for (const { note, eventId } of bassItems) {
      if (eventId) this._noteObjMap.set(eventId, { note, stave: bass });
    }

    // Tag first note's element with bar number for scrollToBar()
    const firstEl = trebleItems[0] || bassItems[0];  // works correctly for both single-clef and both-clef
    if (firstEl) {
      const el = firstEl.note.getSVGElement();
      if (el) {
        el.dataset.bar = barData.bar;
        this._barElMap.set(barData.bar, el);
      }
    }
  }

  _buildNotes(VF, events, clef, keySig) {
    const middle   = clef === 'treble' ? _TREBLE_MID : _BASS_MID;
    const accState = _initAccState(keySig);

    return events.map(ev => {
      const { base, dots } = _parseDur(ev.duration);
      // written_notes: staff placement pitch (what's written). Falls back to notes (sounding) for
      // non-ottava events so existing songs without written_notes are unchanged.
      const displayNotes = ev.type !== 'rest' ? (ev.written_notes || ev.notes || []) : [];

      let keys, duration;
      if (ev.type === 'rest') {
        keys     = [clef === 'treble' ? 'b/4' : 'd/3'];
        duration = base + 'r';
      } else {
        keys     = displayNotes.map(_toVFKey);
        if (!keys.length) keys = [clef === 'treble' ? 'b/4' : 'd/3'];
        duration = base;
      }

      // Standard stem direction: below middle line → up (1), on/above → down (-1).
      // For chords: the note most removed from the middle line determines direction (Gould §4).
      // step stored on the item so beam groups can compute a unified direction.
      const step    = ev.type !== 'rest' && displayNotes.length ? _furthestStepFrom(displayNotes, middle) : middle;
      const stemDir = step < middle ? 1 : -1;
      const note    = new VF.StaveNote({ clef, keys, duration, dots, stem_direction: stemDir });

      // VF5.0.0: the dots constructor param sets tick duration only — it does NOT
      // auto-attach Dot modifier objects. Each key needs an explicit Dot for the glyph.
      if (dots > 0) {
        for (let i = 0; i < keys.length; i++) {
          note.addModifier(new VF.Dot(), i);
        }
      }

      // Accidental carry rules (§2.10 in engraving-standards.md):
      // Key-signature default → suppressed. Repeated same state → suppressed.
      // Deviation from current state → show accidental. Return to natural → 'n'.
      if (ev.type !== 'rest' && displayNotes.length) {
        displayNotes.forEach((n, idx) => {
          const acc = _resolveAccidental(n, accState);
          if (acc !== null) note.addModifier(new VF.Accidental(acc), idx);
          _updateAccState(accState, n);
        });
      }

      // Staccato dot: explicit opposite-stem placement.
      // VexFlow 5.0.0 'a.' defaults to ABOVE and does not auto-flip by stem direction.
      // Without setPosition(), stem-up notes receive a dot above the stem tip — far from
      // the notehead and visually incorrect. Explicit position pins the dot to the
      // notehead side (engraving standard: opposite stem, close to notehead).
      //
      // ModifierPosition: ABOVE = 3, BELOW = 4.
      // stemDir  1 (up)   → BELOW (4): dot sits below the notehead.
      // stemDir -1 (down) → ABOVE (3): dot sits above the notehead.
      //
      // stemDir is computed from the furthest-note rule above — same formula the
      // post-format setStemDirection() loop uses, so position matches final stem dir
      // for non-beamed notes. Beamed staccato is rare; group dir usually agrees.
      // Chord staccato: one modifier at index 0, not per-notehead.
      if (ev.type !== 'rest' && ev.articulations?.includes('staccato')) {
        const art = new VF.Articulation('a.');
        art.setPosition(stemDir === 1 ? 4 : 3);
        note.addModifier(art, 0);
      }
      if (ev.type !== 'rest' && ev.articulations?.includes('accent')) {
        const art = new VF.Articulation('a>');
        art.setPosition(stemDir === 1 ? 4 : 3);
        note.addModifier(art, 0);
      }
      // TODO(Layer3-articulations): tenuto, marcato attach the same way with different glyphs.
      // Fermata requires runtime-engine.js extension (timeline pause) — implement last.
      // TODO(Layer3-slur): slur rendering uses SEPARATE infrastructure from ties.
      // Do NOT reuse _drawStaveTies or _noteHeadProxy for slurs.
      // Slur requires custom SVG Bezier path pass after all voices are drawn.
      // See docs/engraving-standards.md §4.7 and docs/music-notation-semantics.md §10.2.

      return { note, eventId: ev.id, dur: base, step, tupletGroup: ev.tuplet_group || null };
    });
  }

  // ---------------------------------------------------------------------------
  // Tie rendering
  // ---------------------------------------------------------------------------

  _drawTies(ctx, VF) {
    const ROW_H = 280;  // must match _drawScore layout constant
    const visibleBarsSet = this._renderOpts?.visibleBars?.length
      ? new Set(this._renderOpts.visibleBars)
      : null;
    const bars = visibleBarsSet
      ? this._song.score.bars.filter(b => visibleBarsSet.has(b.bar))
      : this._song.score.bars;

    // INVARIANT: never call note.setStave() or note.setYs() in this method.
    // Mutating shared note geometry after draw corrupts ALL tie positions on the page,
    // not just the one being fixed. Use _noteHeadProxy for chord noteheads at index > 0.
    // It reads NoteHead.getY() without touching the note's internal ys array.

    // pending: "clef:sortedPitchKey" → { note, stave, srcNotes }
    // Keyed by sorted pitch string so chord [E4,C4] and [C4,E4] both resolve to same slot.
    const pending = new Map();

    for (const bar of bars) {
      for (const ev of (bar.beats || [])) {
        const clef = ev.clef;
        if (!clef) continue;

        const isNote = ev.type !== 'rest' && ev.notes?.length;

        if (!isNote) {
          // A rest in this clef breaks direct rhythmic sustain — any pending tie
          // for this clef can no longer be a true continuation. Silently discard;
          // no arc is drawn (drawing would produce a note→rest arc, which is invalid).
          for (const [pKey] of [...pending.entries()]) {
            if (pKey.startsWith(clef + ':')) pending.delete(pKey);
          }
          continue;
        }

        const key = `${clef}:${[...ev.notes].sort().join(',')}`;

        // Step 1: Process tie_stop — consume matching pending and draw arc.
        if (ev.tie_stop) {
          const src = pending.get(key);
          if (src) {
            const dst = this._noteObjMap.get(ev.id);
            if (dst) {
              _drawStaveTies(ctx, VF, src.note, src.stave, src.srcNotes,
                                      dst.note, dst.stave, ev.notes, ROW_H);
            }
            pending.delete(key);
          }
        }

        // Step 2: Adjacency enforcement — any remaining pending for this clef
        // was not the pitch just consumed in step 1, meaning a different note
        // attacked in the same voice and broke the sustain. Silently discard;
        // do not draw an arc (that would be a slur-like phrase arc, not a tie).
        for (const [pKey] of [...pending.entries()]) {
          if (pKey.startsWith(clef + ':')) pending.delete(pKey);
        }

        // Step 3: Store tie_start for matching with the immediately next event.
        if (ev.tie_start) {
          const obj = this._noteObjMap.get(ev.id);
          if (obj) {
            pending.set(key, { note: obj.note, stave: obj.stave, srcNotes: ev.notes });
          }
        }
      }
    }
    // Remaining pending = orphaned tie_starts (malformed song data). Silently discard.
  }

  // ---------------------------------------------------------------------------
  // Slur rendering
  // ---------------------------------------------------------------------------

  _drawSlurs(ctx, VF) {  // VF accepted for API consistency; not currently used
    const ROW_H    = this._rowH ?? 280;  // 280 grand staff, 120 single-clef
    const ANCHOR_Y = 3;     // px offset toward the curve from notehead center
    const visibleBarsSet = this._renderOpts?.visibleBars?.length
      ? new Set(this._renderOpts.visibleBars)
      : null;
    const bars = visibleBarsSet
      ? this._song.score.bars.filter(b => visibleBarsSet.has(b.bar))
      : this._song.score.bars;

    // Walk events in bar order, pairing slur_start → slur_stop within each clef.
    // Single row break (dstRow === srcRow + 1): two half-arcs at the row boundary.
    // Multi-row slurs (dstRow > srcRow + 1): silently discarded.
    // Overlapping starts: last slur_start wins.
    // Orphaned starts (no matching stop): silently discarded.
    const pending = new Map();  // clef → { note, stave }

    for (const bar of bars) {
      for (const ev of (bar.beats || [])) {
        if (!ev.clef || ev.type === 'rest') continue;

        // slur_stop processed before slur_start: a note can end one slur and
        // immediately start another (portato grouping edge case).
        if (ev.slur_stop) {
          const src = pending.get(ev.clef);
          pending.delete(ev.clef);
          if (src) {
            const dst = this._noteObjMap.get(ev.id);
            if (dst) {
              const srcRow = Math.floor(src.stave.getY() / ROW_H);
              const dstRow = Math.floor(dst.stave.getY() / ROW_H);
              const sNote  = src.note;
              const dNote  = dst.note;
              // dir +1 = arc bows below noteheads (stem-up); -1 = above (stem-down).
              const dir    = sNote.getStemDirection() === 1 ? 1 : -1;
              const sYs    = sNote.getYs();
              const dYs    = dNote.getYs();
              if (sYs?.length && dYs?.length) {
                if (srcRow === dstRow) {
                  _drawSlurPath(ctx,
                    sNote.getTieRightX(), sYs[0] + dir * ANCHOR_Y,
                    dNote.getTieLeftX(),  dYs[0] + dir * ANCHOR_Y,
                    dir
                  );
                } else if (dstRow === srcRow + 1 && this._rowBounds) {
                  // Single row break: tail arc on source row, head arc on dest row.
                  const srcBounds = this._rowBounds.get(srcRow);
                  const dstBounds = this._rowBounds.get(dstRow);
                  const sY = sYs[0] + dir * ANCHOR_Y;
                  const dY = dYs[0] + dir * ANCHOR_Y;
                  if (srcBounds) _drawSlurPath(ctx, sNote.getTieRightX(), sY, srcBounds.rightX, sY, dir);
                  if (dstBounds) _drawSlurPath(ctx, dstBounds.leftNoteX,  dY, dNote.getTieLeftX(), dY, dir);
                }
              }
            }
          }
        }

        if (ev.slur_start) {
          const obj = this._noteObjMap.get(ev.id);
          if (obj) pending.set(ev.clef, { note: obj.note, stave: obj.stave });
        }
      }
    }
    // Remaining pending = orphaned slur_starts (no matching stop). Silently discard.
  }

  // ---------------------------------------------------------------------------
  // Ottava bracket rendering
  // ---------------------------------------------------------------------------

  _drawOttava(ctx, VF) {
    if (!VF.TextBracket) return;
    const ROW_H = this._rowH ?? 280;
    const visibleBarsSet = this._renderOpts?.visibleBars?.length
      ? new Set(this._renderOpts.visibleBars)
      : null;
    const bars = visibleBarsSet
      ? this._song.score.bars.filter(b => visibleBarsSet.has(b.bar))
      : this._song.score.bars;

    // Walk events to collect complete ottava spans.
    // octave_mark_stop processed before octave_mark_start so a note can end one span
    // and immediately start another without losing either.
    const pending = new Map();  // clef → { startId, type }
    const spans   = [];

    for (const bar of bars) {
      for (const ev of (bar.beats || [])) {
        if (!ev.clef) continue;
        if (ev.octave_mark_stop) {
          const src = pending.get(ev.clef);
          if (src) {
            spans.push({ startId: src.startId, stopId: ev.id, type: src.type, clef: ev.clef });
            pending.delete(ev.clef);
          }
        }
        if (ev.octave_mark_start) {
          pending.set(ev.clef, { startId: ev.id, type: ev.octave_mark_start });
        }
      }
    }
    // Remaining pending = ottava started but no stop in visible bars — silently discard.

    // TextBracket.draw() does not call applyStyle() internally, so the context color
    // from the preceding operation (ties, slurs) bleeds in. Wrap each bracket draw
    // with explicit applyStyle to guarantee black rendering regardless of prior state.
    const _drawBracket = (opts, noHook = false) => {
      try {
        const b = new VF.TextBracket(opts).setContext(ctx);
        if (noHook) b.renderOptions.showBracket = false;
        if (typeof b.applyStyle === 'function') b.applyStyle(ctx);
        b.draw();
      } catch (_) {}
    };

    for (const { startId, stopId, type, clef } of spans) {
      const srcObj = this._noteObjMap.get(startId);
      const dstObj = this._noteObjMap.get(stopId);
      if (!srcObj || !dstObj) continue;

      const srcStave = srcObj.stave;
      const dstStave = dstObj.stave;
      const srcRow   = Math.floor(srcStave.getY() / ROW_H);
      const dstRow   = Math.floor(dstStave.getY() / ROW_H);
      const position = type === '8va'
        ? VF.TextBracket.Position.TOP
        : VF.TextBracket.Position.BOTTOM;

      if (srcRow === dstRow) {
        _drawBracket({ start: srcObj.note, stop: dstObj.note, text: type, superscript: '', position });
      } else if (dstRow === srcRow + 1 && this._rowBounds && this._rowFirstStave) {
        // Single row break: tail segment on source row, head segment on dest row.
        const srcBounds     = this._rowBounds.get(srcRow);
        const dstBounds     = this._rowBounds.get(dstRow);
        const dstRowStaves  = this._rowFirstStave.get(dstRow);
        const dstFirstStave = dstRowStaves
          ? (clef === 'treble' ? dstRowStaves.treble : dstRowStaves.bass) ?? dstRowStaves.treble ?? dstRowStaves.bass
          : null;

        if (srcBounds) {
          _drawBracket(
            { start: srcObj.note, stop: _makeProxyNote(srcBounds.rightX - 8, 8, srcStave), text: type, superscript: '', position },
            true /* noHook */
          );
        }
        if (dstBounds && dstFirstStave) {
          _drawBracket({ start: _makeProxyNote(dstBounds.leftNoteX, 0, dstFirstStave), stop: dstObj.note, text: '', superscript: '', position });
        }
      }
      // dstRow > srcRow + 1: multi-row span not implemented — silently skip.
    }
  }
}

// ---------------------------------------------------------------------------
// Duration utilities
// ---------------------------------------------------------------------------

function _parseDur(d) {
  if (!d) return { base: 'q', dots: 0 };
  const dotted = d.endsWith('.');
  return { base: dotted ? d.slice(0, -1) : d, dots: dotted ? 1 : 0 };
}

/** Sum quarter-length duration of all events in one voice's beat list. */
function _sumBarQL(events) {
  const QL = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25, '32': 0.125 };
  return events.reduce((sum, ev) => {
    const { base, dots } = _parseDur(ev.duration);
    return sum + (QL[base] ?? 1) * (dots ? 1.5 : 1);
  }, 0);
}

/**
 * Decompose a quarter-length value into VexFlow duration strings (greedy, longest first).
 * Examples: 3.0 → ['h','q']   2.5 → ['h','8']   1.5 → ['q','8']
 */
function _qlToDurations(ql) {
  const TABLE = [[4,'w'], [2,'h'], [1,'q'], [0.5,'8'], [0.25,'16'], [0.125,'32']];
  const result = [];
  let rem = ql;
  for (const [val, name] of TABLE) {
    while (rem >= val - 0.01) { result.push(name); rem -= val; }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pitch and staff-step utilities
// ---------------------------------------------------------------------------

// Staff step encoding: C=0, D=1, E=2, F=3, G=4, A=5, B=6; step = letter + octave×7
const _TREBLE_MID = 34;  // B4: B=6, octave 4×7=28 → 34
const _BASS_MID   = 22;  // D3: D=1, octave 3×7=21 → 22

function _noteStepOf(name) {
  const L = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const m    = name.match(/^([A-G])/);
  const octM = name.match(/(\d+)$/);
  if (!m || !octM) return 28;  // default C4
  return (L[m[1]] ?? 0) + parseInt(octM[1], 10) * 7;
}

/**
 * Returns the step of the note most removed from the staff middle line.
 * Tie-break: when two notes are equidistant, the note above middle wins → stem down (Gould §4).
 */
function _furthestStepFrom(noteNames, middle) {
  if (!noteNames?.length) return middle;
  let best = _noteStepOf(noteNames[0]);
  for (let i = 1; i < noteNames.length; i++) {
    const s  = _noteStepOf(noteNames[i]);
    const d  = Math.abs(s    - middle);
    const bd = Math.abs(best - middle);
    if (d > bd || (d === bd && s > middle)) best = s;
  }
  return best;
}

/** "G4" → "g/4"  "F#3" → "f#/3"  "Bb5" → "bb/5" */
function _toVFKey(n) {
  const m = n.match(/^([A-G])(#{1,2}|b{1,2})?(\d+)$/);
  return m ? `${m[1].toLowerCase()}${m[2] || ''}/${m[3]}` : 'b/4';
}

// ---------------------------------------------------------------------------
// Accidental carry rules
// ---------------------------------------------------------------------------

// Per-key default accidentals. Letter keys → '#' | 'b'. Omitted = natural ('').
const _KEY_SIG_NOTES = {
  C:    {},
  G:    { F: '#' },
  D:    { F: '#', C: '#' },
  A:    { F: '#', C: '#', G: '#' },
  E:    { F: '#', C: '#', G: '#', D: '#' },
  B:    { F: '#', C: '#', G: '#', D: '#', A: '#' },
  'F#': { F: '#', C: '#', G: '#', D: '#', A: '#', E: '#' },
  'C#': { F: '#', C: '#', G: '#', D: '#', A: '#', E: '#', B: '#' },
  F:    { B: 'b' },
  Bb:   { B: 'b', E: 'b' },
  Eb:   { B: 'b', E: 'b', A: 'b' },
  Ab:   { B: 'b', E: 'b', A: 'b', D: 'b' },
  Db:   { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b' },
  Gb:   { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b', C: 'b' },
  Cb:   { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b', C: 'b', F: 'b' },
  Am:   {},
  Em:   { F: '#' },
  Bm:   { F: '#', C: '#' },
  'F#m':{ F: '#', C: '#', G: '#' },
  'C#m':{ F: '#', C: '#', G: '#', D: '#' },
  'G#m':{ F: '#', C: '#', G: '#', D: '#', A: '#' },
  'D#m':{ F: '#', C: '#', G: '#', D: '#', A: '#', E: '#' },
  'A#m':{ F: '#', C: '#', G: '#', D: '#', A: '#', E: '#', B: '#' },
  Dm:   { B: 'b' },
  Gm:   { B: 'b', E: 'b' },
  Cm:   { B: 'b', E: 'b', A: 'b' },
  Fm:   { B: 'b', E: 'b', A: 'b', D: 'b' },
  Bbm:  { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b' },
  Ebm:  { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b', C: 'b' },
  Abm:  { B: 'b', E: 'b', A: 'b', D: 'b', G: 'b', C: 'b', F: 'b' },
};

/**
 * Create a fresh per-measure accidental state object.
 * Each letter (C–B) is initialised to its key-signature default.
 * Empty string = natural; '#' or 'b' = key-signature accidental.
 * Reset at every bar boundary — _buildNotes creates one per call.
 */
function _initAccState(keySig) {
  const defaults = _KEY_SIG_NOTES[keySig] ?? {};
  const state = {};
  for (const L of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
    state[L] = defaults[L] || '';
  }
  return state;
}

/** Extract pitch letter and accidental string from a note name.
 *  "F#4" → { letter:'F', acc:'#' }   "Bb3" → { letter:'B', acc:'b' }
 *  "C5"  → { letter:'C', acc:'' }    (natural) */
function _parsePitch(n) {
  const m = n.match(/^([A-G])(#{1,2}|b{1,2})?(\d+)$/);
  if (!m) return { letter: 'B', acc: '' };
  return { letter: m[1], acc: m[2] || '' };
}

/**
 * Returns the VexFlow accidental string to attach for note n,
 * or null if no accidental marker is needed.
 *
 * Rules:
 *  acc === current state → null (key-sig default, or already carried in this bar)
 *  acc !== '' and !== current → acc (show the new sharp/flat/double)
 *  acc === '' and current !== '' → 'n' (natural sign cancels previous or key-sig)
 */
function _resolveAccidental(n, accState) {
  const { letter, acc } = _parsePitch(n);
  const current = accState[letter] ?? '';
  if (acc === current) return null;
  return acc === '' ? 'n' : acc;
}

/** Update the per-measure state after committing note n. Must be called for every note. */
function _updateAccState(accState, n) {
  const { letter, acc } = _parsePitch(n);
  accState[letter] = acc;
}

// ---------------------------------------------------------------------------
// Note construction helpers
// ---------------------------------------------------------------------------

function _isBeamable(dur) {
  return ['8', '16', '32'].includes(dur);
}

function _wholeRest(VF, clef) {
  return new VF.StaveNote({ clef, keys: [clef === 'treble' ? 'b/4' : 'd/3'], duration: 'wr' });
}

// ---------------------------------------------------------------------------
// Layout and spacing
// ---------------------------------------------------------------------------

/** Returns number of accidentals in key signature (sharps or flats). */
function _keyAccCount(key) {
  const map = {
    C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
    F: 1, Bb: 2, Eb: 3, Ab: 4, Db: 5, Gb: 6, Cb: 7,
    Am: 0, Em: 1, Bm: 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, 'D#m': 6, 'A#m': 7,
    Dm: 1, Gm: 2, Cm: 3, Fm: 4, Bbm: 5, Ebm: 6, Abm: 7,
  };
  return map[key] ?? 0;
}

/**
 * Rhythmic density weight for one measure.
 * Groups events by t_ms (simultaneous = one slot), sums slot weights.
 * Heavier durations, accidentals, and chords produce higher weight → wider bar.
 */
function _barNoteWeight(barData) {
  const beats = barData.beats || [];
  if (!beats.length) return 1.0;

  const DUR_W = { w: 2.5, h: 1.6, q: 1.0, '8': 0.75, '16': 0.6, '32': 0.5 };

  // Group by rounded t_ms to merge truly simultaneous events (treble + bass at same beat)
  const slotMap = new Map();
  for (const ev of beats) {
    const key = Math.round((ev.t_ms ?? 0) / 5) * 5;
    if (!slotMap.has(key)) slotMap.set(key, []);
    slotMap.get(key).push(ev);
  }

  let weight = 0;
  for (const evs of slotMap.values()) {
    let slotW = 0;
    for (const ev of evs) {
      const base = (ev.duration || 'q').replace('.', '');
      let dw = DUR_W[base] ?? 1.0;
      if ((ev.duration || '').endsWith('.')) dw *= 1.15;
      // Accidentals require horizontal pre-space. Raw pattern intentionally ignores key
      // signature — F# in G major still widens the estimate. Over-estimates rather than
      // under-estimates, so bars that render accidentals never appear too narrow.
      const accs = (ev.notes || []).filter(n => n.length > 2 && /[#b]/.test(n[1])).length;
      dw += accs * 0.25;
      // Additional chord notes (stacked intervals may need spread)
      dw += Math.max(0, (ev.notes || []).length - 1) * 0.1;
      // Tuplet notes carry bracket + number-label overhead — widen bar to absorb it.
      if (ev.tuplet_group) dw *= 1.25;
      slotW = Math.max(slotW, dw);
    }
    weight += slotW;
  }
  return Math.max(0.4, weight);
}

/**
 * Compute bar pixel widths for one row.
 *
 * Width blend: each bar's raw weight is pulled 40% toward itself and 60%
 * toward a blend of the row average (local) and the score-wide average
 * (global). The 50/50 local-global mix keeps within-row proportion while
 * anchoring every row to a common visual center — the key to cross-row
 * optical consistency.
 *
 * Fill strategy:
 *  - Full rows (rowBars.length === barsPerRow): justify to full canvas width.
 *  - Partial rows: scale to their proportional fraction of the canvas
 *    (barCount/barsPerRow × available), with MIN_ROW_FILL as a floor.
 *    This keeps per-bar average width consistent across all rows regardless
 *    of how many bars each row contains.
 */
function _computeRowWidths(rowBars, meta, CANVAS_W, MARGIN_X, barsPerRow, globalAvg) {
  const CLEF_W       = 32;
  const KEY_ACC_W    = 12;   // per sharp or flat
  const TIME_W       = 28;
  const SYS_MARGIN   = 8;
  const MIN_NOTE_W   = 60;   // aesthetic floor for note content area
  const NOTE_SCALE   = 28;   // px per weight unit
  const END_PAD      = 14;
  const WIDTH_BLEND  = 0.40; // 0 = equal bars, 1 = pure proportional
  const MIN_ROW_FILL = 0.45; // floor for partial rows

  const sysOverhead = CLEF_W + _keyAccCount(meta.key_signature) * KEY_ACC_W
                    + TIME_W + SYS_MARGIN;

  const rawWidths = rowBars.map((barData, i) => {
    const noteW = Math.max(MIN_NOTE_W, _barNoteWeight(barData) * NOTE_SCALE);
    return noteW + (i === 0 ? sysOverhead : 0) + END_PAD;
  });

  // Blend target: 50% row average (local) + 50% score average (global).
  // Local keeps within-row proportion; global anchors every row to the
  // same visual centre for cross-row optical consistency.
  const rowAvg      = rawWidths.reduce((a, b) => a + b, 0) / rawWidths.length;
  const blendTarget = rowAvg * 0.5 + (globalAvg ?? rowAvg) * 0.5;
  const smoothed    = rawWidths.map(w => w * WIDTH_BLEND + blendTarget * (1 - WIDTH_BLEND));

  const total     = smoothed.reduce((a, b) => a + b, 0);
  const MARGIN_R  = 8;   // right margin — system barlines at CANVAS_W boundary were invisible
  const available = CANVAS_W - MARGIN_X - MARGIN_R;

  if (rowBars.length < barsPerRow) {
    // Partial row: proportional fill keeps per-bar width in line with full rows.
    const proportional = (rowBars.length / barsPerRow) * available;
    const targetW      = Math.max(proportional, MIN_ROW_FILL * available);
    return smoothed.map(w => Math.round(w * targetW / total));
  }

  // Full row: justify to canvas width.
  return smoothed.map(w => Math.round(w * available / total));
}

/**
 * Conservative final-row rebalancing.
 * If the last row has ≤ floor(barsPerRow/2) bars, move one bar from the
 * penultimate row to reduce visual isolation. Never moves more than one bar.
 * Example: 9 bars, barsPerRow=4 → [4,4,1] → [4,3,2].
 */
function _computeRowLayout(bars, barsPerRow) {
  const rows = [];
  for (let i = 0; i < bars.length; i += barsPerRow) {
    rows.push(bars.slice(i, i + barsPerRow));
  }
  if (rows.length >= 2) {
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    if (last.length <= Math.floor(barsPerRow / 2) && prev.length > 1) {
      last.unshift(prev.pop());
    }
  }
  return rows;
}

/**
 * Score-wide average raw bar width (px) — anchor for cross-row optical normalization.
 * Uses the same MIN_NOTE_W / NOTE_SCALE constants as _computeRowWidths.
 */
function _globalAvgBarW(bars) {
  const MIN_NOTE_W = 60;
  const NOTE_SCALE = 28;
  if (!bars.length) return MIN_NOTE_W;
  const sum = bars.reduce((acc, b) =>
    acc + Math.max(MIN_NOTE_W, _barNoteWeight(b) * NOTE_SCALE), 0);
  return sum / bars.length;
}

// ---------------------------------------------------------------------------
// Beam grouping
// ---------------------------------------------------------------------------

/**
 * Build beat-grouped Beam objects for one voice. Returns beams without drawing.
 * Caller must create beams BEFORE drawing voices (so note flags are suppressed),
 * then draw beams after voices (so beam pixel positions are available).
 * items and beats are parallel arrays (same order from _buildNotes / clef filter).
 * Groups with only one beamable note are left unbeamed (flagged stem, correct).
 * Beamed groups receive a unified stem direction from the note most removed from the
 * middle line across the group (Gould furthest-note rule), overriding per-note direction.
 *
 * Beat group size derives from meter only — tempo does not affect beam grouping.
 * Compound meters (6/8, 9/8, 12/8) use dotted quarter as the beat unit (1.5 QL).
 * Simple meters use 4/beatValue as the beat unit (1.0 QL for x/4, 2.0 QL for x/2).
 * Position is tracked via cumQL accumulated from beats[i].duration, so groupKey
 * reflects each note's start position within the bar (pre-advance order).
 * TODO(Layer3-tuplets): tuplet brackets require a VF.Tuplet pass over tagged tuplet
 * groups after beam creation. Requires tuplet metadata in song.json events.
 * See docs/music-notation-semantics.md §10.1.
 */
function _beatGroupedBeams(VF, items, beats, numBeats, beatValue, clef) {
  const middle = clef === 'treble' ? _TREBLE_MID : _BASS_MID;
  const groups = new Map();

  // Meter-based beat group size in quarter lengths — tempo-independent.
  // Compound (6/8, 9/8, 12/8): dotted quarter = 3 × 8th = 1.5 QL.
  // Simple: denominator unit (1.0 QL for x/4, 0.5 QL for x/8 simple, 2.0 QL for x/2).
  const isCompound  = beatValue === 8 && (numBeats === 6 || numBeats === 9 || numBeats === 12);
  const beatGroupQL = isCompound ? (4 / beatValue) * 3 : (4 / beatValue);

  // QL lookup for cumulative position accumulation from note durations.
  const QL = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25, '32': 0.125 };

  let prevTupletRatio = null;
  let tupletPos       = 0;
  let cumQL           = 0;  // cumulative quarter-length position from bar start

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.tupletGroup !== prevTupletRatio) {
      prevTupletRatio = item.tupletGroup ?? null;
      tupletPos = 0;
    }
    const posInRun = item.tupletGroup ? tupletPos++ : 0;

    // Event QL from beats[i].duration — preserves dots that item.dur drops.
    const { base: evBase, dots: evDots } = _parseDur(beats[i]?.duration ?? item.dur);
    const evQL = (QL[evBase] ?? 1) * (evDots ? 1.5 : 1);

    if (!item.note.isRest() && _isBeamable(item.dur)) {
      let groupKey;
      if (item.tupletGroup) {
        const numNotes = parseInt(item.tupletGroup.split(':')[0], 10);
        const chunkIdx = isNaN(numNotes) ? 0 : Math.floor(posInRun / numNotes);
        groupKey = `t:${item.tupletGroup}:${chunkIdx}`;
      } else {
        // groupKey from cumQL START position (before advancing) — tempo-independent.
        // +0.001 absorbs floating-point rounding at exact beat boundaries; safe because
        // all standard durations are exact binary fractions and the minimum gap between
        // a genuine pre-boundary position and the boundary is 0.125 QL (one 32nd note).
        const beatIdx = Math.floor(cumQL / beatGroupQL + 0.001);
        groupKey = `b:${beatIdx}`;
      }

      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey).push(item);
    }

    // Advance position AFTER groupKey is computed — uses event start, not end.
    // Rests and non-beamable notes still advance cumQL so subsequent note positions are correct.
    cumQL += evQL;
  }

  const beams = [];
  for (const grp of groups.values()) {
    if (grp.length < 2) continue;
    // Unified stem direction: the note most removed from the middle line determines direction
    // (Gould §4). Tie-break: equidistant → note above middle wins → stem down.
    let furthestStep = middle;
    for (const it of grp) {
      const d  = Math.abs(it.step - middle);
      const fd = Math.abs(furthestStep - middle);
      if (d > fd || (d === fd && it.step > middle)) furthestStep = it.step;
    }
    const groupDir = furthestStep < middle ? 1 : -1;
    const notes    = grp.map(it => { it.note.setStemDirection(groupDir); return it.note; });
    beams.push(new VF.Beam(notes));
  }
  return beams;
}

// ---------------------------------------------------------------------------
// Tuplet rendering helper
// ---------------------------------------------------------------------------

/**
 * Collect VF.Tuplet objects for one voice's items in one bar.
 *
 * Groups consecutive items that share the same tuplet_group tag (e.g. "3:2").
 * Splits each run into chunks of exactly numNotes (the ratio numerator).
 * Incomplete trailing chunks (orphaned by bar boundary) are silently discarded.
 *
 * Position: LOCATION_TOP when stem direction is up (stem-up → bracket above),
 * LOCATION_BOTTOM when stem direction is down, matching standard engraving convention.
 *
 * Drawn after voices and beams so all note positions and stem directions are final.
 */
function _collectTuplets(VF, items) {
  if (!VF.Tuplet || !items.length) return [];
  const LOC_TOP    = VF.Tuplet.LOCATION_TOP    ?? 1;
  const LOC_BOTTOM = VF.Tuplet.LOCATION_BOTTOM ?? -1;
  const tuplets    = [];
  let group        = [];
  let currentRatio = null;

  const flush = () => {
    if (!group.length || !currentRatio) { group = []; return; }
    const parts = currentRatio.split(':');
    const numNotes      = parseInt(parts[0], 10);
    const beatsOccupied = parseInt(parts[1], 10);
    if (isNaN(numNotes) || isNaN(beatsOccupied) || numNotes < 2) { group = []; return; }
    for (let i = 0; i < group.length; i += numNotes) {
      const chunk = group.slice(i, i + numNotes);
      if (chunk.length < numNotes) break;  // incomplete trailing chunk — discard
      const notes    = chunk.map(it => it.note);
      const stemDir  = typeof notes[0].getStemDirection === 'function' ? notes[0].getStemDirection() : 1;
      const location = stemDir >= 0 ? LOC_TOP : LOC_BOTTOM;
      try {
        tuplets.push(new VF.Tuplet(notes, {
          num_notes:      numNotes,
          beats_occupied: beatsOccupied,
          bracketed:      true,
          ratioed:        false,
          location,
        }));
      } catch (_) {}
    }
    group = [];
  };

  for (const item of items) {
    if (item.tupletGroup) {
      if (item.tupletGroup !== currentRatio) {
        flush();
        currentRatio = item.tupletGroup;
      }
      group.push(item);
    } else {
      flush();
      currentRatio = null;
    }
  }
  flush();
  return tuplets;
}

// ---------------------------------------------------------------------------
// Tie rendering helpers
// ---------------------------------------------------------------------------

/**
 * Minimal duck-typed proxy for a chord notehead at index > 0.
 *
 * Problem: VexFlow 5.0.0 compiled bundle's note.getYs() only contains the first
 * notehead's y-coordinate. getYs()[n > 0] is undefined → NaN → StaveTie.renderTie()
 * throws 'Bad indices' silently (swallowed by catch). Second+ arcs never draw.
 *
 * Fix: for index > 0, build a proxy whose getYs() returns [y_this_head] so that
 * StaveTie always indexes at [0]. Pass firstIndices:[0]/lastIndices:[0] to match.
 * The real note's ys array is never mutated — no global geometry corruption.
 *
 * NoteHead.y is set by Formatter.format() → preFormat() → NoteHead.setStave(),
 * which always runs before _drawTies. getY() is reliable at that point.
 *
 * Returns null if y cannot be determined (caller skips the arc).
 * For index 0: returns null (real note + getYs()[0] already works correctly).
 */
function _noteHeadProxy(realNote, headIndex) {
  if (headIndex <= 0) return null;

  let y = null;
  try {
    const heads = (
      (typeof realNote.getNoteHeads === 'function' && realNote.getNoteHeads()) ||
      (Array.isArray(realNote.noteHeads)  && realNote.noteHeads)  ||
      (Array.isArray(realNote.note_heads) && realNote.note_heads) ||
      null
    );
    if (heads && heads[headIndex]) {
      const head = heads[headIndex];
      const raw  = typeof head.getY === 'function' ? head.getY() : head.y;
      if (typeof raw === 'number' && !isNaN(raw) && raw !== 0) y = raw;
    }
  } catch (_) {}

  if (y === null) return null;

  return {
    getYs:           () => [y],
    getTieRightX:    () => realNote.getTieRightX(),
    getTieLeftX:     () => realNote.getTieLeftX(),
    getStemDirection:() => realNote.getStemDirection(),
    checkStave:      () => realNote.checkStave(),
  };
}

/**
 * Draw StaveTie arcs between srcNote and dstNote for each matching pitch pair.
 * Handles same-row (single arc) and cross-row (end half-tie + start half-tie) cases.
 * Per-pitch index matching supports chord ties where only some tones are tied.
 *
 * ROW_H (280) is the score row height used to detect same-row vs cross-row.
 *
 * VexFlow 5.0.0 compiled bundle: constructor keys are camelCase.
 *   firstNote / lastNote / firstIndices / lastIndices
 * The master-branch TypeScript source uses snake_case — ignore it for this bundle.
 */
function _drawStaveTies(ctx, VF, srcNote, srcStave, srcNotes, dstNote, dstStave, dstNotes, ROW_H) {
  const srcRow   = Math.floor(srcStave.getY() / ROW_H);
  const dstRow   = Math.floor(dstStave.getY() / ROW_H);
  const crossRow = srcRow !== dstRow;

  // Build pitch → source-index lookup for matching chord tones.
  const srcIdx = new Map();
  (srcNotes || []).forEach((n, i) => srcIdx.set(n, i));

  // One StaveTie per matched pitch pair.
  for (let di = 0; di < (dstNotes || []).length; di++) {
    const pitch = dstNotes[di];
    if (!srcIdx.has(pitch)) continue;
    const si = srcIdx.get(pitch);

    // Index 0: use the real note directly with firstIndices:[0].
    // Index > 0: use a proxy whose getYs()=[y_this_head] and firstIndices:[0],
    // bypassing the broken getYs()[n>0] path in VexFlow 5.0.0.
    // If the proxy can't determine y (getNoteHeads unavailable), skip this arc.
    let srcForTie = srcNote, srcIdx0 = si;
    let dstForTie = dstNote, dstIdx0 = di;

    if (si > 0) {
      const p = _noteHeadProxy(srcNote, si);
      if (!p) continue;
      srcForTie = p; srcIdx0 = 0;
    }
    if (di > 0) {
      const p = _noteHeadProxy(dstNote, di);
      if (!p) continue;
      dstForTie = p; dstIdx0 = 0;
    }

    if (!crossRow) {
      try {
        new VF.StaveTie({
          firstNote:    srcForTie,
          lastNote:     dstForTie,
          firstIndices: [srcIdx0],
          lastIndices:  [dstIdx0],
        }).setContext(ctx).draw();
      } catch (_) {}
    } else {
      // Cross-row: end half-arc at source row boundary, start half-arc at dest row.
      try {
        new VF.StaveTie({
          firstNote:    srcForTie,
          lastNote:     null,
          firstIndices: [srcIdx0],
          lastIndices:  [srcIdx0],
        }).setContext(ctx).draw();
      } catch (_) {}
      try {
        new VF.StaveTie({
          firstNote:    null,
          lastNote:     dstForTie,
          firstIndices: [dstIdx0],
          lastIndices:  [dstIdx0],
        }).setContext(ctx).draw();
      } catch (_) {}
    }
  }
}

// ---------------------------------------------------------------------------
// Slur rendering helper
// ---------------------------------------------------------------------------

/**
 * Draw a thin filled slur arc between two notehead-side anchor points.
 *
 * Outer Bezier curve bows toward `apexY`; inner Bezier returns slightly
 * less bowed (THICK px). Closed path filled black → tapered lens shape.
 *
 * dir: +1 = arc bows below noteheads (stem-up).
 *      -1 = arc bows above noteheads (stem-down).
 *
 * Bezier geometry note: a cubic Bezier's midpoint (t=0.5) only reaches
 * ¾ of the control-point apex, not the full apex. `ctrlH = height × 4/3`
 * corrects for this so the visible arc peak equals `height` in px.
 *
 * Control points at ⅓ span (vs naïve ¼) produce a rounder, less
 * flat-topped arch — the curve rises from the endpoints more steeply and
 * peaks cleanly rather than staying near apex for an extended middle stretch.
 */
function _drawSlurPath(ctx, x1, y1, x2, y2, dir) {
  const span = x2 - x1;
  if (span <= 4) return;  // degenerate span — nothing visible

  const height = Math.min(26, Math.max(12, span * 0.15));
  const ctrlH  = height * (4 / 3);  // control apex so midpoint reaches `height`
  const apexY  = (y1 + y2) / 2 + dir * ctrlH;
  const cpX1   = x1 + span * (1 / 3);
  const cpX2   = x2 - span * (1 / 3);
  const THICK  = 2.5;   // lens thickness at apex (px)

  ctx.save();
  ctx.setFillStyle('#000000');
  ctx.setLineWidth(0);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(cpX1, apexY,               cpX2, apexY,               x2, y2);
  ctx.bezierCurveTo(cpX2, apexY - dir * THICK,  cpX1, apexY - dir * THICK,  x1, y1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Ottava rendering helper
// ---------------------------------------------------------------------------

/**
 * Proxy note for cross-row TextBracket segments.
 * VF.TextBracket.draw() calls getAbsoluteX(), getGlyphWidth(), and checkStave() on
 * start/stop. For row-boundary anchors we supply synthetic x values and a real stave
 * for the y calculation (getYForTopText / getYForBottomText).
 */
function _makeProxyNote(absX, glyphWidth, stave) {
  return {
    getAbsoluteX:  () => absX,
    getGlyphWidth: () => glyphWidth,
    checkStave:    () => stave,
  };
}

// ---------------------------------------------------------------------------
// Navigation symbol rendering helper
// ---------------------------------------------------------------------------

function _getVoltaType(bars, barIdx, VF) {
  const T = VF.Volta.type;
  const raw      = b => (b == null ? null : (Array.isArray(b.volta) ? b.volta[0] : b.volta));
  const voltaNum = raw(bars[barIdx]);
  const prevNum  = barIdx > 0               ? raw(bars[barIdx - 1]) : null;
  const nextNum  = barIdx < bars.length - 1 ? raw(bars[barIdx + 1]) : null;
  const prevSame = prevNum === voltaNum;
  const nextSame = nextNum === voltaNum;
  if (!prevSame && !nextSame) return T.BEGIN_END;
  if (!prevSame && nextSame)  return T.BEGIN;
  if (prevSame  && nextSame)  return T.MIDDLE;
  return T.END;
}

/**
 * Attach VF.Repetition modifiers to a treble stave for Coda and text-family
 * navigation symbols. Must be called before stave.draw().
 *
 * Segno is NOT handled here — it is rendered post-stave by _drawSegno() because
 * VF.Repetition.SEGNO_LEFT uses ctx.fillText() with a PUA glyph codepoint that
 * requires @font-face. VexFlow's SVG backend renders glyphs as paths and does
 * not inject @font-face, so fillText produces an invisible result.
 *
 * Text-family types (Fine, D.C., D.S., D.C. al Fine, D.S. al Coda) receive
 * stave.getX() as the x argument. VexFlow's drawSymbolText computes:
 *   textX ≈ this.x − stave.getNoteStartX() + stave.getWidth()
 * With this.x = 0 (old code), getNoteStartX() is an absolute canvas coordinate
 * (e.g. 458 px for a second-column bar) and textX goes deeply negative — off
 * canvas. With this.x = stave.getX() the calculation anchors to the bar's left
 * edge and textX lands near the bar's right edge as intended.
 *
 * CODA_LEFT uses a hardcoded small x internally (stave.getVerticalBarWidth()),
 * ignoring this.x — so x=0 is correct and unchanged.
 */
function _addNavModifiers(stave, barData, VF) {
  if (!VF.Repetition) return;
  const T = VF.Repetition.type;

  if (barData.coda) {
    stave.addModifier(new VF.Repetition(T.CODA_LEFT, 0, 0));
  }
  if (barData.navigation) {
    const NAV_TYPE = {
      'Fine':         T.FINE,
      'D.C.':         T.DC,
      'D.S.':         T.DS,
      'D.C. al Fine': T.DC_AL_FINE,
      'D.S. al Coda': T.DS_AL_CODA,
    };
    const t = NAV_TYPE[barData.navigation];
    if (t !== undefined) stave.addModifier(new VF.Repetition(t, stave.getX(), 0));
  }
}

/**
 * Render the Segno glyph (𝄋) above the left edge of a stave after stave.draw().
 *
 * VF.Repetition.SEGNO_LEFT fails silently because its internal drawSegnoFixed()
 * calls ctx.fillText() with a Bravura PUA codepoint. VexFlow's SVG backend uses
 * path-based glyph rendering and does not inject Bravura as @font-face, so the
 * browser cannot display the character. This function uses VF.Glyph.renderGlyph()
 * (path-based, font-independent) with an SVG text fallback.
 */
function _drawSegno(ctx, stave, VF) {
  // Position: just after the left barline, slightly above the top stave line.
  const x = stave.getX() + 8;
  const y = stave.getY() + 14;

  // Primary: VF.Glyph path rendering — works regardless of browser font availability.
  // 'segnoSerpent1' is the SMuFL name (U+E047) used by VexFlow's Bravura tables.
  try {
    if (VF.Glyph && typeof VF.Glyph.renderGlyph === 'function') {
      VF.Glyph.renderGlyph(ctx, x, y, 30, 'segnoSerpent1');
      return;
    }
  } catch (_) {}

  // Fallback: SVG text with Bravura font. Visible if Bravura is available as a
  // browser font (e.g. loaded externally). U+E047 is the SMuFL segno codepoint.
  const svgEl = ctx.svg;
  if (!svgEl) return;
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('font-family', 'Bravura, Gonville, serif');
  el.setAttribute('font-size', '28');
  el.setAttribute('fill', '#000000');
  el.textContent = '';
  svgEl.appendChild(el);
}

// ---------------------------------------------------------------------------
// Dynamics rendering helper
// ---------------------------------------------------------------------------

/**
 * Draw a static dynamic marking (pp/p/mp/mf/f/ff) as an SVG text element.
 * Grand-staff: positioned in the vertical gap between treble and bass staves
 * (trebleStave provided). Bass-only fallback: below the bass stave.
 * Called after stave.draw() so geometry methods return committed values.
 * Uses direct SVG DOM insertion for reliable italic serif rendering.
 */
function _drawDynamic(ctx, dynamic, stave, trebleStave) {
  const VALID = new Set(['pp', 'p', 'mp', 'mf', 'f', 'ff']);
  if (!VALID.has(dynamic)) return;
  const svgEl = ctx.svg;
  if (!svgEl) return;
  const x = stave.getNoteStartX();
  // Grand-staff: SVG text baseline at vertical midpoint of gap + half cap-height (≈5px).
  // Bass-only fallback: original offset below bass stave bottom.
  const y = trebleStave
    ? Math.round((trebleStave.getBottomY() + stave.getY()) / 2) + 5
    : stave.getBottomY() + 18;
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', String(x));
  text.setAttribute('y', String(y));
  text.setAttribute('font-family', 'Times New Roman, Georgia, serif');
  text.setAttribute('font-size', '13');
  text.setAttribute('font-style', 'italic');
  text.setAttribute('font-weight', 'bold');
  text.setAttribute('fill', '#000000');
  text.setAttribute('class', 'nk-dynamic');
  text.textContent = dynamic;
  svgEl.appendChild(text);
}

// ---------------------------------------------------------------------------
// Bar number rendering helper
// ---------------------------------------------------------------------------

function _drawBarNumber(ctx, barNumber, stave) {
  const svgEl = ctx.svg;
  if (!svgEl) return;
  const overhead = stave.getNoteStartX() - stave.getX();
  const x = overhead > 50 ? stave.getNoteStartX() - 4 : stave.getX();
  const y = stave.getYForLine(0) - 14;
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', String(x));
  text.setAttribute('y', String(y));
  text.setAttribute('font-family', "'Segoe UI', Arial, sans-serif");
  text.setAttribute('font-size', '11');
  text.setAttribute('fill', '#999999');
  text.setAttribute('class', 'nk-bar-number');
  text.textContent = String(barNumber);
  svgEl.appendChild(text);
}

// ---------------------------------------------------------------------------
// Export — browser global + Node.js CommonJS
// ---------------------------------------------------------------------------

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NotationRenderer };
} else {
  (typeof globalThis !== 'undefined' ? globalThis : window).NotationRenderer = NotationRenderer;
}
