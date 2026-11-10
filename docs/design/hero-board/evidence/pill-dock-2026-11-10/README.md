# Pill dock, menu drawer and heavier type (Nov 10, 2026)

Caden asked for three things from a reference screenshot: the dock as a pill without the More tab, More's places in a hidden area on the left, and the reference's type. Astra and Codex are out, so the design calls below are Claude's, at Caden's word ("check it yourself"). She can revisit them.

All evidence is the running app on the local test database, in Chromium with touch emulation at DPR 1. It is not a real phone or tablet.

## What changed

1. **The dock is a pill of icons, with no words.** The current tab sits in a faint capsule and keeps the dock green. Tab names are in the markup for screen readers, never drawn. The More tab is gone. For a while the current tab showed its name (`dock-current-tab-named.png`); Caden then asked for no words at all, and that is what ships.
2. **More's places open in a drawer from the left.** It is the same native dialog as before, restyled. A menu button opens it:
   - a worker's phone has no site header, so the button gets a strip above the page: the person's initial and first name;
   - where the site header shows beside the dock (an organization's phone, a worker's touch tablet at 1024 to 1279), the button is the menu glyph at the header's left.
   - The strip is left off a job's page (the photograph runs to the top) and a chat thread (it pins its own bar).
3. **Type is one step heavier.** The reference is Inter, which the app already uses; what differs is weight. Body text is 500, and each named weight draws a step above its default (medium 600, semibold 700, bold 800). Inter loads 500 to 800.

4. **Corners are rounder throughout** (Caden's second reference, Nov 10). The shape scale moved from 6 · 10 · 14 · 20 · 28 to 10 · 14 · 24 · 28 · 32: cards are 24px, fields and thumbnails 14px, and buttons are full pills. Corners that were set by hand in components now use the same tokens. `rounder-1.png` and `rounder-2.png` show eight screens; `sweep.txt` was rerun after this change and no page overflows.

## Decided for Astra

- **No words in the dock** is Caden's call. It gives up the visible names the tablet pass kept (#136): Work (footprints) and Map (pin) have no drawn name, and each page's own heading says where you are.
- **Heavier weights everywhere**, not only on the worker's phone, so the app stays one typeface at one scale.
- **No menu strip on job details or chat threads.** The drawer is reached from any other page.

## Evidence

- `before-home.png`, `before-jobs.png`: master before this branch, 390 wide.
- `phone-1.png`: Home, Earnings, a chat thread (no strip), an organization's Overview.
- `phone-2.png`: a job's page (no strip), Profile, My schedule, an organization's Pay.
- `drawer_dashboard.png`: the drawer open on Home.
- `touch-tablet-1100.png`: a worker's touch tablet, the menu button in the header.
- `desktop-1440.png`: desktop, the top bar as before, heavier type.
- `sweep.txt`: 31 page loads (worker at 390, 1100 touch and 1440; organization owner at 390 and 1440). Each line records the page's sideways overflow, and whether the dock, the strip, the header's menu button, the top bar and the rail show. No page overflows.

The test worker has no display name. The screenshots were taken before the review fix, so they show the whole email; the button now shows the part before the @.

## Review

A separate Claude reviewer went through the branch and found nothing blocking. Its findings, fixed:
- the menu strip printed on receipts and statements (now hidden in print, and tested);
- the Messages tab was wider than the others (a leftover from the labelled dock);
- on a phone, the admin console showed the menu (the console stands alone, as on wider screens);
- the menu button's spoken name left out the name it shows; an account with no name showed its whole email (now the part before the @);
- a role with no phone tabs could get a menu button with nothing behind it;
- in forced-colours mode the current tab had no cue (now an outline);
- stale comments and unused styles from the labelled dock.

A second reviewer re-checked those fixes and the named current tab. Its findings, fixed: the forced-colours outline hid the focus ring on the current tab; the admin console on a phone lost its top safe area.

Known and kept: a "99+" badge on Messages pokes about 4px past the pill's edge on a 320px phone when Messages isn't the current tab. Also known and kept: on a job's page and in a chat thread there is no menu button, so the drawer's places (Notifications among them) are one tab switch away.

## Still imperfect

- Not checked on a real device, in Safari, or in dark and Sunlight themes by eye (the contrast of the current tab on its capsule is tested for all three).
- Only the pages in `sweep.txt` were looked at with the heavier weights. Print, emails and the admin console were not.
- The drawer is on the left in right-to-left layouts too.

## Rerun

`S=<folder holding fp/jordan.json and fp/owner.json> node sweep.mjs <outDir>` against the app on `localhost:3475`.
