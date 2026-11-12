# Open the menu drawer with a swipe (Nov 10, 2026)

Caden asked that a swipe open the menu drawer without tapping the menu button, with the menu still out of the dock.

## What changed

- **A swipe in from the left edge of the screen opens the drawer.** It must begin within 32px of the left edge, travel at least 72px to the right, and be mostly sideways. (At first either edge opened it; Caden asked on Nov 11 for one direction only, so the right edge now does nothing.)
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
| Swipe in from the right edge | stays closed (since Nov 11; it opened before) |
| Swipe from the right edge across the filter chips row | stays closed (the row scrolls) |
| Swipe right beginning on a job card near the edge | stays closed (the card takes it) |

## Review

A separate Claude reviewer found nothing blocking and two behaviours to fix, both fixed:
- the swipe opened the drawer on the admin console, where the menu is hidden on purpose. It now works only where a menu button is on screen, so it always stands in for a control the person can see;
- a swipe from the edge across something that scrolls sideways (the Jobs filter chips, a wide table) both scrolled it and opened the drawer. Such touches are now left to the scroller.
Also: maps are left alone before the map has loaded, and a pinch-zoomed page pans instead. The guard order is a pure function with its own tests.

## Not checked

A real iPhone. An installed app on iOS has its own swipe from the left edge to go back a page; which of the two wins there, or whether both fire, needs a look on the phone. In Safari the right edge goes forward a page. On Android phones that use gesture navigation, the system owns both edges and the page may never see the touch, so the swipe will mostly not work there. The menu button is the dependable way in on every phone; the swipe is a shortcut where the system allows it.

## Rerun

`S=<folder holding fp/jordan.json> node swipe.mjs` against the app on `localhost:3475`.
