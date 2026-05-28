# Runtime Integration Roadmap — MyKey Music Labs

**Authored:** 2026-05-22 (Session 45)  
**Status:** Architecture consolidation phase — pre-Checkpoint 2  
**Based on:** Controlled runtime lifecycle audit + renderer boundary audit + SPEC compliance review

> Read `docs/runtime-contract.md` for the authoritative RuntimeEngine API contract.  
> Read `docs/engraving-standards.md §10` for the notation renderer freeze boundaries.  
> This document describes WHERE WE ARE and WHERE WE ARE GOING architecturally.

---

## 1. Audit Summary (2026-05-22)

### 1.1 Audit Scope

Three focused audits were conducted in Session 45:

| Audit | Scope | Files Read |
|-------|-------|-----------|
| Runtime Lifecycle | Timing ownership, duplicated state, callback wiring, stop/seek lifecycle | `runtime-engine.js`, `index.html`, `learning-state.js` |
| Renderer Boundary | Authority leaks, DOM coupling, highlight lifecycle, internal state access | `notation-renderer.js`, `keyboard-viz.js`, `index.html` |
| SPEC Integration | Layer authority compliance, system inventory, gap analysis, God-object risk | `SPEC.md`, `music-notation-semantics.md`, `runtime-engine.js`, `index.html` |

### 1.2 Findings Summary

**Positive findings:**
- RuntimeEngine implementation matches its contract exactly. No hidden behaviors.
- One-way callback flow is correctly maintained throughout.
- Highlight lifecycle is 100% runtime callback-driven — no timers or DOM-driven triggers.
- No renderer internal state (`_noteElMap`, `_noteObjMap`) is accessed externally.
- `getNoteElement()` is confirmed absent (removed in Session 43 rollback).
- KeyboardViz is properly isolated — receives typed events from LearningModeState only.
- No circular data flow. No engine writes to another engine's owned state.
- SPEC authority rules are correctly implemented. No violations found.

**Issues requiring attention:**

| ID | Issue | Severity | When to fix |
|----|-------|----------|-------------|
| R1 | Audio clock independent from runtime clock | HIGH | Before Stage 3 / pitch-sync work |
| R2 | `stop()` vs `seek()` exit asymmetry — presentational clearAll() not automatic | MEDIUM | Before Checkpoint 2 adds new presentation layers |
| R3 | Enter-before-exit ordering dependency undocumented in index.html | LOW | Now (documentation fix only) |
| R4 | `index.html` is a 991-line God Shell — 11 distinct concerns | MEDIUM-HIGH | Before Checkpoint 2 adds gameplay/scoring |
| R5 | Single-subscriber callback pattern will not scale to Stage 2 | MEDIUM | Before gameplay-engine joins event stream |

---

## 2. Current System Status

### 2.1 Authority and Drive Map (Current State)

```
song.json ──────────────────────────────────────────────────────────► semantic truth
    │
    └─► RuntimeEngine ──────────────────────────────────────────────► temporal authority
              │
              │  onEventEnter(ev) ─────┐
              │  onEventExit(ev)  ─────┤
              │  onTimelineUpdate(t) ──┤
              │  onEnd()          ─────┘
              │                       │
              ▼                       ▼
         index.html (ui-shell) ◄──────┘
              │
              │ manually fans out to:
              ├─► renderer.highlight()          ← driven by runtime ✓
              ├─► renderer.clearHighlight()     ← driven by runtime ✓
              ├─► renderer.scrollToBar()        ← driven by runtime ✓
              ├─► _playNote()                   ← driven by runtime ✓ (audio clock independent ⚠)
              ├─► learningState.notifyEnter/Exit ← driven by runtime ✓
              │       └─► keyboardViz.onHighlight ← via learningState.onKeyHighlight ✓
              ├─► _updateProgress()             ← driven by runtime ✓
              └─► _updateTime()                 ← driven by runtime ✓
```

### 2.2 System-by-System Status

