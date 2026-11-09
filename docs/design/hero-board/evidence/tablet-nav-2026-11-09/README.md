# Tablet navigation: Caden's decisions from the tablet pass

Caden approved three changes from the tablet pass (#135) on Nov 9. Two are built here; the third went back to design after review (section 3).

All evidence is the running app on the local test databases, in Chromium with touch emulation at DPR 1. It is not a real iPad, Safari, the on-screen keyboard or split-screen.

## 1. Touch tablets keep the worker's labelled dock up to 1279

Between 1024 and 1279 the worker's top bar shows icons only. Their names are tooltips, which a finger never sees, and Jobs and Work are both briefcases.

Under `(hover: none) and (pointer: coarse)` the worker now keeps the labelled dock in that band. The top bar's links step aside; the header keeps its bell, settings and theme. Elsewhere nothing changes:
- mouse desktops keep the #113 top bar;
- from 1280, every pointer gets the labelled top bar;
- organization roles keep their rail.

The cost, as #135 said: on a touch tablet, Profile, Campaign feed and Earnings sit behind More, as on a phone.

### Code

`src/app/globals.css`:
- The dock and the top bar now show and hide by width in the component layer (`.tabbar`, `.topnav`). Before, the top bar used `hidden lg:flex` utilities.
- One media query, `TOUCH_TABLET_QUERY`, does five things up to 1279. It keeps `.tabbar[data-touch-dock]` on a touch tablet and hides the top bar. It shows the top bar again while a field takes typing. It gives pages, templates, the narrow page and Tab scrolling their room above the dock. It sticks the chat composer above the dock.
- The room above the dock skips admin pages, where the dock is hidden. It also skips heroes; a hero without the sign-in form gets the dock's height instead.
- The keyboard rule that hides the dock while a field takes typing now reaches 1279. In that band the top bar stands in while you type, so a hardware keyboard doesn't strand the worker. The worker's header doesn't stick from 1024, though, so on a long form you scroll up to reach the top bar. Admin pages are excluded.

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

## 3. The statement period's Job column

At 768 a job title wraps one word to a line: six lines for "Denver Ballot Initiative - Signature Drive". I first gave the Job column `min-width: 10rem` between 640 and 1023. Both reviews caught that it hid the Current state column (the "On hold" and "Withdrawn" badges) behind the table's sideways scroll at 640 to 768. It also applied when printing, where it could cut a printed statement. It is reverted (`cddfdd6`).

`statement-sweep.mjs` measured what any minimum width would do, on `turfcut_acc_m9`'s October 2026 statement (`statement/statement-sweep.json`). "Cut" means the Current state column ends past the table's box, so it can only be seen by scrolling the table sideways.

| Width | Today | 7rem | 8rem | 9rem | 10rem |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 640 | 6 lines, cut | 5, cut | 3, cut | 3, cut | 3, cut |
| 700 | 6 lines, cut | 5, cut | 3, cut | 3, cut | 3, cut |
| 768 | 6 lines | 5, cut | 3, cut | 3, cut | 3, cut |
| 820 | 5 lines | 4 | 3 | 3, cut | 3, cut |
| 900 | 5 lines | 4 | 3 | 3 | 3, cut |
| 1024 (beside the organization rail) | 5 lines | 4 | 3, cut | 3, cut | 3, cut |
| 1280, 1440 | 5 lines | 4 | 3 | 3 | 3, cut |

So no minimum width fixes 768 without hiding a column, and at 640 and 700 the column is already cut today. It needed a layout change instead: the job now sits under the date (section 4). `statement/statement-before-*.png` and `statement-before.json` (`statementm.mjs`) show today's table.