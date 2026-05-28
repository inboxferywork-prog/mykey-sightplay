# MyKey Music Labs — UI Design System

> **Scope:** Presentation layer only. This document describes the current visual appearance, color system, typography, spacing, and component styling of `index.html`. It is the foundation for future theme experiments. It does not describe runtime behavior, playback logic, notation semantics, or data architecture.

---

## 1. Overall Layout Structure

The app is a fixed-height, single-page layout. The page never scrolls — the score area scrolls internally. Layout is a vertical flex column.

```
┌─────────────────────────────────────────┐
│  HEADER (sticky, 52px)                  │
│  brand name · song selector · authoring │
├─────────────────────────────────────────┤
│  APP BODY (flex column, max 1020px)     │
│  ┌─────────────────────────────────────┐│
│  │ SONG META (title + chips)           ││
│  ├─────────────────────────────────────┤│
│  │ STAGE STRIP (stage name · dot)      ││
│  ├─────────────────────────────────────┤│
│  │ PROGRESS BAR (3px orange line)      ││
│  ├─────────────────────────────────────┤│
│  │ CONTROLS                            ││
│  │  Row 1: Primary + Loop + Skip       ││
│  │  Row 2: Group panels (Practice,     ││
│  │          Hand, Tempo)               ││
│  ├─────────────────────────────────────┤│
│  │ SCORE CARD (white, flex:1, scrolls) ││
│  ├─────────────────────────────────────┤│
│  │ STATUS BAR (dark compact strip)     ││
│  ├─────────────────────────────────────┤│
│  │ KEYBOARD SECTION (pinned, dark)     ││
│  │  kb-header: Piano   [Note Name ▼]   ││
│  │  piano keys SVG                     ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

**Key layout properties:**
- `body`: `overflow: hidden` — viewport never scrolls
- `app-body`: `max-width: 1020px`, centered, `padding: 16px 24px 0`
- `app-body` height: `calc(100vh - 52px)` (fills below header)
- Score card: `flex: 1` — takes all remaining vertical space
- Keyboard: `flex-shrink: 0` — always visible, never pushed off screen

---

## 2. Color System

### CSS Custom Properties (`:root`)

| Variable     | Value     | Usage                              |
|--------------|-----------|------------------------------------|
| `--bg`       | `#0f0f0f` | Page background                    |
| `--surface`  | `#161616` | Button/input base background       |
| `--surface2` | `#1e1e1e` | Button hover, input backgrounds    |
| `--border`   | `#2a2a2a` | Subtle borders (dividers, edges)   |
| `--border2`  | `#444`    | Active borders (inputs, buttons)   |
| `--text`     | `#d0d0d0` | Primary text                       |
| `--muted`    | `#666`    | Secondary/label text               |
| `--orange`   | `#f0a500` | Primary accent (brand, playback)   |
| `--blue`     | `#4a9eff` | Interactive/selection accent       |
| `--green`    | `#7ec87e` | Success, positive feedback         |
| `--red`      | `#e05050` | Error, warning                     |

### Hardcoded Colors (not yet in variables)

| Context                    | Value                    |
|----------------------------|--------------------------|
| Header background          | `#111`                   |
| Score card background      | `#fff` (white — notation)|
| Score card border          | `#ccc`                   |
| Song title color           | `#e8e8e8`                |
| Progress bar track         | `#222`                   |
| Keyboard section bg        | `#141414`                |
| Toast background           | `#2a2a2a`                |
| Status bar label color     | `#3c3c3c`                |

### Group Panel Color Identity

Each control group has its own color identity using gradients and tinted borders.

| Group         | BG Gradient                                        | Border Tint                        | Label BG                              | Label Text  |
|---------------|----------------------------------------------------|------------------------------------|---------------------------------------|-------------|
| PRACTICE PART | `rgba(90,50,140,0.20)` → `rgba(60,25,100,0.10)`   | `rgba(130,80,200,0.20)` — purple   | `#7c4db8` → `#5a3490` — purple       | `#e8d8ff`   |
| HAND          | `rgba(28,74,135,0.20)` → `rgba(18,52,105,0.10)`   | `rgba(58,118,190,0.20)` — blue     | `#2575b5` → `#1a558a` — blue         | `#cce4ff`   |
| TEMPO         | `rgba(95,58,18,0.20)` → `rgba(72,42,12,0.10)`     | `rgba(148,92,34,0.20)` — amber     | `#9a6318` → `#725010` — amber        | `#ffd8a0`   |
| NOTE NAME†    | `rgba(20,76,66,0.20)` → `rgba(14,58,50,0.10)`     | `rgba(38,120,105,0.20)` — teal     | `#268270` → `#1a6358` — teal         | `#b8fbe8`   |

