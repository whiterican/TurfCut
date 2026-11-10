# Open the menu drawer with a swipe (Nov 10, 2026)

Caden asked that a swipe open the menu drawer without tapping the menu button, with the menu still out of the dock.

## What changed

- **A swipe in from either edge of the screen opens the drawer.** It must begin within 32px of the left or right edge, travel at least 72px toward the middle, and be mostly sideways.
- **A swipe to the left on the open drawer closes it.**
- Phones only (under 768 wide), where the dock and drawer are. From 768 the sidebar is always there.
- A touch that begins on something with its own sideways drag is left alone: a job card (swipe to save or hide), a map, a text field. So is any touch while another dialog is open.

The rules are in `src/lib/edge-swipe.ts`, with unit tests.

## Checked

`swipe.mjs` drives real touch events in Chromium at 390 wide, as a worker on Jobs:

| Gesture | Drawer |
| :--- | :--- |
| Swipe across the middle of the page | stays closed |
| Scroll down beginning at the left edge | stays closed |
| Swipe in from the left edge | opens |
| Swipe left on the open drawer | closes |
| Swipe in from the right edge | opens |
| Swipe right beginning on a job card near the edge | stays closed (the card takes it) |

## Not checked

A real iPhone. An installed app on iOS has its own swipe from the left edge to go back a page; which of the two wins there, or whether both fire, needs a look on the phone. The right edge has no such system gesture.

## Rerun

`S=<folder holding fp/jordan.json> node swipe.mjs` against the app on `localhost:3475`.
