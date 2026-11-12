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

## Glass cards (same day)

Caden: make all the cards Liquid Glass, so a card that is weighed down looks physically pressed and has the glass effect; change the colours slightly if that makes it more visible, but keep the same scheme.

- **Every floating box is a pane of glass**: cards, lists, tables, tiles, work, shift and turf cards, choice lists, option cards and empty states. A thinner pane of the card colour (64% by day, 58% by night; it was 80% and 82%), the page blurred and a little richer behind it, the diagonal glint and bright rim the controls have.
- **Pressed glass.** With the tilt, light pools on the side under the finger and the shadow pulls in, as the pane is pushed toward the page.
- **The page has more for the glass to pick up**: soft washes of the brand's lavender, purple and (by night) green down the page, where there was one at the top. No new colour, and by day no stronger than the wash the top already had, because grey text sits straight on the page too.
- **Text.** Behind a card there is the page and its washes, so the test works out the worst of those: body text holds 7:1, secondary text and status colours AA. The faintest grey (Subtle, a locked colour) fell just under AA on the thinner pane by day, so on glass it steps a little toward Muted (`--subtle-on-glass`, #55647A). Subtle itself is unchanged. Hints that sit straight on the page read the same stepped grey, because the washes are behind them too (review, Nov 12). The one card that hangs over other content, the menu in a chat, is solid with no blur.
- **Solid on purpose:** a box inside another box (one blur per stack), the job cards you swipe and the job rows (a list of twenty is not twenty blurs), the hero cards (their own colour), Sunlight, and anyone who asks their device for less transparency or more contrast.

Honest limits: by night the glass is plain to see. By day it is quiet: a white pane over a pale cream page has little to show through, and making the page darker would cost text contrast. Blur is the costliest thing a phone browser draws; pages with many tiles want a look on a real phone for smoothness, and Safari is known to clip or drop blur in some stacking cases, which Chromium does not show.

## After review and Caden's first try (Nov 12)

- **Gentler press** (Caden: "smoother, and not push down so quickly or as much"): the tilt is halved (3° on a small tile, 1.25° on a phone-width card, 0.6° at least), the card shrinks 0.6% where it shrank 1.5%, and it takes 360ms both to sink and to float back where the press took 120ms.
- **Chat menu is opaque again.** The glass rule had thinned it, so messages showed through. It is `.card.card-solid` now, with a test.
- **Faint grey on the page** holds AA over the washes (see Text above).
- **Talking points** keep a solid fill; they had thinned without being meant to.
- **While pressed, a card drops its blur.** Safari is known to clip a blurred backdrop on a turning panel. The page behind is a smooth wash, so the blur adds almost nothing during the press. Not checked on an iPhone.
- **Print**: every pane prints solid.
- **Known, not changed**: pages with many cards (Pay, the schedule) carry one blur per card; if a phone scrolls roughly there, dropping the blur from `--card-filter` costs almost nothing visually.