† NOTE NAME group CSS is still defined but the control is now displayed inline in the keyboard header, not as a full group panel.

### Hand / Clef Identity Colors

| Hand    | Accent Color         |
|---------|----------------------|
| Both    | `--orange` `#f0a500` |
| RH (treble) | `#4a9eff` — blue |
| LH (bass)   | `#e06830` — warm orange-red |

### Segment / Learning Accent

| State        | Color                                          |
|--------------|------------------------------------------------|
| Active segment btn | `border: var(--blue)`, `color: var(--blue)`, `bg: rgba(74,158,255,0.10)` |
| Seg mode badge | `color: var(--blue)`, `bg: rgba(74,158,255,0.12)`, `border: rgba(74,158,255,0.30)` |

---

## 3. Typography

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

System sans-serif stack — renders as SF Pro (Mac), Segoe UI (Windows), Roboto (Android).

### Size Scale

| Element                  | Size   | Weight | Color          | Notes                      |
|--------------------------|--------|--------|----------------|----------------------------|
| Brand name               | 15px   | 700    | `--orange`     | Letter-spacing 0.3px       |
| Song title               | 15px   | 600    | `#e8e8e8`      | (was 18px before compact)  |
| Primary button           | 14px   | 700    | `#000`         | On orange bg               |
| Base body / buttons      | 13px   | 400    | `--text`       | Default for most UI        |
| Segment buttons          | 12px   | 400    | `--muted`→`--text` | Pill buttons            |
| Stage name               | 12px   | 600    | `--orange`     |                            |
| Stage desc / time        | 12px   | 400    | `--muted`      |                            |
| Brand tagline            | 11px   | 400    | `--muted`      |                            |
| Header label             | 11px   | 400    | `--muted`      |                            |
| Meta chips               | 11px   | 400    | `--muted`      | Pill-shaped chip           |
| Group label chips        | 9px    | 700    | varies         | ALL CAPS, letter-spacing 0.7px |
| Status bar values        | 11px   | 500    | `--text`       | Tabular nums               |
| Status bar labels        | 9px    | 600    | `#3c3c3c`      | ALL CAPS, letter-spacing 0.5px |
| Keyboard header label    | 11px   | 400    | `--muted`      | "PIANO" — ALL CAPS, 1px spacing |
| Keyboard note name select| 11px   | 400    | `--muted`      |                            |
| Loop controls            | 11px   | 400    | `--muted`      |                            |
| Loop status text         | 10px   | 400    | `--muted`      | Italic                     |

### Numeric Display

`font-variant-numeric: tabular-nums` — used on status bar time/bar values to prevent layout shift during playback.

---

## 4. Button System

### Default Button (base `<button>`)

```css
font-family: inherit;
font-size: 13px;
padding: 7px 16px;
border-radius: 7px;          /* unified after refinement */
border: 1px solid #444;      /* --border2 */
background: #161616;         /* --surface */
color: #d0d0d0;              /* --text */
line-height: 1.4;
transition: background 0.1s, border-color 0.1s, color 0.1s;
```

**Hover:** `background: --surface2 (#1e1e1e)`, `border-color: #666`
**Disabled:** `opacity: 0.35`, `cursor: default`

### Button Variants

