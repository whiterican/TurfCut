# Tablet navigation: the three changes from the tablet pass

Caden approved three changes from the tablet pass (#135) on Nov 9. This folder is their evidence: the running app on the local test databases, in Chromium with touch emulation at DPR 1. That is not a real iPad, Safari, the on-screen keyboard or split-screen.

## 1. Touch tablets keep the worker's labelled dock up to 1279

Between 1024 and 1279 the worker's top bar shows icons only. Their names are tooltips, which a finger never sees, and Jobs and Work are both briefcases. Under `(hover: none) and (pointer: coarse)` the worker now keeps the labelled dock in that band instead, and the top bar's links step aside (the header keeps its bell, settings and theme). Mouse desktops keep the #113 top bar, from 1280 every pointer gets the labelled top bar, and organization roles keep their rail.

Code:
- `src/app/globals.css`: the dock and top bar show and hide by width in the component layer (`.tabbar`, `.topnav`). One media query keeps `.tabbar[data-touch-dock]` on a touch tablet up to 1279, hides the top bar there, and gives pages and templates their room above the dock. The chat composer sticks above the dock. The keyboard rule that hides the dock while typing now reaches 1279.
- `src/components/AppNav.tsx`: `TopNav` uses `.topnav`. `OrgTabBar` takes `touchDock` (set only for the worker's dock in `src/app/layout.tsx`), and its More sheet closes only when the dock itself goes.
- The More sheet had a width rule that hid it from 1024, so More on a touch tablet opened an invisible modal over an inert page. The evidence caught this, and the rule is gone (`6bbc62e`): the sheet opens only from the dock and closes when the dock goes.

The cost, as #135 said: on a touch tablet Profile, Campaign feed and Earnings sit behind More, as on a phone.

Evidence, `touch-dock/` at `6bbc62e`, run by `touchdock.mjs`:

| Check | Result |
| :--- | :--- |
| Every worker route (19) at touch 1024×768 and touch 1194×834 | Dock shown, top bar hidden, no overflow, no console errors |
| Last visible content above the dock, scrolled to the end | At least 58px on all 40 rows that show the dock |
| Home and a conversation at touch 1180×820 | Same as above |
| Mouse 1024×768 | Top bar shown, dock hidden (unchanged) |
| Touch 1280×800 | Top bar with labels, dock hidden |
| Chat composer | Sticks 96px up on touch tablets, above the dock's top edge; 0 on mouse |
| More sheet opened at 768, rotated to 1024 | Touch: stays open and visible. Mouse: closes as the dock goes |
| More sheet opened at touch 1024 | Visible; Earnings navigates and the sheet closes |
| Organization owner, touch 1024 | Rail shown, no dock (unchanged) |

`manifest.json` records each row's state before its screenshot. The only open conversation for the worker exists because I pressed "Message your current contact" in the local database, which reopened the conversation with a current contact. It's local fixture data.

**Not changed: Work's icon.** It is still a briefcase, like Jobs. The dock's labels name both, so this matters less on a tablet now, but the icon choice is Astra's.

## 2. Admin pages show only the console's navigation for staff

A Turfcut staff account with the WORKER role saw the worker's icon bar above the console's rail at 1024, and the worker's dock under admin pages at 768. A rule already meant to hide that top bar (`body:has(.staff-band) …`) lost to the top bar's `lg:flex` utility. With the top bar's display now in the component layer (change 1), the rule applies, and it now covers the dock too. The console's rail (from 1024) and its section chips (on a phone) are its navigation, and the staff band's Leave admin goes back to the worker's pages.

Evidence, `staff-nav/` at `503e34c`, run by `staffnav.mjs`: staff on `/admin`, `/admin/audit` and `/admin/people` at touch 768, touch 1024, mouse 1024 and mouse 1440 (12 states) show no worker top bar and no worker dock. They show the staff rail from 1024, the section chips at 768, and Leave admin everywhere. The same login on `/dashboard` keeps the worker's navigation: the dock at 768 and on the touch tablet, the top bar on a mouse. No overflow, no console errors.

## 3. The statement period's Job column

At 768 a job title wrapped one word to a line, six lines for "Denver Ballot Initiative - Signature Drive". Measured with `statementm.mjs` on `turfcut_acc_m9`'s October 2026 statement, before at `9d210b9` (the commit before the change) and after at `782a6fd` (`statement/`). "Lines" are the title's own text lines.

| Width | Before | After |
| :--- | :--- | :--- |
| 640 | 6 lines in 87px; table scrolls sideways (705 in 560) | 3 lines in 160px; still scrolls (777 in 575) |
| 768 | 6 lines in 87px; table scrolls sideways (705 in 703) | 3 lines in 160px; still scrolls (777 in 703) |
| 1024 | 5 lines in 94px; fits (724) | Unchanged |
| 1440 | 5 lines in 109px; fits (766) | Unchanged |

The Job column keeps 10rem only between 640 and 1023, where the table already scrolls sideways inside its box. From 1024 the table fits its box, and every other column is already at its narrowest. A wider Job column there would make the table scroll on desktops too, so those widths are unchanged and the title still takes five lines. **For Astra:** the fuller fix is a layout choice, such as the job name under the date, or fewer columns on the record page. This change doesn't make it.

## Checks

`tsc` and `eslint` are clean, and vitest passes 1,022 tests. `design-tokens.test.ts` pins the staff rule and the touch-tablet rules.

## Rerun

Start the local stack, then:
- `FP=<storage states> BASE=<app> node touchdock.mjs <outDir> <commit>`, with `jordan.json` (a worker) and `owner.json` (an organization owner);
- `FP=<storage states> node staffnav.mjs <outDir> <commit>`, with `staff.json` (Turfcut staff whose role is WORKER);
- `STORAGE=<an owner's storage state> PERIOD=2026-10 node statementm.mjs <outDir> <commit> <before|after>`, against a database with a closed statement (`turfcut_acc_m9` here).
