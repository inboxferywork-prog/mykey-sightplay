# RuntimeEngine — Public Contract

**File:** `src/runtime-engine.js`
**Role:** Layer 1 — Timeline Authority (SPEC Bagian 3.4)
**Version:** Checkpoint 1 (2026-05-17)

---

## 1. Identity

RuntimeEngine is the **single source of truth** for song time and event state.

**Owns exclusively:**
- `currentTime` — song-time position in ms
- `state` — playback state machine
- `activeEvents` — set of events currently inside their time window
- `scopeStart / scopeEnd` — active playback range

**Knows:** song timeline, event metadata, timing state.

**Does NOT know:** SVG, DOM, VexFlow, scoring, audio waveform, hint animation, pitch detection.

No other engine may read or write these values. All communication is **one direction only**: RuntimeEngine → callbacks → other engines.

---

## 2. Public API

### 2.1 Lifecycle

```javascript
const rt = new RuntimeEngine();
rt.load(songData);    // must be called before play()
rt.stop();            // resets to idle, tempoScale reset to 1.0
```

**`load(songData)`**
- Accepts a parsed `song.json` object (not a URL, not a string).
- Flattens `score.bars[].beats[]` into an internal sorted event array.
- Resets state to `idle`, `currentTime = 0`.
- Throws if `songData.score.bars` is absent.
- Returns `this` (chainable).

---

### 2.2 Playback Control

```javascript
rt.play()
rt.play({ partId: 'part_1' })
rt.play({ tempoScale: 0.5 })
rt.play({ partId: 'part_2', tempoScale: 0.63 })
rt.play({ start_ms: 4167, end_ms: 10833 })          // segment-scoped (Session 47+)
rt.play({ start_ms: 24167, end_ms: Infinity })       // to end of song

rt.pause()
rt.stop()
rt.seek(time_ms)
rt.setTempo(scale)
```

**`play(options?)`**

| Condition at call time | Behavior |
|---|---|
| `state === 'playing'` | No-op (already running) |
| `state === 'paused'` | Resume from `currentTime` — scope, tempoScale, and enterIdx are preserved |
| `state === 'idle'` or `'ended'` | Fresh start — scope reset, `currentTime = scopeStart`, enterIdx rewound |

Options resolved before state transition:
- `options.tempoScale` — calls `setTempo(scale)` before starting.
- `options.start_ms` / `options.end_ms` — sets scope directly to `[start_ms, end_ms]` (fresh start only). Used by segment-scoped playback. If `end_ms` is omitted, defaults to song duration. Takes priority over `partId`.
- `options.partId` — applies part scope via bar lookup (fresh start only, ignored on resume). Ignored when `start_ms` is provided.

**`pause()`**
- Only effective when `state === 'playing'`.
- Cancels the RAF/timeout tick. `currentTime` freezes at current position.
- Does **not** fire `onEventExit` for active events — they remain active.
- All active events resume normally when `play()` is called again.

**`stop()`**
- Cancels tick, resets `currentTime = 0`, clears `activeEvents`, resets `tempoScale = 1.0`.
- State → `idle`.
- Does **not** fire `onEventExit` for currently active events.
- After `stop()`, the next `play()` is always a fresh start.

**`seek(time_ms)`**
- May be called in any state.
- Fires `onEventExit` for **all** currently active events before repositioning.
- Clamps `time_ms` to `[scopeStart, scopeEnd]`.
- Repositions `enterIdx` via binary search.
- If called while `playing` → pauses, seeks, resumes automatically.
- If called while `paused` or `idle` → repositions only; does **not** auto-play.
- Returns `this` (chainable).

**`setTempo(scale)`**
- `scale = targetBPM / nativeBPM`.
- Clamped to minimum `0.05` (safety floor, prevents freeze).
- Takes effect on the **next tick** — does not retroactively adjust current tick delta.
- Returns `this` (chainable).
- May be called while playing — takes effect immediately next tick.

