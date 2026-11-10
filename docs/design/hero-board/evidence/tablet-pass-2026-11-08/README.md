# Tablet pass: every route outside the hiring family

The app-wide tablet pass Caden asked for. The hiring routes were audited separately by Codex in #134; this covers everything else. [Board claim](https://github.com/whiterican/TurfCut/issues/128).

## How it was run

`audit.mjs` loads each route as its real role on the local test database: a worker (Jordan), an organization owner, Turfcut staff, or signed out. It starts at 768×1024 portrait, then resizes to 1024×768 landscape without reloading, like a rotation. It runs once in light and once in dark. At each size it records, before any screenshot:

- horizontal overflow (`over`; −15 means a vertical scrollbar is taking room, at either size);
- any element past the right edge that no ancestor scrolls or clips;
- whether the bottom dock or the organization rail shows;
- the main column's width;
- every visible native select whose chosen option is wider than its text box (24px allowance for the arrow, as in #130);
- console and page errors.

A separate `CLEARANCE=1` mode scrolls each page to its end at 768×1024 and records how far the last *visible* content sits above the dock's top edge. Visible means a leaf element, shown, and not cut off by a scrolling or clipping ancestor.

This is Chromium with touch enabled, at DPR 1. It is not a real iPad, Safari, the on-screen keyboard or split-screen.

- **`baseline/`:** 46 routes × 2 sizes × 2 themes = 184 measured states on master `ea9f5d8`, with a light screenshot at each size (92) and `manifest.json`. That's 44 rendered routes. The worker's shift page returns 404, and the Message reports row was audited as staff by mistake: it redirected to the worker Messages page, so those four rows don't show Message reports (see `extra/`). `w-header-1024.png`, `-1200`, `-1280` and `-1440` show the worker header across the band.
- **`extra/`:** Message reports audited correctly as the organization owner, at `fa7c346` (no app change to that route since master): 4 states, no overflow, no errors, dock at 768 and rail at 1024.
- **`clearance/`:** the dock clearance of every route at 768, at `85f9fc1` (no app change since `d00546c`), with `clearance.json` and a screenshot of each page scrolled to its end. The run uses reduced motion: the dock tucks away while you scroll, so that's the only way to keep it on screen in the screenshots. The measurement takes the dock in its shown position, the worst case.
- **`detail/`:** the detail pages the baseline didn't reach, at `f638afe` (no app change since `d00546c`), with the audit waiting for each page to hydrate before it measures (the baseline didn't, which only ever left the wider server-rendered UTC times on screen): 10 routes × 2 sizes × 2 themes = 40 states, plus the dock clearance of each route at 768 (8 of the 10 show the dock; the signed-out campaign pages don't). They run against two local acceptance databases that hold the records: `turfcut_acc_m9` for a receipt, the worker's own shift, a pay dispute from both sides and a closed statement period; `turfcut_acc_p1` for a public campaign page and post (signed out), the organization's campaign page and staff's campaign page. The Field day page runs on the main database; the baseline simply didn't include it. `routes-*.json` lists each route and role (fed to `audit.mjs` through `ROUTES`), with `manifest-*.json`, `clearance-*.json` and screenshots per database. Each page's HTTP status (200) and unchanged URL in the manifests confirm it rendered the record, not a redirect or a 404, and the heading names it (on staff's campaign page the record's name sits below the "Campaigns" section title).
- **`after/`:** the Field map and its review queue rerun through the same audit at `d00546c`, the commit with the fix. `field-measurements.json` records the filter's widths at 390, 1024 and 1440, at the default and largest text size, with the strip cropped as screenshots.

## Results

**No route overflows sideways at either size, in either theme.** Nothing sits past the right edge. **Nothing sits behind the dock:** on all 41 rendered pages that show it (the worker shift 404 excluded), the last visible content ends at least 58px above it (`clearance/clearance.json`). The dock also hides while you scroll down. The organization rail appears at 1024 and the dock at 768, as designed, with two exceptions that aren't faults. On staff People at 768 the search box has `autoFocus`, and a focused input hides the dock by design. On the worker's profile at 1024 the audit reported a rail, a false positive: its check matched the profile page's own `aside nav`. The only console errors are on the worker's shift page, which returns 404 because the fixture shift isn't Jordan's; that's a fixture limit, not a layout fault. **The detail pages pass too** (`detail/`): none of the 40 states overflows or logs an error, the rail and dock appear as designed where the role has them, and the last content ends at least 58px above the dock (the statement period; the organization's and staff's campaign pages 59px). The worker's own shift page renders for Alex on `turfcut_acc_m9`, so the 404 above comes from the fixture, not the route. Staff's campaign page shows the worker dock at 768, the same staff navigation question as below. Two things in the screenshots aren't layout faults: the public campaign page and the organization's campaign page show a broken header image, because the acceptance database names an uploaded file that isn't in local storage; and the statement period's table (`o-statement-portrait.png`) is cramped at 768, where the Job column wraps onto six lines while the table also scrolls sideways. The audit doesn't flag content inside a scrolling table by design; **for Astra:** a minimum width for the Job column, or the job name under the date at that width, would read better.

### Fixed in this PR

**The Field map's job filter** (`src/app/globals.css`, `.map-controls`). From `lg` the field strip is a row and the live figures take the room, so at 1024 the select's text box was 34px for 48px of text (about 84px for the whole control, derived, not recorded) and showed "All jo…". Two changes fix it:
- the select has a 12rem floor from `lg`;
- the controls form no longer shrinks from `lg`, so Show stays beside the select and the figures wrap instead.

Measured (`after/field-measurements.json`; "before" is from the baseline manifest's `"All jobs" 48>34`, a 34px text box for 48px of text):

| Width | Text size | Before | After |
| :--- | :--- | :--- | :--- |
| 1024 | default | "All jobs" clipped (34px text box) | Select 192px, text fits, Show on the same line |
| 1024 | largest | not measured | Select 240px, text fits, Show on the same line |
| 390 | default | not measured (the new rules apply from `lg` only) | Select 292px, no overflow |
| 1440 | default | not measured | Select 192px, Show on the same line, no overflow |

**A long job title.** The select sizes to its longest option up to the existing 18rem cap. With a 66-character title (simulated by rewriting the "All jobs" option's text in the page, so no job is selected; no local job has a title that long) it reaches 288px at default size and 360px at the largest, and the figures beside it narrow to 390px and 287px at 1024. Nothing overflows the page, but the 66-character title itself is truncated inside the select at every width, as a native select does today past its cap. At the largest size the figures wrap into a taller block. The selected-job state with its Clear button isn't covered: the Field list only offers jobs with shifts in its window, and no local job has any.

### For Astra and Caden: the worker header at 1024–1279

Between 1024 and 1279 the worker's eight top-bar destinations show as icons only (`AppNav.tsx`, `TopNav`). That was a deliberate #113 review call: the names stay as the links' accessible names and as tooltips, and the labels appear from 1280. It's the right trade-off on a laptop, but iPad landscape (1024, 1180, 1194) falls inside that band, and on a touchscreen:

- **Tooltips never show,** so the eight icons are unnamed to a sighted user.
- **Two of them look alike.** "Jobs" and "Work" are both briefcases (`w-header-1024.png`, `w-header-1200.png`).

This affects every account whose role is WORKER (`topNavTabs()` in `src/lib/nav.ts`), **including Turfcut staff whose role is WORKER**. Staff is a separate flag. Organization roles get the labelled rail instead.

Two options, both without changing the desktop decision for a mouse:

1. **Touch tablets keep the labelled bottom dock up to 1279.** Under `(hover: none) and (pointer: coarse)` the worker header nav hides and the dock (which has labels) stays, as it does at 768. Mouse-only desktops keep the #113 icon bar. Costs:
   - a media query overriding the dock's `lg:hidden` and hiding `TopNav`;
   - bottom padding for the dock from `lg`;
   - **the dock holds five destinations plus More**, so Profile, Campaign feed and Earnings move behind More on a touch tablet. The top bar shows all eight.

   An iPad with a trackpad or keyboard still matches `pointer: coarse`, so it gets the dock too.
2. **Labels under the icons from 1024 to 1279.** Small stacked labels (about 11px), on every pointer type. By estimate (not measured) the eight items fit in about 670px, but this changes the desktop look the #113 review settled.

I lean to option 1, because it leaves the mouse experience #113 approved untouched, though it isn't the smaller code change and it moves three destinations behind More. It's a design call, so this PR doesn't build either one.

**Smaller, whichever option is chosen:** give Work its own icon (`AppNav.tsx`, `work: Briefcase`). That alone ends the two identical briefcases. The choice of icon is Astra's.

### For Astra and Caden: staff see two navigations on admin pages

A Turfcut staff account with the WORKER role gets the worker's navigation on admin pages as well as the admin rail:
- at 1024 the worker's icon bar sits above the admin rail (`baseline/a-home-landscape.png`);
- at 768 the worker's dock shows under admin pages (`baseline/a-audit-portrait.png`).

Whether admin pages should hide the worker navigation for staff is a design question. It isn't tablet-specific, and this PR doesn't change it.

## Not covered

- **Hiring routes:** in #134.
- **Content inside closed disclosures and clipped rows**, for example a timeline payload cut at the card edge on staff Audit. The audit skips clipped content by design.
- **Real devices:** native iPad, Safari, the on-screen keyboard, split-screen and safe-area insets.

Rerun: start the local stack, then:

- `FP=<folder of storage states> BASE=<local app URL> node audit.mjs <outDir> <commit> [slug filter]` for the route matrix (`CLEARANCE=1` for the dock clearance). `ROUTES=<json file>` replaces the built-in route list (see `detail/routes-*.json`; each role there names a storage state in `FP`, for example `alex` for `alex.json`). For the detail run, restart the app with `DATABASE_URL` pointing at each database in turn, sign the listed roles in against that database, and rename the outputs per database (`manifest-m9.json` and so on). `FP` holds Playwright storage states named `jordan.json` (a worker), `owner.json` (an organization owner) and `staff.json` (Turfcut staff), signed in to the local app. The script loads Playwright from `/opt/node-tools`; change the import for another install. Fixture IDs are the local test database's.
- `STORAGE=<owner storage state> BASE=<local app URL> node fieldm.mjs <outDir> <commit>` for the Field filter measurements.
