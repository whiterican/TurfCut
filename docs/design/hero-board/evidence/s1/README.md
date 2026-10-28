# Slice 1 evidence — foundation, dock, and the three pilot screens

Branch `redesign/mockup-fidelity` (from `redesign/hero-board`). The concept is
`../../reference/founder-12-screen-concept-2026-10-28.jpg` (committed in PR
#112); the contract is issue #111 and `../../CORRECTIVE_PLAN_2026-10-28.md`.

Every capture is the real Next.js route rendered from the local preview
harness with **synthetic fixtures** (no production data), Inter loaded
(`fontOk: true` in `captures/manifest.json`), the clock frozen, at the
viewport named in the file: `<screen>-<state>-<css width>-<theme>.png`, device
scale factor 2. `side-by-side/` puts the concept crop (upscaled from the
composite: it is a low-resolution reference, not a pixel target) beside the
capture at matching height.

## What is in this slice

| Area | Done | Evidence |
|---|---|---|
| Ten locked colours as base tokens, every role named after its base; dark mode and status text as documented derived extensions; the old green/plum/beige/lime gone | `src/app/globals.css` | `design-tokens.test.ts` asserts the ten values and the absences |
| Inter for every role, H1 28/36 · H2 20/28 · H3 16/24 · Body 16/24 · Caption 14/20 · Small 12/16; radii 6/10/14/20/28 | `globals.css`, `src/app/layout.tsx` | manifest `bodyFont`, `fontOk` |
| Dock: Eggplant slab, Cream inactive, green current (no tile), 12/16 labels, 52px tiles, Messages wider; identical on worker and organization routes | `AppNav.tsx`, `nav.ts` | every 390 capture; `jobs-populated-320-light.png` (no overflow, every tile ≥ 46×52, Messages 58) |
| Worker More sheet: Profile, Feed, Earnings, Settings, Sign out | `AppNav.tsx`, `layout.tsx` | `more-open-390-{light,dark}.png` |
| Jobs (screen 2): search (real `q`), filter sheet, chip row, photo rows, states | `src/app/jobs/page.tsx` | `jobs-populated-*`, `jobs-no-results-390-*` |
| Job details (screen 3): photo with back/save/share, title + pay, approval mark, one-line facts, chips, About, Forest action above the dock | `src/app/jobs/[jobId]/page.tsx` | `job-apply-*`, `job-apply-scrolled-390-*` |
| Organizer overview (screen 10): rail, Overview + Today, three real tiles, field activity map + key + needs counts, needs queue | `src/app/desk/page.tsx` | `desk-populated-1440-*`, `desk-populated-390-*` |
| Photographs: Unsplash licence, one per category and the hero; a job's published campaign header when it has one | `public/photos/MANIFEST.md`, `JobPhoto.tsx`, `campaign-media-data.ts` | the rows and heads in every capture |

## Remaining differences from the concept (per screen)

**Jobs.** The site header (mark, bell, settings, theme) stays above the page;
the concept has no header on this screen and puts a locality and a bell beside
the title. The app has no saved worker locality, so none is shown. Rows carry a
second (Hide) icon under Save: an existing private control, kept. The row's
category line and the "In development" tag are kept (data honesty). Pay is the
exact gross basis, never "+ bonuses".

**Job details.** Same header note. The concept's single date and time-of-day
are a job's date range here (times live on shifts). The organization mark is
Turfcut's approval, not identity verification. "Staged" / "Self-launch" stands
in for "On-site". The long sharing statement under the action is kept (it is
what the worker agrees to). Every existing state (applied, offered, invited,
hired, closed, eligibility blockers) keeps its actions; only the apply state is
captured here.

**Organizer overview.** The rail is 220px Eggplant with the organization and
the signed-in person; the concept's wordmark sits in the site header instead,
and there is no organization switcher (one organization per member). The three
tiles are today's real field summary (shifts under way, checked in, signatures
submitted, and doors knocked when any were), not weekly totals or fill rate; no
growth percentages exist. The "Today" label is a label: the query is today-only
and there is no period picker yet.
The map shows assigned turf only; the fixture organization has no turf today,
so the honest empty state is captured. The concept's right-column counts are
the needs queue's kinds, each the real number of things (12 pay lines, 4
applications), not the number of rows. Workers / Leads / Reports have no route and are not
drawn.

## Bounded decisions awaiting the founder (from the corrective plan)

1. **Dock current colour**: `--dock-active-fg: #5ED39B` (9.7:1 on Eggplant)
   for the current icon and label, because Forest is 3.37:1 there. Buttons stay
   Forest. Say the word to try literal Forest for the icon only.
2. **Leads** is absent from the dock until its feature exists (#110): six
   destinations, not seven. Labelled here, never shown dead.
3. **Dark mode** values are proposals (`.dark` block, each marked derived):
   the same Eggplant dock, a deeper page, raised eggplant cards, white type.
4. **Photographs**: the Unsplash set in `public/photos/MANIFEST.md` stands in
   until the founder supplies or approves others. One is a brand-partner photo
   under the same licence; swap it if that matters.
5. **Site header on phone screens**: kept (bell, settings, theme live there);
   the concept has none. Removing it is a shell decision for slice 2.

## Checks

`npm run typecheck`, `npm run lint`, `npm test` (110 files, 950 tests) pass on
the slice's head. Authenticated end-to-end and RBAC runs are not part of this
slice's evidence; the route guards are unchanged.