| Tempo button | scale at native 72 BPM |
|---|---|
| Easy (Largo ~36 BPM) | 0.50 |
| Grave (~45 BPM) | 0.63 |
| Andante (72 BPM) | 1.00 |
| Moderato (~100 BPM) | 1.39 |

---

### 2.3 State Getters

```javascript
rt.state        // 'idle' | 'playing' | 'paused' | 'ended'
rt.currentTime  // song-time in ms (float)
rt.duration     // total song duration in ms (t_ms + duration_ms of last event)
rt.scopeStart   // start of active playback range in ms
rt.scopeEnd     // end of active playback range in ms
```

All are read-only. Do not write to these from outside the engine.

---

### 2.4 Callback Registration

```javascript
rt.onEventEnter(fn)     // fn(event) — event window opened
rt.onEventExit(fn)      // fn(event) — event window closed
rt.onTimelineUpdate(fn) // fn(currentTime_ms) — every tick
rt.onEnd(fn)            // fn() — scope exhausted, playback finished

// All return `this` for chaining:
rt.onEventEnter(fn).onEventExit(fn).onTimelineUpdate(fn).onEnd(fn);
```

Each slot holds **one callback**. Registering a second callback overwrites the first. This is intentional — see Section 9 (Future Extension Points) if multi-subscriber is needed.

Callbacks are never called after `stop()` returns. Callbacks may be called during `seek()` (`onEventExit` for active events at seek time).

---

## 3. State Machine

```
         load()
           │
         [idle] ◄──────────────── stop()
           │                          ▲
         play()                       │ stop() from any state
           │                          │
        [playing] ──── pause() ──► [paused]
           │               ▲           │
           │               └─ play() ──┘
           │
     scope exhausted
           │
        [ended] ──── play() ──► [playing] (fresh start)
```

**Transitions:**

| From | Trigger | To | Notes |
|---|---|---|---|
| `idle` | `play()` | `playing` | Fresh start, scope set |
| `playing` | `pause()` | `paused` | Tick cancelled, position frozen |
| `paused` | `play()` | `playing` | Resume from frozen position |
| `playing` | scope end reached | `ended` | All remaining active events exited |
| `ended` | `play()` | `playing` | Fresh start |
| any | `stop()` | `idle` | Full reset, tempoScale reset |
| `playing` | `seek()` | `playing` | Pause → reposition → resume |
| `paused` | `seek()` | `paused` | Reposition only |
| `idle` | `seek()` | `idle` | Reposition only |

---

## 4. Event Lifecycle

### 4.1 Event Object (from song.json)

```javascript
{
  id:           "ev_000001",   // permanent, unique
  bar:          1,
  beat:         1,
  clef:         "treble",      // "treble" | "bass"
  type:         "note",        // "note" | "chord" | "rest"
  notes:        ["C4"],        // absent for rests
  duration:     "q",           // notation string
  duration_ms:  833,           // authoritative — engine does NOT recalculate
  t_ms:         0,             // authoritative — engine does NOT recalculate
  finger:       null,          // 1–5 or null
  tie_start:    false,
  tie_stop:     false,
  pair_with_id: "ev_000031",   // optional — simultaneous partner in other clef
  tolerance_cents: 50
}
```

The engine passes the raw event object directly to callbacks. It does not copy or transform it.

### 4.2 Enter Condition

An event enters (fires `onEventEnter`) on the **first tick** where:

```
event.t_ms <= currentTime
AND event.t_ms >= scopeStart
AND event.t_ms <  scopeEnd
```

All events satisfying this condition in one tick enter **in the same tick**, in sorted order (by t_ms, treble before bass at equal t_ms).

### 4.3 Exit Condition

An event exits (fires `onEventExit`) on the **first tick** where:

```
event.t_ms + event.duration_ms <= currentTime
```

Or when forced by scope end (`_finishScope`) or `seek()`.

### 4.4 Forced Exits

Three situations force `onEventExit` regardless of `duration_ms`:

