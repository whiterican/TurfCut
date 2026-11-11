# A chat thread has no dock on a phone (Nov 11, 2026)

Caden saw an empty band between the message box and the dock in a chat thread, in several screenshots, and asked for it to go; he suggested hiding the dock there.

## What was wrong

The composer was held 6rem above the bottom of the screen, a figure from when the dock was a taller bar, and the page kept its usual bottom padding for the dock. At the end of a thread that left a band of bare page with the dock floating in it (`before-worker-light.png`).

## What changed

On a phone (under 768 wide), on a chat thread:

- the dock is not shown;
- the composer sits at the bottom of the screen, above the home indicator;
- the page ends at the composer and fills the screen, so a short conversation still has the composer at the bottom;
- a read-only thread, which has no composer, keeps a little room under its last message.

The Messages list and every other screen keep the dock. From 768 nothing changes: there is no dock there.

## Getting around from a thread

- The back arrow returns to Messages, where the dock is.
- The menu still opens with a swipe from the left edge.

Caden also floated a swipe to bring the dock back while in a thread. It is not built: the swipe from the left edge already opens the menu, an installed iPhone app uses the same edge to go back, and a dock over the composer would cover the message box. This is Claude's call while the designer is away; it is easy to add if he still wants it.

## Checked

Chromium at 390 wide: the composer's bottom edge is the screen's bottom edge, as worker and as organizer, light and dark, and on a screen far taller than the conversation. The dock shows again on the Messages list. `worker-light.png`, `organization-dark.png`.

## Not checked

A real iPhone: the home-indicator spacing and how the composer rides the keyboard there.
