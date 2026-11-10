# Sidebars on tablets, and a worker sidebar (Nov 10, 2026)

Caden asked that tablets use the desktop layout with its sidebar, and chose a new sidebar for workers. Astra is out; the design calls are Claude's at Caden's word.

Evidence is the running app on the local test database in Chromium with touch emulation. It is not a real tablet.

## What changed

- **From 768 wide, everyone gets the sidebar.** It showed from 1024 before, and only for organizations. Phones (under 768) keep the pill dock, the menu button and the drawer.
- **Workers have a sidebar.** It lists the dock's five places and then everything the drawer holds, with who is signed in and Sign out at the foot. It replaces the worker's top bar of links, on desktop too.
- **The sidebar is glass**: a pane of the card colour with ink type, the current row in the same tinted capsule as the dock. Sunlight keeps its solid black frame.
- **The touch-tablet dock from #136 is gone.** One rule for every tablet replaces it.
- A worker's page-level bell and the admin console's phone navigation now hide at 768, where the header and the console's own sidebar take over.

## Checks

- `tsc` and `eslint` are clean; vitest passes 1,045 tests, including a new one that the stylesheet's braces balance (a stray brace during this work broke the build while every other test passed).
- `sweep.txt`: 162 page loads. A worker on 15 pages and an organization owner on 12, each at 390, 768, 820, 1024, 1280 and 1440. No page overflows sideways. The dock shows only at 390 and the sidebar at every other width.
- One table needs its own sideways scroll on a tablet: the Hiring pipeline at 768 (241px) and 820 (189px). The page itself does not scroll.

## Review

A separate Claude reviewer looked at worker, owner and staff pages at 768×1024, 1024×768, 1024×600 and 1440×900, light and dark, and found nothing blocking. Its findings, fixed:
- on a short window the worker's Sign out was cut off (the list now scrolls and the foot stays in view; measured at 1024×768 and 1024×600);
- a worker's two-column pages still split at 1024, leaving a 428px main column beside the sidebar (they now wait for 1280, as an organization's do; the main column at 1024 is 756px);
- the profile's own sub-menu repeated the sidebar (it is no longer drawn);
- space for the dock was still left under pages from 768 to 1023; a job's photo sat 24px under the header there; the keyboard rule, the composer and the sign-in form still referred to the old tablet dock.

Left as they are, for Caden: the admin console's sidebar is glass while its band stays solid eggplant; Notifications and Settings appear in both the header and the sidebar; the sidebar's Notifications row shows no count (the header's bell does).

The screenshots and `sweep.txt` were retaken after these fixes.

## Evidence

- `tablet-768.png`: a worker's Home and an organization's Hiring at 768.
- `tablet-1024.png`: a worker's Jobs and an organization's Pay at 1024.

## Not done

- Not checked: a real tablet, Safari, dark and Sunlight by eye, the admin console.
- Dead code to remove in a clean-up: `TopNav`, `topNavTabs`, the `.topnav` styles, `ProfileNav` and the theme toggle's `iconOnlyWide`. The local preview harness still imports some of it.

## Rerun

`S=<folder holding fp/jordan.json and fp/owner.json> node sweep.mjs <outDir>` against the app on `localhost:3475`.