| Trigger | Which events | Notes |
|---|---|---|
| `seek()` called | All currently active | Fired synchronously before repositioning |
| Scope end reached | All remaining active | Fired at `currentTime = scopeEnd` |
| ~~`stop()`~~ | **None** | `stop()` does NOT fire exits — caller must clear its own state |

**Note on `stop()`:** The engine clears `activeEvents` on stop without firing exits. This is intentional — stop is a hard reset, not an orderly shutdown. Engines that maintain visual state (notation-renderer, hint-engine) must call their own `clearAll()` in response to `onEnd` or a separate stop event from ui-shell.

**Presentation-layer cleanup requirement for stop():** Because `stop()` does not fire exits, every presentation-layer module that holds visual state (highlights, keyboard keys, progress bar) MUST explicitly clear that state when the ui-shell calls `stop()`. The ui-shell is responsible for this fan-out:

```javascript
runtime.stop();
renderer.clearAll();       // required — runtime does not fire clearHighlight per event
keyboardViz.clear();       // required — same reason
_updateProgress(0);        // required — progress bar does not auto-reset
```

Any new presentation-layer module added in future must have its `clearAll()` or `clear()` called from this same fan-out block. **Omitting it causes stale visual state after stop.**

By contrast, `seek()` fires `onEventExit` for all active events automatically — the presentation layer reacts to those callbacks and clears state without any additional ui-shell work. This asymmetry is intentional: stop is catastrophic reset, seek is orderly repositioning.

### 4.5 Enter/Exit in the Same Tick

If a single tick advances `currentTime` enough that an event both enters and exits (possible at high `tempoScale`), the order within that tick is:

```
_processEnters() → _processExits() → onTimelineUpdate()
```

So the event will fire `onEventEnter` then `onEventExit` in the same tick. At native BPM (`tempoScale = 1.0`), minimum note duration is a 32nd note ≈ 104ms at 72 BPM, far exceeding one tick (~16ms). Same-tick enter+exit only occurs at very high tempoScale values and is benign.

**Critical implication for presentation-layer modules:** Because enters are always processed BEFORE exits in each tick, the following rule applies at beat boundaries where one event exits and the next event enters at the same `t_ms`:

1. New event enters → `onEventEnter` fires → presentation module shows label/highlight/key for new event
2. Old event exits → `onEventExit` fires → presentation module MUST NOT clear state placed by step 1

Therefore: **presentation-layer modules must NOT call their global clear functions from `onEventExit`.** Doing so destroys state that was just set by `onEventEnter` in the same tick. The correct pattern:
- On enter: clear-then-replace (if replacing existing state)
- On exit: clear only state owned by the exiting event (by eventId), never global state
- On stop/reset/end: call global clear explicitly from the ui-shell

This contract was discovered empirically (Session 43 note-label rollback). It is now a documented invariant.

---

## 5. Timing Guarantees

### 5.1 Song Time Formula

```
currentTime += wallClockDelta × tempoScale   (each tick)
```

`wallClockDelta` is measured via `performance.now()` (browser) or `Date.now()` (Node.js fallback). There is no audio clock sync. The timeline is wall-clock driven.

### 5.2 Tick Rate

- Browser: `requestAnimationFrame` ≈ 16.67ms at 60fps (browser-managed).
- Node.js: `setTimeout(..., 16)` ≈ 16ms (OS-scheduled, less precise).

### 5.3 Event Detection Latency

Events are detected **on the tick boundary**, not at the exact moment `t_ms` is crossed. Maximum detection latency per event:

```
max_latency = one_tick_period × tempoScale
            ≈ 16ms × 1.0 = 16ms at native BPM (60fps browser)
```

At 72 BPM, a quarter note = 833ms. Detection latency of 16ms = ~2% of note duration. Acceptable for educational timing.

There is no sub-tick interpolation and no predictive lookahead in the current implementation.

### 5.4 `t_ms` and `duration_ms` Are Authoritative

