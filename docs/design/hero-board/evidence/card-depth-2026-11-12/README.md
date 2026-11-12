# Every box on the page has the same weight (Nov 12, 2026)

Caden asked for the rest of the cards and boxes to have the same weighted, shadowed look as the others, to add some depth.

## What was uneven

Cards, lists, job rows and tables carried a lit top edge and a soft shadow. Stat tiles, work cards, shift cards, turf cards, the Desk's "needs" tiles, summary tiles, choice lists, option cards, empty states and the Desk's map frame had only a hairline, so they sat flat beside them.

## What changed

- **Those boxes now carry the same edge and shadow** as the cards, from the same two tokens.
- **The boxes float.** Caden's follow-up the same day: "make it appear as if they're floating". The shared shadow is now a faint contact shadow with a long soft one thrown well below the box and pulled in at the sides, so it reads as height. It applies to everything that reads the token: cards, lists, job rows, tables, the hero cards and their rings, the featured card on the public page, a job page's note, and the round header buttons. It was one faint shadow (6%) that barely showed on the cream page. In dark mode it is deeper too, though a shadow on a dark page shows less: there the lit top edge does part of the work.
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

A real phone, and every screen: the rule is by class, so any screen using these boxes picks it up, but only the screens above were looked at. The hero cards, the public page's featured card and the header buttons take the stronger shadow too and were not looked at one by one. Printed pages have no shadows.

## Weighted: a pressed card dips toward the finger (same day)

Caden: "wherever someone presses or taps it weighs that side of the card down", and for cards that hold information, such as the sign-in card, too.

- While a floating box is pressed it turns toward the finger: pressing the right side sends the right edge down, pressing the top sends the top down, a corner dips on both. It also sinks very slightly. Letting go sets it level again, and so does a touch that turns into a scroll, a menu or picker opening, or a drag starting. A finger that slides off the card counts as its edge until it lifts.
- A small tile dips up to 6 degrees; a big card much less (a phone-wide card about 2.5, a long list 1.2), so nothing swings.
- A tile inside a card dips with its card, as one piece.
- It applies to the boxes that float: cards, hero cards, lists, work, shift and turf cards, the Desk's tiles, summary tiles, job rows, option cards and empty states. Not the job cards you swipe (they move under the finger already), not tables (they scroll), not choice lists. A press that starts on a map, a dropdown or a slider inside a card leaves the card still.
- The press still does whatever it did: links open, fields take focus, buttons press. Nothing moves around the card, because only the card itself turns.
- Off when motion is reduced, by the phone's setting or the app's.

`pressed-tile-right-light.png`: the first tile held at its right edge. `pressed-sign-in-top-dark.png`: the sign-in card held near its top.

Checked in Chromium with a held mouse press (tile and sign-in card, light and dark), the angles set and cleared, reduced motion leaving the card still, and a tap on a card link still opening it. Not checked: a real finger on a real phone, where the feel of it is the whole point; and typing in a field while its card is tilted, which lasts only as long as the press.
