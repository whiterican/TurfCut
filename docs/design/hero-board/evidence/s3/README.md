# Slice 3 evidence — phone shell and dark mode

Same branch, contract and capture method as `../s1/README.md`: real routes,
synthetic fixtures, Inter loaded, frozen clock, device scale factor 2,
`<screen>-<state>-<css width>-<theme>.png`. Every light capture here has a
`-dark` twin; `manifest.json` records the font check, overflow and dock
measurements for each.

## What is in this slice

| Change | Done | Evidence |
|---|---|---|
| No site header on a worker's phone | The concept's phone screens open with the page title, so the header bar is desktop-only for a signed-in worker (`lg` and up). The page keeps a top inset equal to the safe area. Signed-out visitors and organization staff keep the bar at every width. | `today-next-390-*`, `jobs-populated-390-*`, `profile-populated-390-*`, `schedule-upcoming-390-*` |
| Bell beside the page title | The notices count the layout already computes is shared once through a context, so the bell on Today and Jobs is a 44px outline button with the same count the desktop header shows. It links to `/notifications`. | `today-next-390-*`, `jobs-populated-390-*` |
| Notifications in More | First row of the More sheet, with a count badge when there are unread notices. The More tab itself carries a small coral dot in that case so a worker on a route without the bell still sees it. | `more-open-390-*` |
| Dark mode | A derived theme, not a second design: the same Eggplant shell, surfaces lifted two steps off `#140a22`, Forest kept for the one filled action, `#5ED39B` mint for links, the current dock tab and success. Specified in `../../DARK_MODE.md`; the token test holds every pair to AA. | every `-dark` capture |

## What stays the same

Dock, tokens, type scale and radii from slice 1. The six destinations
(Home · Jobs · Work · Map · Messages · More) hold until the Leads feature
exists (#110).

## Remaining differences from the concept

**Header.** The concept draws a status bar and no app chrome at all. The
app has no status bar to draw; the safe-area inset keeps the title clear of
the notch.

**Dark mode.** The concept has no dark screens. The dark captures are the
derived theme and are offered for review, not as a match to anything drawn.