| System | Drive mechanism | Runtime-driven? | Notes |
|--------|----------------|-----------------|-------|
| **RuntimeEngine** | play/pause/stop/seek from user input | — | Authoritative source |
| **NotationRenderer** | highlight/clearHighlight/scrollToBar | ✓ Fully | Pure passive visual interpreter |
| **Audio (_playNote)** | onEventEnter callback | ✓ Mostly | ⚠ Uses own Web Audio clock (R1) |
| **Progress bar** | onTimelineUpdate callback | ✓ Fully | Updates every tick |
| **Scroll (scrollToBar)** | onEventEnter callback (bar change) | ✓ Fully | No timer-driven scroll |
| **LearningModeState** | notifyEventEnter/Exit from callback | ✓ Fully | Clef filter + keyboard state |
| **KeyboardViz** | onKeyHighlight via LearningModeState | ✓ Fully | Mediated by LearningModeState |
| **Part selection** | User click → play({ partId }) | ✓ Fully | Scope computed by runtime |
| **Segment selection** | User click → play({ start_ms, end_ms }) | ✓ Fully | Session 47 addition; t_ms resolved by SongLoader |
| **Tempo controls** | User click → setTempo(scale) | ✓ Fully | Takes effect next tick |
| **Song loading** | User select → fetch + render | Not applicable | One-time init (SongLoader, Session 46) |
| **UI state machine** | Runtime state changes + user input | ✓ Fully | `_setUIState()` tracks play/pause/end |

**Assessment:** The system is 90%+ runtime-driven. The main gap is audio clock independence (R1) and presentation layer fan-out fragility (R2, R4).

---

## 3. Target Runtime-Centric Architecture

### 3.1 Canonical Pattern (Now)

The current pattern is correct and should be preserved:

```javascript
// ui-shell owns fan-out. All engines listen. None write back.
runtime
  .onEventEnter(ev => {
    renderer.highlight(ev.id, learningState.getHighlightStyle(ev));
    audioEngine.play(ev);
    learningState.notifyEventEnter(ev);
  })
  .onEventExit(ev => {
    renderer.clearHighlight(ev.id);
    learningState.notifyEventExit(ev);
  })
  .onEnd(() => {
    renderer.clearAll();
    audioEngine.clear();
    keyboardViz.clear();
  });
```

### 3.2 Target Pattern (Checkpoint 2 / Stage 2)

When `gameplay-engine.js` and `hint-engine.js` join, the fan-out grows:

```javascript
runtime
  .onEventEnter(ev => {
    // — Presentation layer (unchanged) —
    renderer.highlight(ev.id, learningState.getHighlightStyle(ev));
    audioEngine.play(ev);
    learningState.notifyEventEnter(ev);

    // — Gameplay layer (Checkpoint 2 addition) —
    if (stageManager.isStage2()) {
      gameplayEngine.evaluateEventEnter(ev);
      hintEngine.scheduleHintFor(ev);
    }
  })
  .onEventExit(ev => {
    // — Presentation layer (unchanged) —
    renderer.clearHighlight(ev.id);
    learningState.notifyEventExit(ev);

    // — Gameplay layer (Checkpoint 2 addition) —
    if (stageManager.isStage2()) {
      gameplayEngine.evaluateEventExit(ev);
      hintEngine.cancelHintFor(ev);
    }
  });
```

**Key principle:** Adding Stage 2 is a FAN-OUT EXPANSION in ui-shell. RuntimeEngine is unchanged.

### 3.3 Reduced Renderer Responsibility (Target)

```
Current renderer responsibilities:
  ✓ Render notation (SVG, VexFlow)
  ✓ Highlight active events (apply CSS class)
  ✓ Clear active event highlights
  ✓ Scroll to bar

NOT added to renderer (even when Stage 2 arrives):
  ✗ Track which events are "expected" (gameplay)
  ✗ Show visual correctness feedback (gameplay)
  ✗ Control timing of overlays (hint engine)
  ✗ Know about pitch detection results
```

The renderer's responsibility surface should STAY at these four functions.

### 3.4 Future Modular Architecture

```
src/
  runtime-engine.js       — Layer 1, temporal authority (frozen contract)
  notation-renderer.js    — Layer 2, visual notation (frozen engraving contracts)
  learning-state.js       — Presentation state (clef filter, hand-color, keyboard hooks)
  keyboard-viz.js         — Presentation consumer (keyboard lighting)
  audio-engine.js         — [TO CREATE] Audio synthesis, currently in index.html
  gameplay-engine.js      — [TO CREATE] Stage 2/3 scoring, timing windows
  hint-engine.js          — [TO CREATE] Stage 2 hint timer, hint display
  stage-manager.js        — [TO CREATE] Which stage is active, transitions

index.html
  — Engine instantiation
  — Runtime callback wiring (fan-out)
  — User input → runtime control (play/pause/stop/seek/setTempo)
  — Song loading
  — Minimal UI shell (NOT business logic)
```

