# Tablet pass: every route outside the hiring family

The app-wide tablet pass Caden asked for. The hiring routes were audited separately by Codex in #134; this covers everything else. [Board claim](https://github.com/whiterican/TurfCut/issues/128).

## How it was run

`audit.mjs` loads each route as its real role on the local test database: a worker (Jordan), an organization owner, Turfcut staff, or signed out. It starts at 768×1024 portrait, then resizes to 1024×768 landscape without reloading, like a rotation. It runs once in light and once in dark. At each size it records, before any screenshot:

- horizontal overflow (`over`; −15 at 1024 is the page's own scrollbar);
- any element past the right edge that no ancestor scrolls or clips;
- whether the bottom dock or the organization rail shows;
- the main column's width;
- every visible native select whose chosen option is wider than its text box (24px allowance for the arrow, as in #130);
- console and page errors.

This is Chromium with touch enabled, at DPR 1. It is not a real iPad, Safari, the on-screen keyboard or split-screen.

- **`baseline/`:** 46 routes × 2 sizes × 2 themes = 184 measured states on master `ea9f5d8`, with a light screenshot at each size (92) and `manifest.json`. That's 45 rendered routes; the worker's shift page returns 404 (see below). `w-header-1024.png`, `-1200`, `-1280` and `-1440` show the worker header across the band.
- **`after/`:** the Field map and its review queue rerun through the same audit at `d00546c`, the commit with the fix. `field-measurements.json` records the filter's widths at 390, 1024 and 1440, at the default and largest text size, with the strip cropped as screenshots.

## Results

**No route overflows sideways at either size, in either theme.** Nothing sits past the right edge. The organization rail appears at 1024 and the dock at 768, as designed, with two exceptions that aren't faults. On staff People at 768 the search box has `autoFocus`, and a focused input hides the dock by design. On the worker's profile at 1024 the audit reported a rail, a false positive: its check matched the profile page's own `aside nav`. The only console errors are on the worker's shift page, which returns 404 because the fixture shift isn't Jordan's; that's a fixture limit, not a layout fault.

### Fixed in this PR

**The Field map's job filter** (`src/app/globals.css`, `.map-controls`). From `lg` the field strip is a row and the live figures take the room, so at 1024 the select shrank to about 84px and showed "All jo…". Two changes fix it:
- the select has a 12rem floor from `lg`;
- the controls form no longer shrinks from `lg`, so Show stays beside the select and the figures wrap instead.

Measured (`after/field-measurements.json`; "before" is from the baseline manifest's `"All jobs" 48>34`, a 34px text box for 48px of text):

| Width | Text size | Before | After |
| :--- | :--- | :--- | :--- |
| 1024 | default | "All jobs" clipped (34px text box) | Select 192px, text fits, Show on the same line |
| 1024 | largest | not measured | Select 240px, text fits, Show on the same line |
| 390 | default | not measured (the new rules apply from `lg` only) | Select 292px, no overflow |
| 1440 | default | not measured | Select 192px, Show on the same line, no overflow |

**A long job title.** The select sizes to its longest option up to the existing 18rem cap. With a 66-character title (simulated by rewriting the "All jobs" option's text in the page, so no job is selected; no local job has a title that long) it reaches 288px at default size and 360px at the largest, and the figures beside it narrow to 390px and 287px at 1024. Nothing overflows; at the largest size the figures wrap into a taller block. A native select still truncates a title longer than the cap, as it does today. The selected-job state with its Clear button isn't covered: the Field list only offers jobs with shifts in its window, and no local job has any.

### For Astra and Caden: the worker header at 1024–1279

Between 1024 and 1279 the worker's eight top-bar destinations show as icons only (`AppNav.tsx`, `TopNav`). That was a deliberate #113 review call: the names stay as the links' accessible names and as tooltips, and the labels appear from 1280. It's the right trade-off on a laptop, but iPad landscape (1024, 1180, 1194) falls inside that band, and on a touchscreen:

- **Tooltips never show,** so the eight icons are unnamed to a sighted user.
- **Two of them look alike.** "Jobs" and "Work" are both briefcases (`w-header-1024.png`, `w-header-1200.png`).

This affects workers only: organization roles and Turfcut staff get the labelled rail from 1024 (`topNavTabs()` returns nothing for other roles).

Two options, both without changing the desktop decision for a mouse:

1. **Touch tablets keep the labelled bottom dock up to 1279.** Under `(hover: none) and (pointer: coarse)` the worker header nav hides and the dock (which has labels) stays, as it does at 768. Mouse-only desktops keep the #113 icon bar. Costs:
   - a media query overriding the dock's `lg:hidden` and hiding `TopNav`;
   - bottom padding for the dock from `lg`.

   An iPad with a trackpad or keyboard still matches `pointer: coarse`, so it gets the dock too.
2. **Labels under the icons from 1024 to 1279.** Small stacked labels (about 11px), on every pointer type. By estimate (not measured) the eight items fit in about 670px, but this changes the desktop look the #113 review settled.

I lean to option 1, because it leaves the mouse experience #113 approved untouched, though it isn't the smaller code change. It's a design call, so this PR doesn't build either one.

## Not covered

- **Hiring routes:** in #134.
- **Detail pages with no local fixture:** a campaign's public page and post, a receipt, a pay or worker dispute, a statement period.
- **The worker's own shift page:** 404 for this worker.
- **Real devices:** native iPad, Safari, the on-screen keyboard, split-screen and safe-area insets.

Rerun: start the local stack, then:

- `node audit.mjs <outDir> <commit> [slug filter]` for the route matrix. It uses the session's Playwright and per-role storage states.
- `STORAGE=<owner storage state> BASE=<local app URL> node fieldm.mjs <outDir> <commit>` for the Field filter measurements.