The engine **never recalculates** timing. All `t_ms` and `duration_ms` values come directly from `song.json`, produced by `mxl_to_song.py` using `music21` offset arithmetic. Engine does not know BPM, time signature, or quarter length.

### 5.5 Cumulative Drift

`currentTime` accumulates floating-point wallClock deltas. At native BPM over a typical lesson piece (2–5 minutes), accumulated float drift is negligible (<1ms). Over very long sessions (>30 minutes continuous), drift remains in single-digit ms due to floating-point precision of `Number` (64-bit IEEE 754).

---

## 6. Part Scope Rules

When `play({ partId })` is called (fresh start only):

1. Engine finds the `parts[]` entry matching `partId`.
2. Collects all events whose `bar` is in `part.bars`.
3. `scopeStart = t_ms` of the **first** event in those bars.
4. `scopeEnd   = t_ms + duration_ms` of the **last** event in those bars.
5. `currentTime` is set to `scopeStart`.

```
Events in scope:   t_ms >= scopeStart  AND  t_ms < scopeEnd
Events skipped:    t_ms < scopeStart   OR   t_ms >= scopeEnd
```

**Important:** scope is computed from event positions, not from bar boundary math. If the last event in a part spans across the scopeEnd (long tie or held chord), it is force-exited at `scopeEnd` by `_finishScope`.

**`seek()` within a part:** `time_ms` is clamped to `[scopeStart, scopeEnd]`. Seeking outside the active part scope is not possible without calling `play()` again.

**Part scope on resume:** calling `play()` after `pause()` does **not** re-apply part scope. Scope is only set on a fresh start.

---

## 7. Callback Order (Per Tick)

Within one tick, the dispatch order is fixed:

```
1. _processEnters()       → fires onEventEnter(ev) for each newly entered event
2. _processExits()        → fires onEventExit(ev) for each expired event
3. onTimelineUpdate(time) → fired once with currentTime after enter+exit processing
```

At scope end (the final tick):

```
1. currentTime clamped to scopeEnd
2. _processEnters()   → last batch of enters at boundary
3. _processExits()    → last batch of exits
4. onTimelineUpdate() → final update
5. _finishScope()     → force-exits all remaining active events → onEnd()
```

**Callback re-entrancy:** calling `play()`, `pause()`, `seek()`, or `stop()` from inside a callback is **not safe** and produces undefined behavior. Schedule such calls via `setTimeout(0)` or `requestAnimationFrame` from within callbacks.

---

## 8. Invariants

These must hold at all times after `load()`:

1. **Single timeline owner.** Only `RuntimeEngine` updates `currentTime`. All other engines read `currentTime` only via the `currentTime` getter or the `time` argument of `onTimelineUpdate`.

2. **No double-enter.** An event with id `X` fires `onEventEnter` at most once per playback pass. Once entered, it is tracked in `activeEvents` until exited.

3. **Exit always follows enter.** Every `onEventEnter` call will eventually be matched by exactly one `onEventExit` call — either via normal expiry, `seek()`, `_finishScope()`. Exception: `stop()` does NOT fire exits (see Section 4.4).

4. **`_events` is sorted and immutable after load.** Sort order: ascending `t_ms`, treble before bass at equal `t_ms`. The array is never modified post-load. Events are objects from the original `song.json`; they are not cloned.

5. **`activeEvents` is consistent with `currentTime`.** If an event is in `activeEvents`, then `event.t_ms <= currentTime` and `event.t_ms + event.duration_ms > currentTime` (approximately — within one tick tolerance).

6. **tempoScale ≥ 0.05.** Enforced by `setTempo()`. Prevents zero or negative advancement.

7. **`scopeStart <= currentTime <= scopeEnd` while playing.** `seek()` enforces this. `_tick()` clamps at `scopeEnd`.

8. **`duration_ms > 0` for all events in `_events`.** Guaranteed by `validate_song.py`. The engine does not re-validate; it trusts the contract.