| Variant          | Padding       | Size  | Weight | BG / Color                      | Border             | Special                   |
|------------------|---------------|-------|--------|----------------------------------|--------------------|---------------------------|
| `.btn-primary`   | `9px 28px`    | 14px  | 700    | `--orange` bg / `#000` text      | orange             | min-width 160px           |
| `.btn-primary` hover | —         | —     | —      | `#e09400` bg                     | `#e09400`          |                           |
| `.btn-primary` disabled | —      | —     | —      | `#333` bg / `#666` text          | `#333`             |                           |
| `.btn-reset`     | default       | 13px  | 400    | default / `--muted` text         | default            |                           |
| `.btn-skip`      | `7px 14px`    | 12px  | 400    | default / `--muted` text         | `--border`         | `margin-left: auto`       |
| `.btn-skip` hover | —            | —     | —      | — / `--blue` text                | `--blue`           |                           |
| `.tempo-btn`     | default       | 13px  | 400    | default                          | default            |                           |
| `.tempo-btn.selected` | —       | —     | —      | — / `--orange` text              | `--orange`         |                           |
| `.learning-btn`  | default       | 13px  | 400    | default                          | default            |                           |
| `.learning-btn.selected` (both) | — | — | —  | — / `--orange` text             | `--orange`         |                           |
| `.learning-btn.selected` (treble) | — | — | — | — / `#4a9eff` text            | `#4a9eff`          |                           |
| `.learning-btn.selected` (bass) | — | — | —  | — / `#e06830` text             | `#e06830`          |                           |
| `.segment-btn`   | `5px 14px`    | 12px  | 400    | `--surface` / `--muted`          | `--border2`        | border-radius 20px (pill) |
| `.segment-btn.active` | —       | —     | —      | `rgba(74,158,255,0.10)` / `--blue` | `--blue`          |                           |
| `.loop-btn`      | `5px 9px`     | 11px  | 400    | default / `--muted`              | `--border`         |                           |
| `.loop-btn` hover | —            | —     | —      | — / `--blue`                     | `--blue`           |                           |
| `.seg-nav-btn`   | `4px 10px`    | 11px  | 400    | default / `--muted`              | `--border`         | border-radius 7px         |

### Border Radius Convention

| Context               | Radius  |
|-----------------------|---------|
| Default buttons       | `7px`   |
| Segment pill buttons  | `18–20px` |
| Input / select        | `6px`   |
| Group panels          | `8px`   |
| Keyboard section      | `8px`   |
| Status bar            | `6px`   |
| Group label chips     | `4px`   |
| Meta / info chips     | `12px`  |
| Toast                 | `8px`   |
| Progress bar          | `2px`   |
| Stage dot             | `50%`   |

---

## 5. Control Group Panels

All group panels share `.control-group`:

```css
display: flex;
align-items: center;
gap: 6px;
padding: 5px 10px;
border-radius: 8px;
flex-shrink: 0;
```

Panels are arranged in a horizontal `flex-wrap` strip (`.controls-groups`).

### Group Label Chip (`.group-label`)

```css
font-size: 9px;
font-weight: 700;
letter-spacing: 0.7px;
text-transform: uppercase;
padding: 3px 8px;
border-radius: 4px;
white-space: nowrap;
flex-shrink: 0;
margin-right: 2px;
user-select: none;
```

### Groups Reference

**PRACTICE PART** (`.segments-bar.control-group`)
- Visibility: shown only when song has `learning_segments`
- BG: purple tint gradient
- Label: "PRACTICE PART" → shows as segment-label-tag chip
- Contents: segment pill buttons + nav arrows

**HAND** (`.control-group.group-hand`)
- Visibility: shown only for dual-clef songs
- BG: blue/cyan tint gradient
- Label: "HAND"
- Contents: "Both" / "RH" / "LH" toggle buttons

**TEMPO** (`.control-group.group-tempo`)
- Visibility: always shown
- BG: amber/brown tint gradient
- Label: "TEMPO"
- Contents: 4 speed preset buttons (Easy / Grave / Andante / Moderato)

**NOTE NAME** — CSS defined but now relocated
- Currently: inline select in keyboard header (`kb-header`)
- Styled as: small quiet muted select (11px, border `--border`, bg `--surface`)
- The teal group panel CSS (`.group-notename`, `.group-label-notename`) remains in stylesheet but is unused; can be repurposed or removed in future themes.

---

## 6. Header

```
┌──────────────────────────────────────┐  height: 52px
│  🎹 MyKey Music Labs  Sight Playing  │  bg: #111
│                  Song: [▼]  ✏ Author │  border-bottom: 1px solid #2a2a2a
└──────────────────────────────────────┘
```

- `position: sticky; top: 0; z-index: 10`
- `padding: 0 24px`
- Left: `.brand` — name (orange, 15px 700) + tagline (muted, 11px)
- Right: `.header-right` — label + song select + authoring link
- Song select: default `select` styling (surface2 bg, 13px)
- Authoring link: ghost button (12px, muted → blue on hover)

---

## 7. Song Meta Bar

```
Song Title   [72 BPM]  [4/4]  [Key G]  [8 bars]  [Beginner]
```

