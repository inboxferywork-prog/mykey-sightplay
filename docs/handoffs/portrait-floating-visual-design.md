# Portrait Floating Mode — Visual Design Settings
**Date:** 2026-06-03  
**Session scope:** Visual refinement of FAB portrait floating card — margins, spacing, card geometry, icon sizes, note name circles.

---

## ⚠️ Critical Constraint for Future Work

> **Landscape floating mode must be built with its own CSS scope.**  
> All portrait rules below are scoped to `body.nk-portrait.nk-fab-mode`.  
> When implementing landscape floating mode, use a separate scope  
> (`body.nk-landscape.nk-fab-mode` or equivalent) and **do NOT modify**  
> any rule in this document or in `styles/portrait-mode.css`.  
> Portrait and landscape are independent design systems.

---

## 1. Visual Layout — Portrait FAB Floating Card

```
┌─ Screen top (y=0) ──────────────────────────────────┐
│  [progress strip]  h=3px, h=8px portrait touch      │  y: 0–3px (8px portrait)
│                                                      │
│  ← 47px gap → (50px top − 3px strip)                │
│                                                      │
│     ┌──── fab-ngr (card header) ──────────────┐     │  y: 50px
│     │  purple gradient, h=100px               │     │  left/right: 32px from screen
│     │  border-radius: 24px 24px 0 0           │     │
│     │  [✋ 𝄢] [circle] [│] [circle] [𝄞 🤚]  │     │
│     └────────────────────────────────────────-┘     │  y: 150px
│                                                      │
│     ┌──── score-card (card body) ─────────────┐     │  y: 50px (aligns with header)
│     │  white notation area, border-radius: 24px│    │  margin: 0 32px
│     │  padding-top: 24px                       │    │
│     │  [notation viewport padding-top: 100px]  │    │
│     │                                          │    │
│     │  (VexFlow SVG — scrollable)              │    │
│     │                                          │    │
│     └──────────────────────────────────────────┘    │
│  [90px padding-bottom — FAB bar zone]               │
└─────────────────────────────────────────────────────┘
```

---

## 2. Card Geometry — Final Values

All rules in `styles/portrait-mode.css` under `body.nk-portrait.nk-fab-mode`.

### Card Header (`.fab-ngr`)

| Property | Value |
|---|---|
| `top` | **50px** |
| `left` / `right` | **32px** |
| `border-radius` | `24px 24px 0 0` |
| `background` | `linear-gradient(160deg, #1a0e4a 0%, #3d28a0 45%, #25106a 100%)` |
| `box-shadow` | `0 0 28px rgba(107,71,214,0.26)` |
| `padding-top` | `6px` |
| `padding-bottom` | `12px` |
| `height` | `100px` (defined in `fab-overlay.css`) |

### Card Body (`.score-card`)

| Property | Value |
|---|---|
| `margin` | `0 32px` |
| `border-radius` | `24px` |
| `padding-top` | `24px` |
| `box-shadow` | `0 8px 40px rgba(0,0,0,0.28), 0 2px 12px rgba(0,0,0,0.18)` |

### App Body (`.app-body`)

| Property | Value |
|---|---|
| `padding-top` | **50px** (aligns score-card top with fab-ngr top) |
| `padding-bottom` | **90px** (FAB bar zone) |

---

## 3. Notation Viewport

| Property | Value | Rationale |
|---|---|---|
| `padding-top` | **100px** | Clears fab-ngr (100px tall). Formula: `(50+100) − (50+24) + 24 = 100`. Stays 100px as long as fab-ngr top == app-body padding-top. |
| `padding-left` / `padding-right` | **8px** | Buffers VexFlow SVG boundary (StaveConnector extends left of MARGIN_X). |

**Usable width formula (portrait FAB):**
```
viewport.clientWidth = S - 66px   (margin 32px×2 + border 1px×2)
_usableWidth()       = S - 82px   ((S-66px) - 8px - 8px)
```
This is intentionally ~44px narrower than non-FAB portrait to achieve the dramatic floating card aesthetic.

---

## 4. Card Header Icons

Rules in `styles/fab-overlay.css` (base classes, affect all FAB modes).

| Element | Class | Property | Value | Change |
|---|---|---|---|---|
| Hand emoji ✋ 🤚 | `.ngr-hand` | `font-size` | **28px** | 2× original (14px) |
| Clef glyph (Bravura SMuFL) | `.ngr-clef-glyph` | `font-size` | **32px** | 2× original (16px) |

> **Note:** These are shared with landscape FAB mode. If landscape needs different icon sizes, add a scoped override — do not change the base values.

---

## 5. Note Name Circle (Portrait-only)

Rule in `styles/portrait-mode.css` under `body.nk-portrait.nk-fab-mode .ngr-notes`.

| Property | Value |
|---|---|
| `width` / `height` | **40px** |
| `border-radius` | `50%` |
| `padding` | `0` |
| `display` | `inline-flex` |
| `align-items` / `justify-content` | `center` |
| `flex-shrink` | `0` |

**Sizing rationale:** Widest content "C#4" ≈ 22px wide at 13px Nunito Bold → 40px gives ~9px margin per side.

### Note Name Colors

| State | Color | Background |
|---|---|---|
| Inactive | `rgba(255,255,255,0.52)` | `transparent` |
| LH active | `var(--lh-color)` | `#ffffff` |
| RH active | `var(--rh-color)` | `#ffffff` |

---

## 6. Brand Tokens (portrait-mode.css `:root`)

```css
--mykey-purple:      #6B47D6
--mykey-purple-glow: rgba(107, 71, 214, 0.26)
```

---

## 7. Files — What Lives Where

| Setting | File | Scope |
|---|---|---|
| All card geometry, spacing, note circles | `styles/portrait-mode.css` | `body.nk-portrait.nk-fab-mode` |
| Icon sizes (hand, clef) | `styles/fab-overlay.css` | base class (shared) |
| Progress strip touch height | `styles/portrait-mode.css` | `body.nk-portrait.nk-fab-mode` |

---

## 8. Rules for Landscape Floating Mode (Future)

When implementing landscape floating mode:

1. **Create a new CSS scope** — use `body.nk-landscape.nk-fab-mode` or the existing landscape media-query class. Do not add rules to `portrait-mode.css`.
2. **Do not change `.ngr-hand` or `.ngr-clef-glyph` base sizes** unless both portrait and landscape should change. Add landscape-scoped overrides if different sizes are needed.
3. **Landscape card geometry is independent** — different screen ratio means different margin/top values. Start fresh; do not copy portrait values blindly.
4. **Notation viewport `padding-top`** — recalculate for landscape based on `fab-ngr` height and app-body padding-top using the formula: `(ngr_top + ngr_height) - (app_padding_top + score_padding_top) + desired_gap`.
5. **Reference this document** to understand what portrait uses — confirm no overlap before committing landscape rules.