---

## 4. Migration Plan

Priorities are ordered: lowest risk first, highest value for Checkpoint 2 first.

---

### Priority 1 — Documentation Fixes (Now, Zero Risk)

**P1a: Document enter-before-exit ordering dependency (R3)**
- Add comment to `index.html` bar-scroll logic explaining why enter fires before exit
- Add a note to `docs/runtime-contract.md §4.5` about presentation-layer implications
- **Risk:** Zero (comment only)

**P1b: Document stop() manual clearAll() requirement (R2)**  
- Expand `docs/runtime-contract.md §4.4` with explicit guidance for presentation modules
- **Risk:** Zero (documentation only)

**P1c: Create this roadmap document**
- Done. You are reading it.

---

### Priority 2 — index.html Modularization (Before Checkpoint 2)

**Goal:** Extract audio synthesis from the God Shell before Stage 2 callback complexity arrives.

**Step 1 — Extract audio to `src/audio-engine.js`** (Medium effort, low risk)

Move out of index.html:
- `_audioCtx` initialization
- `_noteToHz(noteStr)` frequency computation  
- `_playNote(notes, duration_ms, articulations)` function
- Staccato 50% sustain logic
- Web Audio envelope (attack/decay)

Result: index.html calls `audioEngine.play(ev.notes, ev.duration_ms, ev.articulations)` from `onEventEnter`.

**Step 2 — Extract song loading to `src/song-loader.js`** ✅ DONE (Session 46)

Extracted: `loadSong()`, tempo button management, parts bar rebuilding, segment resolution.
Added: `_resolveSegments()` and `_resolveSegmentMs()` for learning_segments bar+beat → t_ms.
index.html: 916 lines (down from 992) after extraction.

**Step 3 — Extract learning controls wiring to `src/learning-controls.js`** (Low effort, low risk)

Move out of index.html:
- `_syncLearningControls()` function
- Tempo button creation and selection sync
- Parts bar rendering
- Hand-filter button delegation

**What stays in index.html after extraction:**
- Engine instantiation
- Runtime callback wiring (the fan-out block)
- User input → runtime control mapping
- High-level `loadSong()` call (song source only)
- Toast notification helper

**Target:** index.html ~400 lines (HTML + CSS + thin shell JS), down from 991.

---

### Priority 3 — Audio Clock Reconciliation (Before Stage 3 / Pitch Sync)

**Issue (R1):** `_playNote()` uses `_audioCtx.currentTime` (Web Audio's wall clock) to schedule note envelopes. RuntimeEngine uses `performance.now()` (browser's RAF wall clock). These are two independent clocks. Under CPU load or tab throttling, they can skew.

**Current impact:** Low at MVP scale. Audio attacks are triggered at the right moment by `onEventEnter` (which fires when runtime says `t_ms <= currentTime`). The envelope duration (`_audioCtx.currentTime + duration`) is accurate relative to Web Audio's clock. The problem only manifests as audio note length mismatch — a very subtle drift.

**Fix (when needed):**
```javascript
// In audio-engine.js, reconcile the two clocks at each play() call:
let _runtimeStartMs   = 0;  // runtime.currentTime when we started
let _audioStartTime   = 0;  // _audioCtx.currentTime at the same moment

audioEngine.syncClocks = (runtimeMs) => {
  _runtimeStartMs = runtimeMs;
  _audioStartTime = _audioCtx.currentTime;
};

// Then in note scheduling:
const audioOffset = (ev.t_ms - _runtimeStartMs) / 1000;  // seconds
const audioStart  = _audioStartTime + audioOffset;
```

This aligns Web Audio scheduling to the runtime song-time reference.

**When to implement:** When pitch detection (`pitch-engine.js`) joins and needs sample-accurate audio positioning. Not needed now.

---

### Priority 4 — Multi-Subscriber Callbacks (When Gameplay-Engine Joins)

**Issue (R5):** RuntimeEngine has one callback slot per event type. When Stage 2 adds `gameplay-engine.js`, the ui-shell must fan out manually:

```javascript
runtime.onEventEnter(ev => {
  // Slot already used by presentation fan-out
  renderer.highlight(...);
  audioEngine.play(...);
  learningState.notifyEventEnter(ev);
  // Adding gameplay here is fine for Checkpoint 2
  gameplayEngine.evaluateEnter(ev);  // ← just add it here
});
```