---

## 9. What RuntimeEngine Does NOT Do

| Concern | Who owns it |
|---|---|
| Render notation (VexFlow, SVG, canvas) | `notation-renderer.js` |
| Highlight note visually | `notation-renderer.js` |
| Detect pitch from microphone | `pitch-engine.js` |
| Judge note correctness | `gameplay-engine.js` |
| Track score, streak, stars | `gameplay-engine.js` |
| Show hint overlays | `hint-engine.js` |
| Fetch or decode audio | `ui-shell (index.html)` |
| Fetch `song.json` from server | `ui-shell (index.html)` |
| Move playback based on user input | nobody — timeline does not follow user |

The runtime receives no input from pitch-engine, gameplay-engine, or hint-engine. Data flows one way: `runtime → callbacks → other engines`.

---

## 10. Future Extension Points

These behaviors are **not implemented** in Checkpoint 1 and must not be assumed to exist. Listed here so future sessions know where to extend without breaking invariants.

### 10.1 Loop Playback
```javascript
// Not yet implemented
rt.play({ partId: 'part_1', loop: true })
```
When `_finishScope()` fires, instead of transitioning to `ended`, reset `currentTime = scopeStart` and rewind `enterIdx`. Exit all active events at scope end before rewinding (same as current `_finishScope` flow).

### 10.2 Multiple Callback Subscribers
Current design: one callback per event type. If notation-renderer AND gameplay-engine both need `onEventEnter`, the ui-shell must fan out manually:
```javascript
rt.onEventEnter(ev => {
  renderer.highlightNote(ev.id, 'active');
  gameplay.evaluateEnter(ev);
});
```
A future `EventEmitter`-style API (`.addEventListener('enter', fn)`) would be a backwards-compatible addition, but adds complexity. Defer until there are 3+ subscribers per event type.

### 10.3 Lookahead Buffer
Pre-emit `onEventEnter` N milliseconds before `t_ms` is reached, so notation-renderer can prepare SVG elements before they become visible. Would require a separate "lookahead" callback and a second internal pointer. Current design fires enters at `t_ms`, not before.

### 10.4 AudioWorklet Clock Sync
Current clock: `performance.now()` via RAF. Future upgrade: sync `currentTime` to an `AudioContext.currentTime` counter (sample-accurate, off-main-thread) for tighter audio alignment. Interface remains the same — only `_tick()` and `_now()` change.

### 10.5 Tempo Automation
Smooth tempo changes over time (gradual accelerando/ritardando):
```javascript
rt.setTempoAt(scale, atSongTime_ms, durationMs)
```
Would require a tempo envelope instead of a scalar. Internal `_tick()` would interpolate `tempoScale` per tick. The callback API is unchanged.

### 10.6 Precision Jitter Compensation
Current design: each tick uses the actual wall-clock delta (`performance.now()` diff). High-frequency jitter (GC pauses, tab visibility changes) can cause larger-than-expected deltas. A future "smoothed delta" approach (exponential moving average of recent deltas, capped at 2× expected tick period) would reduce jitter impact without changing the public API.

---

## 11. Integration Pattern (for other engines)

```javascript
// ui-shell wires engines together (index.html)

const rt = new RuntimeEngine();
rt.load(songData);

// notation-renderer listens to enter/exit
rt.onEventEnter(ev => renderer.highlightNote(ev.id, 'active'));
rt.onEventExit(ev  => renderer.clearHighlight(ev.id));

// progress bar reads onTimelineUpdate
rt.onTimelineUpdate(t => {
  progressBar.style.width =
    ((t - rt.scopeStart) / (rt.scopeEnd - rt.scopeStart) * 100) + '%';
});

// start Stage 1 Explore
rt.play({ partId: 'part_1', tempoScale: 1.0 });
```

Other engines **must not** call `rt.play()`, `rt.pause()`, `rt.seek()`, or `rt.stop()`. Only ui-shell drives playback control in response to user actions.
