# Dark mode (proposal, derived from the concept's identity)

The founder's twelve-screen concept shows light mode only. This dark theme is derived from the same identity, not a second palette: the **same Eggplant dock and rail**, the **same Forest action with white type**, the **same dock green for the current tab**, white type on eggplant surfaces that step up from a page deeper than the dock. Photographs are untouched. Sunlight (the outdoor mode) is separate and keeps its black-and-white contract.

Every value below is read from `src/app/globals.css` `.dark` by the script that wrote this file; `src/lib/design-tokens.test.ts` checks the ratios. Each is a documented derived extension of the ten locked colours, never a replacement for them in light mode.

## Principles

1. **The frame does not change.** Dock `#1C0F2E`, rail `#1C0F2E`, current tab green, Forest buttons: a worker switching modes keeps the same landmarks.
2. **Surfaces step up, not out.** Page → card → muted fill are three steps of the same eggplant; borders are a hairline one step above their surface. No pure black, no grey.
3. **One bright accent.** The dock green doubles as link, focus and success colour by night (Forest is 2.9:1 on the night card, unreadable as text). Warning and error are the light theme's hues lifted to read on eggplant.
4. **Type stays AA or better.** Body ≥ 7:1, secondary ≥ 4.5:1 on every surface, including the Muted fill.
5. **Status keeps its words and glyphs.** Tints behind status chips are faint (8–16% of the pastel), so cream and coral type keeps AA; the glyph and the label carry the meaning.

## Tokens

| Role | Token | Dark | Light | Contrast by night |
|---|---|---|---|---|
| Page | `--bg` | `#140a22` | `#faf9f4` | — |
| Card / row | `--surface` | `#231538` | `#ffffff` | — |
| Muted fill (chips, tracks) | `--surface-2` | `#2f2048` | `#e7e6ed` | — |
| Field | `--field` | `#1c0f2e` | `#ffffff` | — |
| Border | `--border` | `#3d2c57` | `#d7d2e0` | 1.37:1 against the card |
| Text | `--fg` | `#f4f2f8` | `#0f172a` | 15.3:1 on the card, 13.3:1 on the Muted fill |
| Secondary text | `--muted` | `#c9c2d6` | `#475569` | 9.8:1 on the card, 8.6:1 on the Muted fill |
| Captions | `--subtle` | `#b3abc4` | `#64748b` | 7.7:1 on the card, 6.7:1 on the Muted fill |
| Primary action | `--primary` | `#157a46` | `#157a46` | white 5.38:1 on it |
| Links, focus, selection | `--link` | `#5ed39b` | `#1c0f2e` | 9.1:1 on the card, 7.9:1 on the Muted fill |
| Success / done | `--success` | `#5ed39b` | `#116b3d` | 9.1:1 on the card, 7.9:1 on the Muted fill |
| Warning text | `--warning` | `#fbbf24` | `#78350f` | 10.2:1 on the card, 8.9:1 on the Muted fill |
| Error text | `--danger` | `#f87171` | `#c42020` | 6.1:1 on the card, 5.3:1 on the Muted fill |
| Dock, rail | `--shell-bg` | `#1c0f2e` | `#1c0f2e` | 1.06:1 against the page, edge 1.90:1 |
| Dock current | `--dock-active-fg` | `#5ed39b` | `#5ed39b` | 9.7:1 on the dock |
| Chosen chip / row | `--tab-active-bg` | `#5a4a78` | `#1c0f2e` | white 7.0:1 on it; 2.17:1 against the card |
| Feature card (Today) | `--hero` | `#2f2048` | `#1c0f2e` | white 13.3:1 on it |

## What changes by night, screen by screen

- **Dock and rail**: identical. **Buttons**: identical. **Photographs**: identical.
- **Cards and rows**: eggplant surfaces with hairlines; the shift card's status accent and the status pills keep their colours.
- **Links**: the dock green instead of Eggplant (Eggplant is invisible on itself).
- **The Today feature card**: a raised eggplant card with white type (the earlier cream card is retired: the concept has no cream card).
- **The More sheet, the filter sheet**: the card surface, with a one-pixel light edge on a chosen row or chip so it reads on its surface.

## Evidence

Every 390 and 1440 capture in `evidence/s1` and `evidence/s2` has a `-dark` twin at the same viewport and scale (the 320 width is captured in light only, for overflow); the side-by-sides marked "(proposed dark)" put each beside the concept crop.

## Open for the founder

- Whether dark should follow the phone (today's default) or be chosen in Display settings only.
- Whether the page should be the dock's Eggplant exactly (then the dock needs a stronger edge) or one step deeper, as here.