- Flex row, `flex-wrap`, `gap: 10px`, `margin-bottom: 6px`
- Title: `15px`, weight 600, `#e8e8e8`
- Chips (`.meta-chip`): 11px muted text, `--surface` bg, `--border` border, `border-radius: 12px`, `padding: 2px 9px`

---

## 8. Stage Strip + Progress Bar

**Stage strip:**
- Flex row space-between, `margin-bottom: 4px`
- Stage dot: 7×7px orange circle
- Stage name: 12px 600 orange
- Stage desc: 12px muted

**Progress bar:**
- Height: 3px (hover: 5px, with `margin-bottom` compensated to avoid reflow)
- Track: `#222`
- Fill: `--orange`, `border-radius: 2px`
- Cursor: pointer (clickable seek)
- `margin-bottom: 10px` (compact, was 18px)

---

## 9. Score Card

```css
flex: 1;
min-height: 0;              /* required for flex scroll child */
overflow-y: auto;
overflow-x: auto;
background: #fff;           /* white — notation SVG background */
border-radius: 8px;
padding: 16px 8px;
border: 1px solid #ccc;
scroll-padding-top: 20px;
scroll-padding-bottom: 160px;
```

- Minimum content width: `#score { min-width: 960px }` (prevents notation compression)
- Notation SVGs are block-displayed within

---

## 10. Status Bar

```
Bar  [12]  ·  Time  [0:43 / 2:12]  [Segment badge]
```

```css
display: flex; align-items: center; gap: 14px;
padding: 5px 14px;
background: --surface; border: 1px solid --border; border-radius: 6px;
font-size: 11px; color: --muted;
margin-top: 6px;
font-variant-numeric: tabular-nums;
```

- Labels (`.status-lbl`): 9px, 600 weight, `#3c3c3c`, ALL CAPS
- Values (`.status-val`): `--text`, weight 500
- Separator: `--border2`
- Segment badge: blue pill, inline-block, hidden when no segment active

---

## 11. Keyboard Section

```
┌─────────────────────────────────────────┐
│  PIANO                    [Note Name ▼] │  kb-header
│  ████████████████████████████████████   │  piano keys
└─────────────────────────────────────────┘
```

```css
/* .kb-wrap */
background: #141414;
border: 1px solid --border;
border-radius: 8px;
padding: 10px 16px 14px;
margin-top: 12px; margin-bottom: 12px;
overflow-x: auto;
```

**Header row (`.kb-header`):**
```css
display: flex; align-items: center; justify-content: space-between;
gap: 8px; margin-bottom: 8px;
```
- Left: "PIANO" label — 11px muted ALL CAPS, letter-spacing 1px
- Right: Note Name select — 11px muted, bg `--surface`, border `--border`, border-radius 4px

**Key container (`#keyboardEl`):** `display: flex; justify-content: center`

Piano key colors and highlight styles are controlled by `keyboard-viz.js` (injected CSS) — not documented here.

---

## 12. Toast Notification

```css
position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
background: #2a2a2a; color: --text;
border: 1px solid --border2;
padding: 9px 20px; border-radius: 8px; font-size: 13px;
opacity: 0; transition: opacity 0.2s, transform 0.2s;
pointer-events: none; z-index: 100;
white-space: nowrap;
```

- `.toast.show`: `opacity: 1`, `translateY(0)` (slides up 8px on appear)

---

## 13. Loop Controls (`.loop-controls`)

```css
display: flex; align-items: center; gap: 5px;
margin-left: 6px; padding-left: 10px;
border-left: 1px solid --border;   /* visual separator from main actions */
```

- Buttons: `.loop-btn` — 11px, 5px/9px padding, muted → blue on hover
- Status text: 10px italic muted

---

## 14. Spacing System Summary

| Element                         | Spacing                      |
|---------------------------------|------------------------------|
| Header height                   | 52px                         |
| App body side padding           | 24px                         |
| App body top padding            | 16px                         |
| Song meta → below               | 6px margin-bottom            |
| Stage strip → below             | 4px margin-bottom            |
| Progress bar → below            | 10px margin-bottom           |
| Controls block → below          | 10px margin-bottom           |
| Controls rows gap               | 8px                          |
| Group panels gap                | 8px                          |
| Inside group panel              | gap 6px, padding 5px 10px    |
| Score card padding              | 16px 8px                     |
| Status bar → above              | 6px margin-top               |
| Keyboard wrap → above/below     | 12px margin-top/bottom       |
| Keyboard inner padding          | 10px 16px 14px               |
| kb-header → below               | 8px margin-bottom            |

