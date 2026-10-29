# Slice 4 evidence — organization workspaces

Same branch, contract and capture method as `../s1/README.md`: real routes,
synthetic fixtures, Inter loaded, frozen clock, device scale factor 2,
`<screen>-<state>-<css width>-<theme>.png`; `manifest.json` records the font
check, overflow and dock measurements for each. Map tiles are grey in every
capture: the capture container has no route to OpenStreetMap, so only the
turf polygons draw. In the app the tiles load.

## What is in this slice

| Screen | Done | Evidence |
|---|---|---|
| Field map (11) | On the Overview's shell: four white tiles from the live field summary (shifts under way, on the ground, packets out, waiting for review), a **Turf** section with a job filter (`?job=<id>`, a real GET form; the polled figures take the same filter), the coverage map (assigned turf only, never a person's position), one card per turf beside it, then every shift by job and staging point as before. | `field-populated-1440-*`, `field-job-filtered-1440-*`, `field-populated-390-*`, `field-turf-scrolled-390-*` |
| Turf cards | Named by the turf's staging point (else "Turf n"), the job, **n of m** shifts on the ground now, a bar of that share, the turf's hours and any signatures or doors reported. The figures follow the map's live summary. | `field-turf-scrolled-390-*`, `field-populated-1440-*` |
| Hiring | The pipeline on the workspace template with the tile grammar. | `hiring-populated-1440-*` |
| By date, Your jobs | The by-date field page and the organization's jobs list on the same template. | `field-day-day-1440-light`, `org-jobs-populated-1440-light` |
| Overview (10) | Re-captured with turf drawn on today's fixture shifts, so the map and its key are populated. | `desk-populated-1440-*` |
| Staff figures everywhere | `SummaryBar` is restyled centrally as the Overview's tiles (figure, name, hint), so every staff page that used it changes at once. | `hiring-populated-1440-*`, `field-populated-1440-*` |

## Remaining differences from the concept

**Turf progress.** The concept's cards say "32 of 108 · 30% complete": stops
done out of stops in the turf. There is no stop inventory (#110), so a card
says the one thing the data holds, shifts on the ground now out of shifts
given the turf, and says so. Percentages are not drawn.

**Controls.** The concept's date picker is the existing **By date (UTC)**
route; "All turfs" has no meaning without named turfs and is not drawn; the
full-screen button is not drawn.

**Numbered pins.** The concept numbers turfs on the map. Turf polygons carry
a hover label with their count; numbers would need a stable turf identity,
which only the stop feature introduces.

**Rail.** The concept's rail reads Overview, Jobs, Workers, Map, Leads,
Compliance, Messages, Reports, Settings. The app's rail is its real areas
(Desk, Hiring, Jobs, Field, Messages, Pay, Credentials, Campaigns, Members,
Settings); Workers, Leads and Reports do not exist.
