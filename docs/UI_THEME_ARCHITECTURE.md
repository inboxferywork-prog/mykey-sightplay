# UI Theme Architecture
## MyKey SightPlay — Presentation Layer Reference

**Status:** Active architecture — stabilization + product shaping phase  
**Last updated:** 2026-05-25  
**Scope:** Presentation layer only. Runtime, playback, and renderer semantics are separate.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Layers](#2-architecture-layers)
3. [File Ownership](#3-file-ownership)
4. [What Was Refactored](#4-what-was-refactored)
5. [Safe vs Dangerous Edits](#5-safe-vs-dangerous-edits)
6. [How to Create a New Theme](#6-how-to-create-a-new-theme)
7. [Theme Development Rules](#7-theme-development-rules)
8. [Semantic Highlight System](#8-semantic-highlight-system)
9. [Future Theme Ideas](#9-future-theme-ideas)
10. [Future Roadmap](#10-future-roadmap)
11. [Claude Code Task Templates](#11-claude-code-task-templates)

---

## 1. Overview

MyKey SightPlay has completed a **presentation-layer architectural refactor** that separates visual styling from application structure and runtime logic.

### Why This Matters

Before the refactor, the project had:
- A 638-line inline `<style>` block in `index.html`
- CSS injected dynamically at runtime from three JavaScript modules
- Hardcoded color values embedded in JS logic
- No clean mechanism for theme switching
- Fragmented visual ownership across HTML, JS, and partial CSS files

After the refactor, the project has:
- A two-file CSS system: **structural foundation** + **visual theme**
- Zero runtime CSS injection from JS modules
- Semantic CSS classes driven by theme variables
- A clear, scalable multi-theme architecture
- Complete separation between runtime semantics and visual presentation

### Project Phase

The project is currently in **stabilization + product shaping phase**:
- Core runtime (playback, timing, rendering) is frozen and stable
- Presentation layer is now cleanly separated and ready for iteration
- Multiple themes can be developed without touching any runtime code
- New themes are safe to create, test, and ship independently

---

## 2. Architecture Layers

The UI system has three distinct layers. Each has explicit ownership and must not cross into another layer's responsibilities.

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 3 — Theme Layer                                  │
│  themes/aurora-piano.css  themes/children-fun.css       │
│  Visual identity: colors, gradients, glow, shadows      │
├─────────────────────────────────────────────────────────┤
│  LAYER 2 — Structural UI Layer                          │
│  themes/base-ui.css                                     │
│  Layout, spacing, component geometry, CSS variables     │
├─────────────────────────────────────────────────────────┤
│  LAYER 1 — Runtime Layer                                │
│  src/runtime-engine.js  src/notation-renderer.js        │
│  src/learning-state.js  src/keyboard-viz.js             │
│  Semantic state only. No visual colors. No style inject.│
└─────────────────────────────────────────────────────────┘
```

### Layer 1 — Runtime Layer

**Files:** `src/runtime-engine.js`, `src/notation-renderer.js`, `src/learning-state.js`, `src/keyboard-viz.js`, `src/practice-loop.js`, `src/song-loader.js`

**Owns:**
- Playback timing and event scheduling
- Score rendering (VexFlow SVG generation)
- Semantic state (which clef is active, which notes are playing)
- DOM class application (adds/removes semantic class names only)
- No visual colors, no gradient values, no hardcoded hex codes

**Must NOT:**
- Inject `<style>` tags dynamically
- Set inline color properties (`el.style.color = ...`)
- Set inline CSS variables with color values (`el.style.setProperty('--color', '#hex')`)
- Hardcode visual appearance decisions

### Layer 2 — Structural UI Layer

**File:** `themes/base-ui.css`

**Owns:**
- All layout (flex, grid, positioning)
- Spacing (padding, margin, gap)
- Component geometry (border-radius, sizing)
- Typography scale (font-size, font-weight)
- Keyboard key dimensions (width, height — matched to JS constants)
- CSS custom property defaults (neutral fallback values)
- Semantic highlight class definitions (`.nk-note-active-rh`, `.nk-kb-active-lh`, etc.)
- Generic transitions and interaction structure

**Must NOT:**
- Define final visual colors (themes override the variables)
- Contain brand-specific gradients or decorative effects
- Be modified when creating a new theme

### Layer 3 — Theme Layer

**Files:** `themes/aurora-piano.css`, `themes/children-fun.css`, *(future themes)*

**Owns:**
- All color decisions
- Gradients and background textures
- Box shadows and glow effects
- Decorative visual identity
- Theme-specific font styling
- Override of semantic CSS variables

**Must NOT:**
- Redefine layout or spacing (that belongs to base-ui.css)
- Change keyboard geometry
- Alter component structural rules

---

## 3. File Ownership

### `themes/base-ui.css` — Structural Foundation

| Category | Examples |
|---|---|
| Layout | header, app-body, score-card, kb-wrap flex rules |
| Spacing | padding, margin, gap values |
| Component geometry | border-radius, min-width, height |
| Typography sizing | font-size, font-weight, letter-spacing |
| Transitions | button hover timing, progress bar expansion |
| Default tokens | `--bg`, `--surface`, `--rh-color`, `--lh-color` etc. |
| Keyboard geometry | `.nk-kb-white` (28×96px), `.nk-kb-black` (16×60px) |
| Semantic highlight classes | `.nk-note-active-rh`, `.nk-note-active-lh`, `.nk-kb-active-rh`, `.nk-kb-active-lh` |
| Notation classes | `.nk-active`, `.nk-explore`, `.nk-dim`, `.nk-loop-start` |
| Reattack animation | `@keyframes nk-kb-reattack` |

**Rule:** This file must remain stable across all theme iterations. Never edit it to satisfy a single theme's visual requirement.

---

### `themes/aurora-piano.css` — Wood-Ivory Theme

| Category | Value |
|---|---|
| Personality | Warm, premium, classical piano aesthetic |
| Background | Dark wood gradient (`#2c2118` → `#3f2c22`) |
| RH highlight | Soft ivory-blue (`#a8c8e8`) |
| LH highlight | Warm amber (`#d48c5c`) |
| Primary button | Gold gradient (`#d4a017`) |
| Score card | Aged ivory (`#fdf8f0`) |
| Keyboard keys | Ivory white (`#f5edd8`), ebony black (`#1e1410`) |

---

### `themes/children-fun.css` — Children Fun Theme

| Category | Value |
|---|---|
| Personality | Playful, high-contrast, educational |
| Background | Deep space radial gradient (`#1a1040` → `#0d0d1a`) |
| RH highlight | Sky blue (`#5bc8f5`) |
| LH highlight | Candy pink (`#ff80c8`) |
| Primary button | Bright yellow (`#ffcc00`) |
| Score card | Clean white (`#fefefe`) |
| Keyboard keys | Soft lavender white (`#f8f4ff`), deep purple-black (`#1a1030`) |

---

### `index.html` — Structure Only

**Current state:** Fully migrated.

**Owns:**
- HTML structure and semantic hooks
- `<link>` tags loading `base-ui.css` then the active theme
- DOM IDs and class names referenced by JS (`id="songTitle"`, `class="score-card"`, etc.)
- Inline `<script>` for app initialization logic

**Must NOT contain:**
- Any `<style>` block with visual rules
- Inline `style=""` attributes beyond geometry (e.g., `style="display:none"` for JS-toggled visibility is acceptable)

---

### `authoring.html` — Partially Migrated

**Current state:** Partially migrated.

**What changed:** Loads `base-ui.css` for notation highlight classes. The `learningState._injectStyles()` call was removed.

**What remains:** `authoring.html` still contains its own inline `<style>` block for its editor-specific layout. This is acceptable because the authoring tool has a different visual structure from the player.

**Future migration path:** If the authoring tool needs theming, extract its inline styles into `themes/base-authoring.css` following the same pattern.

---

### `src/notation-renderer.js` — Notation Rendering

**Owns:**
- VexFlow SVG generation and DOM mapping
- Applying/removing semantic CSS classes on note elements
- `scrollToBar()`, `dimEvent()`, `markLoopBoundary()`

**Does NOT own:**
- Color values
- Notation style preferences
- Any visual appearance decisions

**Key contract:** `highlight(eventId, style)` applies class `nk-{style}`. The style string comes from `LearningModeState.getHighlightStyle()`. The renderer never decides what the class *looks like* — that is entirely the theme's responsibility.

---

### `src/keyboard-viz.js` — Keyboard DOM Generation

**Owns:**
- Building the piano keyboard DOM structure
- Computing pixel positions for all keys (layout math)
- Applying/removing semantic CSS classes on key elements
- Re-attack animation trigger (class toggle only)

**Does NOT own:**
- Key colors
- Glow effects
- Any CSS property values

**Key contract:** `_refresh()` applies `.nk-kb-active-rh` or `.nk-kb-active-lh` based on `entry.clef`. No inline styles, no color values. The theme CSS reads these classes and applies visual appearance.

---

### `src/learning-state.js` — Semantic Learning State

**Owns:**
- Clef filter (`both` / `treble` / `bass`)
- `getHighlightStyle(ev)` — returns semantic class name suffix
- `notifyEventEnter(ev)` — fires keyboard highlight callback with `clef` only
- Level-derived overlay rules

**Does NOT own:**
- Color values (removed)
- CSS injection (removed)
- Any visual appearance

**Key contract:** `getHighlightStyle()` returns `'note-active-rh'` or `'note-active-lh'`. The renderer applies `nk-note-active-rh` / `nk-note-active-lh`. These classes are styled entirely in CSS.

---

## 4. What Was Refactored

### Phase 1 — Extract Inline Styles (UI Theme Architecture Extraction)

**Problem:** `index.html` contained a 638-line `<style>` block. Themes could not override it reliably. CSS ownership was fragmented.

**Solution:** Created `themes/base-ui.css` and moved all structural CSS there.

| File | Change |
|---|---|
| `index.html` | Removed entire `<style>` block. Added `<link href="themes/base-ui.css">` |
| `themes/base-ui.css` | Created. Contains all layout, spacing, component, and transition rules |
| `themes/aurora-piano.css` | Rewritten as a pure theme file. Removed duplicate `:root` blocks and mixed styles |

---

### Phase 2 — Remove JS Style Injection

**Problem:** Three JS modules injected `<style>` tags at runtime, making it impossible for themes to override those styles cleanly.

| Module | What it injected | Where it went |
|---|---|---|
| `notation-renderer.js` | `.nk-active`, `.nk-explore`, `.nk-dim`, `.nk-loop-*` | `themes/base-ui.css` |
| `learning-state.js` | `.nk-active-treble`, `.nk-active-bass` | `themes/base-ui.css` |
| `keyboard-viz.js` | `.nk-kb-white`, `.nk-kb-black`, `.nk-kb-active`, keyboard variables | `themes/base-ui.css` |

**Changes:**
- `notation-renderer.js`: removed `_injectStyles()` function and its call in `render()`
- `learning-state.js`: removed `_injectStyles()` method
- `keyboard-viz.js`: removed `_injectStyles()` method and its call in `render()`
- `authoring.html`: removed orphaned `learningState._injectStyles()` call; added `base-ui.css` link

---

### Phase 3 — Semantic Highlight Ownership (Semantic Highlight Theme Ownership)

**Problem:** JS modules hardcoded color hex values (`#4a9eff`, `#e06830`) as inline CSS properties. This made keyboard key colors impossible to theme — inline styles override any CSS rule.

**Root cause:** `learning-state.js` computed colors from a `HAND_COLOR` JS constant, passed them to `keyboard-viz.js` via payload, which then called `el.style.setProperty('--nk-key-active-color', color)`. Inline styles cannot be overridden by external CSS.

**Solution:** Replace color-carrying payload with semantic clef identity. JS applies CSS classes; CSS applies colors.

| File | What changed |
|---|---|
| `learning-state.js` | `getHighlightStyle()` returns `'note-active-rh'`/`'note-active-lh'`. Payload no longer carries color. `HAND_COLOR` constant removed (dead code). |
| `keyboard-viz.js` | `_activeKeys` stores `clef` instead of `color`. `_refresh()` applies `.nk-kb-active-rh`/`.nk-kb-active-lh`. No inline style setting. |
| `notation-renderer.js` | Class list updated: `nk-active-treble`/`nk-active-bass` → `nk-note-active-rh`/`nk-note-active-lh` |
| `themes/base-ui.css` | Added `--rh-color`, `--lh-color`, `--rh-key-color`, `--lh-key-color`, `--rh-glow`, `--lh-glow`. Notation and keyboard classes use these variables. |
| `themes/aurora-piano.css` | Overrides new semantic variables. Keyboard glow rules use `nk-kb-active-rh`/`nk-kb-active-lh`. |
| `themes/children-fun.css` | Created. Full children-friendly theme with sky-blue RH and candy-pink LH. |

---

## 5. Safe vs Dangerous Edits

### ✅ Safe — Presentation Layer Only

These changes affect only how the app *looks*. Runtime behavior is unaffected.

| Action | Why It's Safe |
|---|---|
| Edit colors in a theme file | Only CSS variables change |
| Change gradients or shadows | Visual only, no DOM interaction |
| Change glow intensity | `--rh-glow` / `--lh-glow` variables only |
| Change button border-radius in a theme | Overrides base-ui.css geometry locally |
| Change score card background | `--score-bg` variable |
| Create a new theme file | Additive, no existing file changes |
| Change keyboard key color | Override `--nk-white-key-bg` in theme |
| Change font size of labels in a theme | Visual only |
| Add hover effects to buttons in a theme | CSS `:hover` rules only |

---

### ⛔ Dangerous — Requires Careful Review

These changes risk breaking runtime behavior, timing, or semantic contracts.

| Action | Risk |
|---|---|
| Editing `base-ui.css` layout rules | May break all themes simultaneously |
| Changing keyboard key dimensions (28px/96px) | Must match JS constants in `keyboard-viz.js` or layout breaks |
| Adding inline `style=""` attributes in `index.html` | Overrides theme CSS, defeats architecture |
| Setting `el.style.setProperty(...)` in JS with color values | Inline styles override all external CSS — blocks theming |
| Injecting `<style>` tags from JS | Reverts the refactor; themes cannot override injected rules |
| Modifying `RuntimeEngine` | Breaks playback timing — frozen contract |
| Modifying `PracticeLoop` loop semantics | Breaks segment isolation contract |
| Changing `notation-renderer.js` highlight class names | Must update `learning-state.js`, `base-ui.css`, all themes simultaneously |
| Changing `getHighlightStyle()` return values | Must update renderer clear lists and CSS simultaneously |
| Modifying `base-ui.css` highlight class selectors | Breaks all themes that depend on them |

---

## 6. How to Create a New Theme

Creating a new theme requires editing **one file only** (the theme file). No other files need to change.

### Step-by-Step

**1. Copy an existing theme as a starting point**

```
themes/aurora-piano.css  →  themes/my-new-theme.css
```

`aurora-piano.css` is the most complete reference. `children-fun.css` shows a contrasting palette approach.

**2. Open your new theme file and update the header comment**

```css
/*
   MyKey SightPlay — Theme: My New Theme
   Scope: Visual identity ONLY.
   Structure lives in base-ui.css — do not duplicate it here.
*/
```

**3. Set your `:root` token overrides**

The minimum required overrides are:

```css
:root {
  /* Core colors */
  --bg:       /* page background */;
  --surface:  /* panel/card surface */;
  --text:     /* primary text */;
  --muted:    /* secondary text */;

  /* RH / LH semantic highlights — MUST visually differ */
  --rh-color:     /* treble notation fill */;
  --lh-color:     /* bass notation fill */;
  --rh-key-color: /* treble keyboard key */;
  --lh-key-color: /* bass keyboard key */;
  --rh-glow:      /* treble key glow (rgba) */;
  --lh-glow:      /* bass key glow (rgba) */;

  /* Keyboard physical keys */
  --nk-white-key-bg:   /* white key surface */;
  --nk-black-key-bg:   /* black key surface */;
}
```

**4. Add your visual rules**

Only override what your theme changes. Rules not present in your theme file fall back to `base-ui.css` defaults.

```css
/* Body background */
body, .app-body { background: /* your gradient */ !important; }

/* Header */
header { background: /* your header */ !important; }

/* Primary button */
.btn-primary { background: /* your button color */ !important; }

/* Keyboard glow — RH and LH must differ */
.nk-kb-white.nk-kb-active-rh,
.nk-kb-black.nk-kb-active-rh {
  box-shadow: 0 0 12px var(--rh-glow);
}
.nk-kb-white.nk-kb-active-lh,
.nk-kb-black.nk-kb-active-lh {
  box-shadow: 0 0 12px var(--lh-glow);
}
```

**5. Load your theme in `index.html`**

Replace the second stylesheet link:

```html
<link rel="stylesheet" href="themes/base-ui.css">
<link rel="stylesheet" href="themes/my-new-theme.css">  <!-- ← swap this -->
```

`base-ui.css` must always remain first and must not be removed.

**6. Test**

Open `index.html` in a browser. Verify:
- RH notation highlights use your `--rh-color`
- LH notation highlights use your `--lh-color`  
- RH keyboard keys light up differently from LH keys
- Score card remains readable
- All controls are visible and usable

---

### What You Must NOT Change When Creating a Theme

| Do not touch | Reason |
|---|---|
| `themes/base-ui.css` | Structural foundation — changes affect all themes |
| `src/*.js` | Runtime layer — no visual decisions live here |
| `index.html` structure | DOM hooks are referenced by JS by ID/class |
| Keyboard key dimensions | Must match JS constants |
| Semantic highlight class names | Changing them requires coordinated updates across JS + CSS |

---

## 7. Theme Development Rules

### Hard Rules

**Rule 1 — Themes own colors, not structure.**
A theme file must not define `display`, `flex`, `position`, `width`, `height`, `padding`, or `margin` unless it is a deliberate visual override (e.g., a pill-shaped button radius). If layout breaks without a structural rule, that rule belongs in `base-ui.css`.

**Rule 2 — Themes must not inject JS styles.**
No theme should require changes to JS modules. If a visual effect requires JS, it is not a theme — it is a runtime feature.

**Rule 3 — RH and LH must always be visually distinct.**
`--rh-color` and `--lh-color` must never be the same value. Same for `--rh-key-color` and `--lh-key-color`. Visual hand separation is a core pedagogical requirement.

**Rule 4 — Score card must remain readable.**
The notation score is rendered by VexFlow onto whatever `--score-bg` is set to. Do not use a dark `--score-bg` unless you also update the VexFlow rendering color — which is outside the theme system.

**Rule 5 — CSS variables over hardcoded values.**
Prefer `var(--rh-color)` over `#5bc8f5`. This allows future token-level theming and dark/light mode switching.

**Rule 6 — Use `!important` sparingly.**
It is acceptable on structural overrides (`background`, `border`) where `base-ui.css` defaults would otherwise win. Do not use it on layout properties.

### Conventions

- Theme file name: `kebab-case.css` (e.g., `midnight-led.css`, `sakura-spring.css`)
- Header comment must state personality and scope
- Group rules by UI region (header, controls, keyboard, score, etc.)
- All six semantic variables must be defined: `--rh-color`, `--lh-color`, `--rh-key-color`, `--lh-key-color`, `--rh-glow`, `--lh-glow`

---

## 8. Semantic Highlight System

The highlight system is the most critical cross-layer contract in the UI architecture. Breaking it affects both visual presentation and perceived learning feedback.

### How It Works

```
RuntimeEngine fires onEventEnter(ev)
        ↓
LearningModeState.getHighlightStyle(ev)
  returns 'note-active-rh' or 'note-active-lh'
        ↓
NotationRenderer.highlight(eventId, style)
  applies class 'nk-note-active-rh' or 'nk-note-active-lh'
  on the SVG <g> element for that note
        ↓
base-ui.css defines the class rules
  .nk-note-active-rh { fill: var(--rh-color) }
  .nk-note-active-lh { fill: var(--lh-color) }
        ↓
Active theme overrides --rh-color and --lh-color
  Theme controls the final color
```

```
RuntimeEngine fires onEventEnter(ev)
        ↓
LearningModeState.notifyEventEnter(ev)
  fires onKeyHighlight({ clef: ev.clef, notes, eventId, ... })
        ↓
KeyboardViz.onHighlight(kh)
  stores { clef, eventIds } in _activeKeys
        ↓
KeyboardViz._refresh()
  applies 'nk-kb-active-rh' or 'nk-kb-active-lh'
  on each active key's DOM element
        ↓
base-ui.css defines:
  .nk-kb-active-rh { background-color: var(--rh-key-color) }
  .nk-kb-active-lh { background-color: var(--lh-key-color) }
        ↓
Theme controls --rh-key-color and --lh-key-color
```

### Semantic CSS Classes — Complete Reference

#### Notation Highlights (applied to SVG `<g>` elements)

| Class | Applied when | CSS variable used |
|---|---|---|
| `.nk-note-active-rh` | Treble (RH) note is playing | `--rh-color` |
| `.nk-note-active-lh` | Bass (LH) note is playing | `--lh-color` |
| `.nk-active` | Unified highlight (early_beginner mode) | `--nk-active-color` |
| `.nk-active-rest` | Rest event is active | `--nk-active-color` (dimmed) |
| `.nk-explore` | Explore-mode annotation | `--nk-explore-color` |
| `.nk-question` | Question-mode annotation | `--nk-question-color` |
| `.nk-dim` | Note outside beat scope | Opacity 0.18 |
| `.nk-loop-start` | Loop boundary — start mark | `--nk-loop-start-color` |
| `.nk-loop-end` | Loop boundary — end mark | `--nk-loop-end-color` |

#### Keyboard Highlights (applied to key `<div>` elements)

| Class | Applied when | CSS variable used |
|---|---|---|
| `.nk-kb-active` | Any key is active (base class) | — (structure only) |
| `.nk-kb-active-rh` | Treble (RH) note is playing on this key | `--rh-key-color` |
| `.nk-kb-active-lh` | Bass (LH) note is playing on this key | `--lh-key-color` |
| `.nk-kb-reattack` | Same key pressed again (re-attack flash) | Animation only |

#### Keyboard Note Labels (applied to `<span>` elements)

| Class | Applied when | CSS variable used |
|---|---|---|
| `.nk-kb-note-label-active` | Label is visible (base class) | — |
| `.nk-kb-note-label-active-rh` | Label for an active RH key | `--rh-key-color` |
| `.nk-kb-note-label-active-lh` | Label for an active LH key | `--lh-key-color` |

### What Themes Control

Themes control **all visual output** through these six variables:

```css
:root {
  --rh-color:     /* Treble note fill/stroke in SVG */
  --lh-color:     /* Bass note fill/stroke in SVG */
  --rh-key-color: /* Treble keyboard key background */
  --lh-key-color: /* Bass keyboard key background */
  --rh-glow:      /* Treble key box-shadow color (rgba) */
  --lh-glow:      /* Bass key box-shadow color (rgba) */
}
```

Themes also optionally override keyboard physical appearance:

```css
:root {
  --nk-white-key-bg:         /* White key resting color */
  --nk-black-key-bg:         /* Black key resting color */
  --nk-white-key-border:     /* White key border */
  --nk-middlec-color:        /* Middle C label color */
  --nk-middlec-active-color: /* Middle C label when active */
  --nk-label-color:          /* Note name label resting color */
}
```

---

## 9. Future Theme Ideas

### Beginner / Children

| Theme ID | Personality | RH Color | LH Color |
|---|---|---|---|
| `children-fun` | ✅ Exists | Sky blue | Candy pink |
| `candy-pop` | Bright, bubbly, primary colors | Bright cyan | Hot pink |
| `rainbow-notes` | Each note in a different color | Violet | Yellow-orange |
| `magical-piano` | Fairy-tale pastels, stars | Soft lavender | Soft coral |
| `crayon-box` | Hand-drawn crayon aesthetic | Royal blue | Crimson red |

### Classical

| Theme ID | Personality | RH Color | LH Color |
|---|---|---|---|
| `aurora-piano` | ✅ Exists (Wood-Ivory) | Ivory blue | Warm amber |
| `ivory-classic` | Pure ivory, monochrome keys | Deep blue | Deep burgundy |
| `concert-hall` | Velvet red, gold trim | Champagne gold | Velvet red |
| `mahogany-grand` | Dark walnut, brass hardware | Brass gold | Mahogany red |
| `mozart-manuscript` | Aged parchment, ink-wash | Prussian blue | Sepia brown |

### Modern / Electronic

| Theme ID | Personality | RH Color | LH Color |
|---|---|---|---|
| `synthwave` | 80s neon, retrowave grid | Electric purple | Hot magenta |
| `neon-stage` | Concert lighting, dark stage | Neon cyan | Neon orange |
| `cyber-practice` | Dark terminal, matrix green | Matrix green | Amber |
| `midnight-led` | Blackout performance mode | Cool white | Warm gold |
| `lo-fi-study` | Lo-fi hip hop aesthetic | Dusty blue | Muted peach |

### Minimal

| Theme ID | Personality | RH Color | LH Color |
|---|---|---|---|
| `monochrome-focus` | Pure grayscale, zero distraction | Dark gray | Medium gray |
| `paper-study` | White paper, ink notes | Dark navy | Dark red |
| `clean-white` | Maximum contrast, clinical | Pure black | Dark slate |
| `graphite-minimal` | Architectural, Swiss-style | Graphite blue | Graphite red |

### Seasonal / Cultural

| Theme ID | Personality | RH Color | LH Color |
|---|---|---|---|
| `sakura-spring` | Cherry blossom, soft pink | Petal pink | Spring green |
| `winter-recital` | Snow, ice, cool blues | Ice blue | Frost silver |
| `christmas-piano` | Holly, warm candlelight | Christmas red | Pine green |
| `ramadhan-night` | Crescent moon, lantern gold | Lantern gold | Crescent blue |
| `autumn-keys` | Falling leaves, harvest amber | Deep orange | Chestnut brown |

---

## 10. Future Roadmap

### Live Theme Switching

**Goal:** Change theme at runtime without page reload.

**Approach:** Replace the `<link>` tag's `href` attribute dynamically via JavaScript. CSS custom properties cascade immediately when a new stylesheet loads. No VexFlow re-render required since highlight classes remain in the DOM.

**Complexity:** Low. Requires a theme selector UI element and a small JS handler.

### Per-Song Themes

**Goal:** Each song in `songs/index.json` specifies a preferred theme.

**Approach:** Add `"theme": "sakura-spring"` to song metadata. `SongLoader` reads it and applies the theme on song load.

**Complexity:** Low. Theme switching is already isolated; song metadata already has an extension point.

### Per-Book / Per-Curriculum Themes

**Goal:** A curated song collection (e.g., "Level 1 Beginner Book") uses one consistent theme.

**Approach:** Theme specified in the book/curriculum metadata, applied when the book is selected.

**Complexity:** Medium. Requires curriculum metadata structure (not yet built).

### Adaptive Learning Themes

**Goal:** Theme shifts subtly based on learner performance or stage progression.

**Approach:** Stage 1 (Explore) uses one color temperature; Stage 2 (Recognize) shifts warmer; Stage 3 (Perform) uses high-contrast. All via CSS variable updates on the `:root` element.

**Complexity:** Medium. Runtime must fire a "stage changed" event; a thin presentation adapter updates variables.

### Accessibility Themes

**Goal:** High-contrast, reduced-motion, large-text theme variants for accessibility.

**Approach:**
- `high-contrast.css` — extreme contrast ratios, no gradients
- `reduced-motion.css` — removes all animations and transitions
- Loaded in addition to the base theme via a user preference flag

**Complexity:** Low to medium. CSS `prefers-reduced-motion` and `prefers-contrast` media queries can handle much of this automatically.

### Performance Mode Themes

**Goal:** A distraction-free, dark, minimal theme for serious practice sessions.

**Personality:** Almost no decorative elements, maximum focus on the score and keyboard.

**Complexity:** Low (theme file only).

### Theme Marketplace Architecture

**Goal:** Allow community-created themes to be distributed and loaded.

**Approach:** Themes are self-contained CSS files. A theme registry (JSON) lists available themes with preview thumbnails and metadata. The app fetches and caches theme files on demand.

**Complexity:** High. Requires network fetch, caching strategy, and security review of external CSS.

---

## 11. Claude Code Task Templates

### Safe Theme Task Templates

Use these prompt patterns when asking Claude Code to work on themes. They establish the correct ownership boundaries upfront.

#### Create a New Theme

```
Create a new theme file: themes/[theme-name].css

Base it on themes/aurora-piano.css as the structural reference.

Requirements:
- Personality: [describe the visual mood]
- RH (treble) color: [describe or specify — must differ from LH]
- LH (bass) color: [describe or specify — must differ from RH]

Rules:
- Only modify visual identity: colors, gradients, shadows, glow, hover effects
- Do NOT modify layout or spacing from base-ui.css
- Do NOT touch any JS files
- Do NOT touch index.html structure
- All six semantic variables must be defined:
  --rh-color, --lh-color, --rh-key-color, --lh-key-color, --rh-glow, --lh-glow
- RH and LH keyboard keys must glow differently
- Score card must remain readable
```

#### Refine an Existing Theme

```
Refine themes/[theme-name].css for the following visual changes:
[describe specific changes]

Rules:
- Only edit the theme file
- Do not touch base-ui.css, any JS files, or index.html
- Preserve all six --rh-* and --lh-* semantic variables
- Do not alter keyboard geometry or layout
```

#### Fix a Theme Visual Bug

```
In themes/[theme-name].css, [describe the visual problem].

Fix the visual issue in the theme file only.

Do NOT:
- Change base-ui.css
- Change any JS files
- Change index.html
- Change runtime behavior

Verify that RH and LH remain visually distinct after the fix.
```

---

### ⚠️ Unsafe Prompt Patterns — Avoid These

The following types of prompts risk breaking the architecture. Do not use them.

| Unsafe prompt | Why it's dangerous |
|---|---|
| "Make the keyboard highlight blue" | Too vague — may result in hardcoded JS colors |
| "Change the note highlight color in the renderer" | Touches runtime layer; renderer must not own colors |
| "Inject custom CSS for the active note" | Reverts the architecture; breaks theme override |
| "Add a glow effect by editing keyboard-viz.js" | JS must not set visual properties |
| "Change the layout of the score card" | Layout belongs to base-ui.css; may break all themes |
| "Move the keyboard to the top" | Structural change; requires base-ui.css edit + regression test |
| "Make the theme CSS apply before base-ui.css" | Load order is intentional; theme must load second |

---

### Architectural Integrity Checklist

Before submitting any UI-related change for review, verify:

- [ ] No `<style>` tags injected by JS
- [ ] No `el.style.setProperty('--color', '#hex')` calls in JS
- [ ] No `el.style.color = ...` or `el.style.background = ...` in JS
- [ ] No hardcoded hex values in `src/*.js` (except audio frequency math)
- [ ] `base-ui.css` structure is unchanged
- [ ] `--rh-color` ≠ `--lh-color` in the active theme
- [ ] `--rh-key-color` ≠ `--lh-key-color` in the active theme
- [ ] Score card remains readable
- [ ] Playback behavior is unchanged (notation renders, highlights fire, audio plays)

---

*This document is the authoritative reference for UI architecture decisions in MyKey SightPlay. For runtime contracts, see `docs/runtime-contract.md`. For notation engraving standards, see `docs/engraving-standards.md`.*
