# Pill dock, menu drawer and heavier type (Nov 10, 2026)

Caden asked for three things from a reference screenshot: the dock as a pill without the More tab, More's places in a hidden area on the left, and the reference's type. Astra and Codex are out, so the design calls below are Claude's, at Caden's word ("check it yourself"). She can revisit them.

All evidence is the running app on the local test database, in Chromium with touch emulation at DPR 1. It is not a real phone or tablet.

## What changed

1. **The dock is a pill of icons.** The current tab sits in a faint capsule and keeps the dock green. Tab names are in the markup for screen readers, not drawn. The More tab is gone.
2. **More's places open in a drawer from the left.** It is the same native dialog as before, restyled. A menu button opens it:
   - a worker's phone has no site header, so the button gets a strip above the page: the person's initial and first name;
   - where the site header shows beside the dock (an organization's phone, a worker's touch tablet at 1024 to 1279), the button is the menu glyph at the header's left.
   - The strip is left off a job's page (the photograph runs to the top) and a chat thread (it pins its own bar).
3. **Type is one step heavier.** The reference is Inter, which the app already uses; what differs is weight. Body text is 500, and each named weight draws a step above its default (medium 600, semibold 700, bold 800). Inter loads 500 to 800.

## Decided for Astra

- **Icon-only tabs.** The reference has no labels. This gives up the visible names the tablet pass kept (#136): Work (footprints) and Map (pin) have no drawn name.
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

The test worker has no display name, so the button and drawer show the account's email.

## Still imperfect

- Not checked on a real device, in Safari, or in dark and Sunlight themes by eye (the contrast of the current tab on its capsule is tested for all three).
- Only the pages in `sweep.txt` were looked at with the heavier weights. Print, emails and the admin console were not.
- The drawer is on the left in right-to-left layouts too.

## Rerun

`S=<folder holding fp/jordan.json and fp/owner.json> node sweep.mjs <outDir>` against the app on `localhost:3475`.