**Current approach is sufficient for Checkpoint 2.** A formal EventEmitter-style multi-subscriber API is only needed when:
- 4+ distinct systems need `onEventEnter`
- Some subscribers need conditional isolation (e.g., Stage 2 only, not Stage 1)
- The fan-out block in index.html exceeds ~50 lines per callback

At that point, consider:
```javascript
// runtime-event-bus.js (future)
class RuntimeEventBus {
  constructor(runtime) {
    this._subscribers = { enter: [], exit: [], update: [], end: [] };
    runtime.onEventEnter(ev => this._subscribers.enter.forEach(fn => fn(ev)));
    // ...
  }
  subscribe(type, fn) { this._subscribers[type].push(fn); return this; }
}
```

**When to implement:** When Stage 2 fan-out block becomes unwieldy. Not now.

---

### Priority 5 — Lookahead Buffer (Stage 3 / Advanced Sync)

**Not needed now.** RuntimeEngine fires `onEventEnter` at `t_ms` exactly (within one tick ≈ 16ms). This is sufficient for Stage 1 and Stage 2 educational timing.

Stage 3 (Sight Play with real-time pitch detection) may benefit from a lookahead: "Tell the renderer about the next note 200ms early so it can pre-highlight."

**When to implement:** Designed as an extension point in `runtime-contract.md §10.3`. Not yet.

---

## 5. Regression Risk Analysis

| Migration step | Notation regression risk | Playback regression risk | Priority |
|----------------|--------------------------|--------------------------|----------|
| P1a–P1c: Documentation | Zero | Zero | Now |
| P2a: Extract audio-engine | Zero (notation untouched) | Low — audio behavior must match exactly | Before CP2 |
| P2b: Extract song-loader | Zero | Zero | Before CP2 |
| P2c: Extract learning-controls | Zero | Zero | Before CP2 |
| P3: Audio clock reconciliation | Zero | Medium — subtle timing change | Before pitch sync |
| P4: Multi-subscriber callbacks | Zero | Low — fan-out refactor | When 4+ subscribers |
| P5: Lookahead buffer | Zero | Medium — pre-enter timing | Stage 3 |

**Layer 3 freeze is unaffected by all migration steps.** All notation engraving systems (tie, slur, staccato, beam, stem, accidental) live in `notation-renderer.js` and are not touched by any of the above.

---

## 6. What Must Never Change Without Explicit Decision

These behaviors are the stable runtime contract foundation. Any change triggers a full regression validation:

| Behavior | Defined in | Protected since |
|----------|-----------|-----------------|
| `_processEnters()` fires before `_processExits()` per tick | runtime-contract.md §7 | Session 1 |
| `stop()` does NOT fire exits | runtime-contract.md §4.4 | Session 1 |
| `seek()` fires exits for all active events | runtime-contract.md §4.4 | Session 1 |
| `onEventEnter` fires at first tick where `t_ms <= currentTime` | runtime-contract.md §4.2 | Session 1 |
| `onEventExit` fires at first tick where `t_ms + duration_ms <= currentTime` | runtime-contract.md §4.3 | Session 1 |
| Events are passed by reference (not cloned) to callbacks | runtime-contract.md §4.1 | Session 1 |
| `duration_ms` and `t_ms` are never recalculated by runtime | runtime-contract.md §5.4 | Session 1 |
| Presentation layers must never call play/pause/stop/seek from callbacks | runtime-contract.md §7 | Session 1 |

---

## 7. Next Phase: Checkpoint 2 Integration Readiness

The architecture is ready for Checkpoint 2 **without runtime changes**. The sequence is:

1. ✅ Session 43: Rollback annotation experiment (done)
2. ✅ Session 44: Formal freeze checkpoint (done)
3. ✅ Session 45: Runtime integration audit + roadmap (this session)
4. ◻ Extract `audio-engine.js` from index.html (Priority 2a)
5. ◻ Implement `gameplay-engine.js` as a new runtime callback consumer
6. ◻ Implement `hint-engine.js` (separate RAF loop, not a runtime callback)
7. ◻ Implement Stage 2 UI (answer input, visual feedback, score display)

Steps 4–7 can proceed in any order. Step 4 is recommended first to reduce index.html complexity before gameplay logic is added.

---

*Companion documents: `docs/runtime-contract.md`, `docs/engraving-standards.md §10`, `DEVLOG.md Sessions 1–45`*
