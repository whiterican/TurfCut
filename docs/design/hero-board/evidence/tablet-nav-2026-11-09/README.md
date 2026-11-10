# Tablet navigation: Caden's decisions from the tablet pass

Caden approved three changes from the tablet pass (#135) on Nov 9. The first two are built as approved. The third came back after review and was rebuilt as a layout change (sections 3 and 4). Section 4 also changes Work's icon.

All evidence is the running app on the local test databases, in Chromium with touch emulation at DPR 1. It is not a real iPad, Safari, the on-screen keyboard or split-screen.

## 1. Touch tablets keep the worker's labelled dock up to 1279

Between 1024 and 1279 the worker's top bar shows icons only. Their names are tooltips, which a finger never sees, and Jobs and Work were both briefcases (Work is now Footprints, section 4).

Under `(pointer: coarse)` the worker now keeps the labelled dock in that band. The top bar's links step aside; the header keeps its bell, settings and theme. Elsewhere nothing changes:
- mouse desktops keep the #113 top bar;
- from 1280, every pointer gets the labelled top bar;
- organization roles keep their rail.

The cost, as #135 said: on a touch tablet, Profile, Campaign feed and Earnings sit behind More, as on a phone.

### Code

`src/app/globals.css`:
- The dock and the top bar now show and hide by width in the component layer (`.tabbar`, `.topnav`). Before, the top bar used `hidden lg:flex` utilities.
- One media query, `TOUCH_TABLET_QUERY`, does five things up to 1279. It keeps `.tabbar[data-touch-dock]` on a touch tablet and hides the top bar. It shows the top bar again while a field takes typing. It gives pages, templates, the narrow page and Tab scrolling their room above the dock. It sticks the chat composer above the dock.
- The room above the dock skips admin pages, where the dock is hidden. It also skips heroes; a hero without the sign-in form gets the dock's height instead.
- The keyboard rule that hides the dock while a field takes typing now reaches 1279. In that band the top bar stands in while you type, so a hardware keyboard doesn't strand the worker. The header sticks while you type, so the bar is on screen even far down a long form (`touch-dock/typing-header.json`, by `typing-header.mjs`: on Profile, scrolled 2,751px down, the bar sits 10px from the top; on a mouse nothing changes). Admin pages and chat threads are excluded.

`src/components/AppNav.tsx`:
- `TopNav` uses `.topnav`.
- `OrgTabBar` takes `touchDock`, which `src/app/layout.tsx` sets only for the worker's dock.
- The More sheet closes only when the dock itself goes, using the same exported `TOUCH_TABLET_QUERY`. `design-tokens.test.ts` checks the CSS uses that string.
- If the dock hides with the sheet open, focus goes to the page content.

The More sheet used to be hidden from 1024 by a width rule. On a touch tablet, More would have opened an invisible modal over an inert page. The evidence caught this before any review; the rule is gone (`6bbc62e`).

### Evidence

`touch-dock/` at `cddfdd6`, run by `touchdock.mjs`:

| Check | Result |
| :--- | :--- |
| Every worker route (20, including the signed-in landing page) at touch 1024×768 and touch 1194×834 | Dock shown, top bar hidden, no overflow, no console errors |
| Last visible content above the dock, scrolled to the end | At least 58px on all 43 rows that show the dock |
| Landing page, home and a conversation at touch 1180×820 | Same as above |
| Mouse 1024×768 | Top bar shown, dock hidden (unchanged) |
| Touch 1280×800 | Top bar with labels, dock hidden |
| Chat composer | Sticks 96px up on touch tablets, above the dock's top edge; 0 on a mouse |
| More sheet opened at 768, then rotated to 1024 | Touch: stays open and visible. Mouse: closes as the dock goes |
| More sheet opened at touch 1024 | Visible; Earnings navigates and the sheet closes |
| Typing in a field at touch 1024 (worker, Availability) | Dock steps aside, top bar stands in |
| Typing at touch 1024 on an admin page (staff, People) | Neither worker bar shows |
| Organization owner at touch 1024 | Rail shown, no dock (unchanged) |

`manifest.json` records each row's state before its screenshot. The worker's only open conversation exists because I pressed "Message your current contact" in the local database, which reopened the conversation with a current contact. It is local fixture data.

### Devices the emulation doesn't settle

- **Windows touch laptops and Surface with the keyboard attached.** They report `hover: hover` and `pointer: fine`, so they keep the icon-only top bar, and a finger there still gets no names. Matching `any-pointer: coarse` would include them, but it would also give the dock to touchscreen laptops used with a mouse. That's Caden's call; this branch doesn't do it. A detached Surface usually reports a coarse pointer and gets the dock.
- **An iPad with a trackpad.** Not tested. Safari may keep reporting `none`/`coarse` (dock) or switch to `hover`/`fine` (top bar, whose tooltips the trackpad can show). Either way there is navigation.
- **Split View, Slide Over and Stage Manager.** A window narrower than 1024 already had the phone dock; other widths follow the same rules.
- **`hover: none` with `pointer: fine`.** The query fails, so the top bar shows.
- **Touch tablets that report hover (Nov 10).** The query first also asked for `hover: none`. Chromium on some Samsung tablets reports `hover: hover` on a touchscreen ([MDN's note on `hover`](https://developer.mozilla.org/docs/Web/CSS/@media/hover), [a write-up](https://www.ctrl.blog/entry/css-media-hover-samsung.html)), which would have left them on the icon-only top bar. The query now asks only for a coarse primary pointer. Not measured: Chromium here would not emulate a coarse pointer that hovers, so this rests on the rule's logic. Re-checked at `1d60de9`: with touch the dock shows and the top bar's links go; with a mouse the top bar stays.

### Not changed

- **The theme toggle stays icon-only from 1024**, on touch tablets too, even though the top bar's links have stepped aside. Optional.

## 2. Admin pages show only the console's navigation for staff

A Turfcut staff account with the WORKER role saw two navigations on admin pages:
- at 1024, the worker's icon bar above the console's rail;
- at 768, the worker's dock under admin pages.

A rule was already meant to hide that top bar (`body:has(.staff-band) …`), but it lost to the top bar's `lg:flex` utility. With the top bar's display now in the component layer (change 1), the rule applies, and it now covers the dock too.

The console's rail (from 1024) and its section chips (on a phone) are its navigation. The staff band's Leave admin goes back to the worker's pages.

`staff-nav/` at `cddfdd6`, run by `staffnav.mjs`: staff on `/admin`, `/admin/audit` and `/admin/people`, at touch 768, touch 1024, mouse 1024 and mouse 1440 (12 states).
- No worker top bar and no worker dock on any of them.
- The staff rail shows from 1024 and the section chips at 768; Leave admin shows everywhere.
- The same login on `/dashboard` keeps the worker's navigation: the dock at 768 and on the touch tablet, the top bar on a mouse.
- No overflow and no console errors.
- The `sectionChips` field is a loose selector: it also reads true on the worker's `/dashboard` at 768, so that row's value means nothing.

## 3. The statement period's Job column: a minimum width doesn't work

At 768 a job title wraps one word to a line: six lines for "Denver Ballot Initiative - Signature Drive". I first gave the Job column `min-width: 10rem` between 640 and 1023. Both reviews caught that it hid the Current state column (the "On hold" and "Withdrawn" badges) behind the table's sideways scroll at 640 to 768. It also applied when printing, where it could cut a printed statement. It is reverted (`cddfdd6`).

`statement-sweep.mjs` measured what any minimum width would do, on `turfcut_acc_m9`'s October 2026 statement (`statement/statement-sweep.json`). "Cut" means the Current state column ends past the table's box, so it can only be seen by scrolling the table sideways.

| Width | Before (no minimum) | 7rem | 8rem | 9rem | 10rem |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 640 | 6 lines, cut | 5, cut | 3, cut | 3, cut | 3, cut |
| 700 | 6 lines, cut | 5, cut | 3, cut | 3, cut | 3, cut |
| 768 | 6 lines | 5, cut | 3, cut | 3, cut | 3, cut |
| 820 | 5 lines | 4 | 3 | 3, cut | 3, cut |
| 900 | 5 lines | 4 | 3 | 3 | 3, cut |
| 1024 (beside the organization rail) | 5 lines | 4 | 3, cut | 3, cut | 3, cut |
| 1280, 1440 | 5 lines | 4 | 3 | 3 | 3, cut |

So no minimum width fixes 768 without hiding a column, and at 640 and 700 the column was already cut. It needed a layout change instead: the job now sits under the date (section 4). `statement/statement-before-*.png` and `statement-before.json` (`statementm.mjs`) show the table before.

## 4. Decided: Work's icon and the job under the date

Astra was out of usage, so Caden asked Claude to decide (Nov 9). Below are the options as they were set out, as mockups (`for-astra/*.mjs`, rearranged in the browser), then what was built. Astra can still change either.

**Work's icon** (`for-astra/work-icon-options.png`): the worker's dock at 390 with each candidate swapped into Work.
- Before this change Jobs and Work were both a briefcase.
- The candidates are CalendarClock, CalendarDays, Footprints, Route, ClipboardCheck, ListChecks, Backpack, Timer and Clock, all from lucide, which the app already uses.
- Near-clashes with icons already in the worker's navigation:
  - Availability, under More, is CalendarCheck, so CalendarClock and CalendarDays would put a second calendar there;
  - ClipboardCheck is close to Hiring's ClipboardList, though Hiring is in the organization's rail, not the worker's.
- My lean is **Footprints**: it reads as field work and clashes with nothing. If Work should read as your schedule, **CalendarDays** is the clearer calendar, next to Availability's under More.

**The statement period's table** (`for-astra/stmt-*-768.png` and `-1024.png`), measured on the October 2026 statement:

| Layout | At 768 | At 1024 |
| :--- | :--- | :--- |
| Before | Job wraps to 6 lines; the table is 637px tall and overflows by 2px | 5 lines; 557px |
| Job name under the date (the Job column goes) | Every column visible, Current state included; no overflow; the title takes 2 lines; 425px tall | No overflow; 414px |
| Stacked rows, as on a phone, up to 1024 | Fits, but 1,313px tall, and the column header strip reads oddly | Same |

The heights in this table come from a console run of `for-astra/statement-layouts.mjs`, which saves only screenshots. My lean is the **job name under the date**. It keeps the table a table, every column stays visible, and it's the smallest change: the Date cell gains a muted second line, and the header reads "Date · Job".

### Built

**Work is Footprints** in the dock and the top bar (`AppNav.tsx`). `work-icon/` at `2b5ce49` (`work-icon.mjs`) records each link's icon by its lucide class: Jobs `lucide-briefcase` and Work `lucide-footprints`, in the dock at 390 and the top bar at mouse 1024 and 1440.
- Footprints reads as canvassing, which is most of the field work here; it fits phone and text banking less well.
- Sitting next to Map in an app that uses location, a cautious worker could read it as "we track where you walked". The label says Work. **CalendarDays** is the fallback if Work should read as "your schedule".

**The job sits under the date** (`StatementView.tsx`, `.statement-date-job` and `.statement-job`).
- The Job column goes, and the job is a line under the date, in the ink colour, since owners reconcile by job.
- The header reads "Date · Job"; its spoken name is a separate screen-reader text, "Date and job".
- On a phone, the stacked row is labelled "Date · Job", with the job under the date.
- A correction's reference and a receipt number never break at their hyphens.
- The total row spans three columns. The CSV is unchanged, with its own `project` column.

Measured with `statement-after.mjs` at `1d60de9` (`statement/statement-after.json`). Print is measured after the print rules apply.

| Width | Table | Current state | Job title |
| :--- | :--- | :--- | :--- |
| 390 (stacked rows) | Fits | Visible | 1 line |
| 640 | Fits (145px over before) | Visible | 3 lines |
| 768 | Fits (2px over before) | Visible | 3 lines (6 before); 470px tall (637 before) |
| 1024 | Fits | Visible | 2 lines (5 before) |
| 1440 | Fits | Visible | 2 lines (5 before) |
| Print, 720px wide (about a Letter page's printable width) | Fits: 703px in its box | On the page | 3 lines |

The job line keeps a 7rem minimum. An 8rem minimum gave two-line titles at 768 but pushed Current state 3px past the box in print. With no minimum, titles took three lines even at 1024 and 1440.

**Still imperfect:**
- **640 to 735px (fixed Nov 10).** Current state needed the table's sideways scroll from 640 to 704. On screen in that band the cells are now tighter (6px a side, 12px elsewhere) and a worker's name may wrap, as it does on a phone. The sweep in `statement-after.json` shows no overflow at any width from 640 to 736. Print is unchanged.
- **Untested cases.** The test database has one job, no "Other pay" lines, no corrections, and only light mode here. The cross-reviewer simulated them in the browser:
  - a 79-character title takes 5 lines at 768 and 4 at 1024;
  - "Other pay" shows "—" with "Other pay" under it;
  - the job line reads well in dark mode.
  - with no correction in the data, the unbreakable correction references weren't measured for width; they are short (a period, a receipt number).
- **Follow-up:** lines are listed in the order they were recorded, not grouped by job. Grouping, or a link from each "By campaign" total to its lines, would make reconciling easier.

## Checks

- `tsc` and `eslint` are clean, and vitest passes 1,022 tests.
- Merged onto master as of Nov 9 (with #131 and #133), `tsc` is clean and all 1,030 tests pass.
- `design-tokens.test.ts` pins:
  - the staff rule, and the touch-tablet rules with their staff and hero exclusions;
  - the typing rule and the 1279 keyboard rule, with the same list of fields;
  - the shared media query;
  - that the More sheet has no width rule and no `display: none`;
  - that the top bar has no display utility.
- Changes 1 and 2: a rule-9 reviewer and an independent reviewer standing in for Codex until the 12th found nothing blocking. A third reviewer re-checked every fix.
- Section 4 had both reviews as well. Both approved the two calls. Their findings are fixed and re-measured above:
  - this README had been cut short by a bad edit;
  - the print measurement was taken in screen mode;
  - the 8rem minimum cut Current state in print;
  - a fragile header name;
  - references broke at their hyphens;
  - the cell was styled through its visible label;
  - the job line was muted.

## Rerun

Start the local stack, then:
- `FP=<storage states> BASE=<app> node touchdock.mjs <outDir> <commit>`, with `jordan.json` (a worker), `owner.json` (an organization owner) and `staff.json` (Turfcut staff with the WORKER role);
- `FP=<storage states> node staffnav.mjs <outDir> <commit>`, with `staff.json`;
- `STORAGE=<an owner's storage state> PERIOD=2026-10 node statement-sweep.mjs <outDir> <commit>` (and `statementm.mjs <outDir> <commit> <label>`), against a database with a closed statement (`turfcut_acc_m9` here);
- `STORAGE=<an owner's storage state> node statement-after.mjs <outDir> <commit>` for the built table, against the same database;
- `STORAGE=<a worker's storage state> node work-icon.mjs <outDir> <commit>`.
