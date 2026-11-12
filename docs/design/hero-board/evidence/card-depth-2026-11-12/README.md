# Every box on the page has the same weight (Nov 12, 2026)

Caden asked for the rest of the cards and boxes to have the same weighted, shadowed look as the others, to add some depth.

## What was uneven

Cards, lists, job rows and tables carried a lit top edge and a soft shadow. Stat tiles, work cards, summary tiles, choice lists, option cards and empty states had only a hairline, so they sat flat beside them.

## What changed

- **Those boxes now carry the same edge and shadow** as the cards, from the same two tokens.
- **The shadow itself is a little stronger**, for every card. It was one faint shadow (6%) that barely showed on the cream page; it is now a close contact shadow with a wider soft one under it. In dark mode it is deeper too, though a shadow on a dark page shows little: there the lit top edge does the work.
- **A box inside another box stays flat.** A shadow inside a card reads as dirt, not depth. A chosen option keeps its ring.
- **Notes stay flat:** alerts, shaded notes (`.card-flat`), dashed boxes and key-value chips are part of the text flow, not surfaces.
- **Sunlight** has no shadows, as before.

## Checked

Chromium at 390 wide, light and dark: the Desk, a worker's schedule, profile, preferences and earnings. Typecheck clean; unit tests pass.

- `before-desk-light.png`: the tiles with the old, faint shadow
- `desk-light.png`, `desk-dark.png`
- `profile-light.png`: the yellow note stays flat; the tiles below carry the weight
- `preferences-light.png`: a choice list

## Not checked

A real phone, and every screen: the rule is by class, so any screen using these boxes picks it up, but only the five above were looked at.