---

## 15. Component Relationships (Contextual Grouping)

Understanding WHY controls are grouped where they are is important for future theme work — visual grouping should reinforce functional grouping.

| Control          | Location              | Reason                                                   |
|------------------|-----------------------|----------------------------------------------------------|
| Song selector    | Header                | Global — changes entire song, top of hierarchy           |
| Stage name       | Stage strip           | Context indicator, not a control                         |
| Progress bar     | Below stage strip     | Playback timeline — tied to time position                |
| ▶ Start / ⏹ Reset | Row 1 primary       | Primary playback actions, most prominent                 |
| Loop controls    | Row 1 right          | Session-scoped playback tool, secondary                  |
| Skip →           | Row 1 far right      | Navigation escape, separated visually                    |
| PRACTICE PART    | Row 2 group          | Learning curriculum — which segment to study             |
| HAND             | Row 2 group          | Difficulty filter — which hand to practice               |
| TEMPO            | Row 2 group          | Global playback modifier — how fast                      |
| NOTE NAME select | Keyboard header      | Keyboard visualization setting — how keys are labeled    |
| Status bar       | Below score card     | Playback readout — passive info, not interactive         |
| Keyboard         | Bottom, pinned       | Always-visible visual reference, never scrolled away     |

---

## 16. UI Design Principles

1. **Dark-first, low-distraction.** Deep blacks and dark surfaces keep cognitive focus on the white score card (notation area). The keyboard is on `#141414`, not pure black, to separate it from the void.

2. **Notation takes priority.** The score card is the largest element (`flex: 1`). Everything else is compact to maximize notation vertical space.

3. **Color encodes identity, not decoration.** Each control group has a unique tint (purple/blue/amber/teal). Colors carry meaning — orange = primary/playback, blue = selection/interaction, muted = secondary info.

4. **Contextual grouping over alphabetical.** Controls are near what they affect. Note Name is in the keyboard header, not the playback row, because it labels keyboard keys, not score notation.

5. **Compact but readable.** Fonts are small but legible. Group label chips are 9px ALL-CAPS — they identify without competing with content.

6. **Guided-learning hierarchy.** PRACTICE PART and HAND groups only appear when relevant (conditional visibility). The UI scales down complexity for simpler songs.

7. **Static-host safe.** No dynamic server-side rendering — all styling is inline `<style>` in the HTML file. Theme changes are CSS-only.

---

## 17. Future Theme Guidance

Future visual themes should change only the **presentation layer** without touching layout structure, control grouping, or runtime behavior.

### Safe to change per theme

| Category            | Examples                                                    |
|---------------------|-------------------------------------------------------------|
| CSS custom properties | `--bg`, `--surface`, `--text`, `--orange`, `--blue`, etc. |
| Group panel gradients | Colors of Practice/Hand/Tempo/Note Name panels            |
| Button appearance   | Border radius, padding, font size, hover effects            |
| Score card          | Border color, border-radius, box-shadow                     |
| Keyboard section    | Background color, border, border-radius                     |
| Header              | Background, border, brand color                             |
| Typography          | Font stack, font sizes (within readable range)              |
| Progress bar        | Color, height, border-radius                                |
| Toast / chips       | Border-radius, background, font size                        |

### Do NOT change per theme

| Category                     | Reason                                              |
|------------------------------|-----------------------------------------------------|
| Layout structure             | Flex column order, keyboard pinned at bottom        |
| Score card `flex: 1`         | Removes notation priority                           |
| `body: overflow: hidden`     | Page scrolling would break the fixed-height model   |
| `#score min-width: 960px`    | Notation requires minimum width                     |
| Control grouping logic       | Conditional visibility tied to song data            |
| Element IDs                  | Runtime JS binds by ID                              |
| `font-variant-numeric: tabular-nums` | Prevents playback timer reflow           |
| `scroll-padding` on score    | Required for correct bar auto-scroll behavior       |

### Recommended theme approach

1. Duplicate `:root {}` variable block → change values
2. Override individual component styles below the original
3. Test with: song load, segment navigation, tempo switching, hand filter, note name select, loop select, progress bar seek

---

*Document generated 2026-05-23. Reflects UI state after Session 51 refinements.*
