# Hiring tablet audit and table keyboard focus fix

[Board claim](https://github.com/whiterican/TurfCut/issues/128#issuecomment-6727756182). This is a read-only audit of master `ea9f5d8bf9b7f8b86b35af94d7289651eebbc1c5`, excluding unmerged #130, #131, #132 and #133. The initial audit is preserved below. A subsequent keyboard regression found a clipped focused sort control; implementation `3399f5c` adjusts only the containing DataTable’s horizontal scroll when a sort button receives focus. No schema, dependency, data/action, permission or policy-copy changes. This does not approve an app-wide tablet layout.

`manifest.json` records the actual routes, local fixtures, viewport sizes, selected native values, overflow, loaded font and browser errors. Ten routes cover Pipeline, the initial New job step, the owned job page, Applicants, Matches, Invitations, shared/withheld candidate views and shared/withheld employer views of workers. Each page is resized from 768×1024 portrait to 1024×768 landscape without reloading, in light and dark themes. There are 40 route/viewport/theme captures, each with viewport and full-height images. The initial builder is inspected without editing fields or starting autosave; other builder steps are outside this audit.

Applicants selects the actual longest not-selected reason and applies the open-stage filter through the real GET form. The organization inspector must remain hidden below its 1280px breakpoint. No bulk move, offer, invitation, publish, draft autosave, sharing or political-preference action is submitted. Guarded routes, session/profile/grant queries and data loading execute against the isolated local PostgreSQL database. Framework background reads may use POST; that is not a submitted mutation action.

This is Chromium at DPR1 with desktop mouse/keyboard APIs and resized viewports. It does not test native iPad hardware, Safari/WebKit, touch gestures, the virtual keyboard, split-screen, safe-area insets, or production Supabase authentication/realtime. Selected-option widths use a conservative 24px allowance for the native arrow; a clipped label is a recorded audit observation, not a screenshot claim that the platform picker is inaccessible. `smallTargets` records visible box heights only, **not** hit areas: pseudo-element extensions are not measured here. Existing #132/#133 pointer evidence is separate.

Viewport screenshots retain the actual fixed header/dock. Full-height screenshots keep the header in flow at the top and place the dock at the page end to avoid capture-only occlusion. Screenshot caret hiding is disabled so the capture tool does not mutate input styles before hydration.

## Results and disposition

The initial evidence-only audit passed typecheck and harness ESLint without repeating the unit suite. After the focus fix, typecheck, full lint and all **1,021 tests in 119 files** passed. Browser regressions below verify the changed behavior.

The 40-case matrix completed with Inter loaded, no horizontal page overflow and no recorded console/page errors. The organization inspector stayed hidden at both tablet widths. Disclosures, filters and route content remain usable in the recorded states; this does not establish coverage for every role, data volume or workflow.

The Applicants longest reason measures 328.06px against a conservative 325px available label width on master. The native picker retains the complete wording, but there is no wrapping full-value caption. This width-risk observation is already addressed by #133, whose separate tablet evidence verifies its caption and retained inputs. No competing fix is added here. The audit excludes controls hidden inside closed disclosures using `checkVisibility()`; their layout boxes alone are not evidence of a visible clipped field.

| Coverage | Evidence | Limits / follow-up |
| :--- | :--- | :--- |
| Pipeline | Real local rows at both orientations | Counts reflect fixture data, not production |
| Initial builder | Actual blank New job step | No editing/autosave; later steps and long campaign/app selections remain #130 coverage |
| Job page | Actual owned job | Master publishing layout; unmerged #131 groups are not in these captures |
| Applicants | GET stage filter, longest reason, inspector breakpoint | Count-only controls/full-value captions are in #133 |
| Matches / Invitations | Actual local route states | No invitation or hiring action submitted |
| Candidate / worker views | Shared and withheld local cases | Unmerged #132 compaction is separate; no consent changes |

Native iPad/Safari/touch, virtual keyboard, split-screen/safe-area behavior, additional role/refusal states, builder steps beyond the initial one, and app-wide routes remain outside this limited audit. Claude's independent review at `d168a66` found no blockers; the reproduction follow-ups below are pending recheck. Astra's visual review is still requested before closing the claim. Caden retains merge/deploy and product-copy decisions.

## Keyboard regression and fix

`keyboard-before-manifest.json` records four native-keyboard cases at 768×1024 / 1024×768, light/dark, on `da10bce` (unchanged master app). The dock is present at 768 and the organization rail at 1024; exactly one Main navigation is visible. Enter opens the dock’s More dialog; Escape closes it and returns focus. Space opens the native filter disclosure. Home/ArrowDown/Enter changes the native stage and bulk/reason selects; Enter on Show submits the real GET filter. No mutation action is submitted.

The initial harness attempted the controlled bulk select immediately after the GET navigation and failed. It now waits for the navigation’s network activity to settle before exercising that control; the complete native-keyboard run then passed. This is harness readiness handling, not a claimed application fix.

Fifty Tab steps per case exposed one real control problem at 1024, in both themes: the “Signatures / active hr” sort button received focus with its center outside the table viewport. The two `keyboard-before-1024-*.png` screenshots record that clipped focus. Wrapped inline links initially produced false center-box flags; the final harness checks actual text fragments, excluding the named table container from control-visibility assertions.

The fix in `src/components/staff/DataTable.tsx` handles focus on sort buttons only when the table overflows horizontally. It reveals the button with four pixels of clearance inside the scrollport. It does not scroll the page or table vertically, change focus order, replace native controls, alter sorting or touch row selection/data.

`keyboard-manifest.json` pins `3399f5c`: the same four cases assert that every sampled main control has at least one visible, uncovered fragment. A direct focus with `preventScroll` after scrolling right verifies that the leftmost sort is revealed while table scrollTop and page scrollY remain unchanged. Four viewport screenshots record the completed state. `table-smoke-manifest.json` adds six real Pipeline cases at 320, 390 and 1440 in both themes, asserting every sort control fits its scrollport, no page overflow/errors, and Inter loaded. Six viewport images record those checks.

These are Chromium desktop-keyboard tests at resized viewport dimensions, not native iPad/external-keyboard, Safari or exhaustive accessibility certification. The original 40-case baseline stays pinned to master; the newer keyboard/smoke manifests pin the focus-fix implementation. Both are intentionally retained rather than conflated.

## Local fixtures and reproduction

The database is the isolated `turfcut_acc_c3` instance on 127.0.0.1:55438, prepared during earlier c3 acceptance checks and local hiring evidence. No database is rebuilt or written by this audit. Fictional worker names and existing seed names identify local data, not production users. The Sam fixture has all sharing audiences set to NOBODY; Riley has a synthetic partial sharing choice; those choices were made through versioned app functions in earlier evidence work. The audit reuses them without changing history or consent. A synthetic loopback auth/user response and no-op realtime acknowledgements let the real guarded pages execute; they do not establish production authentication or realtime delivery.

The committed `applicants-cases.json` and `people-cases.json` are the audit defaults. They contain only the fictional local fixture IDs/descriptions already recorded in `manifest.json`; the manifest is the source of truth for the captured route IDs. No uncommitted `/tmp` file is required. Another machine still needs the matching local fixture database (or replacement local cases supplied with CASES_PATH/PEOPLE_PATH); committing route IDs does not recreate database rows. The audit does not provision or seed a database.

Set DATABASE_URL to your isolated local fixture database URL, for example through the process environment. Replace `<local-db-url>` below with that URL; never use a production service. These commands start only local fixture services:

```sh
node docs/design/hero-board/evidence/hiring-tablet-2026-11-08/auth-fixture.mjs
DATABASE_URL="<local-db-url>" NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55521 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-test-fixture npm run dev -- --hostname 0.0.0.0 --port 3020
```

Run the audit using an external Playwright installation and `/usr/bin/chromium`:

```sh
PLAYWRIGHT_PATH=/absolute/path/to/playwright node docs/design/hero-board/evidence/hiring-tablet-2026-11-08/audit.mjs
PLAYWRIGHT_PATH=/absolute/path/to/playwright node docs/design/hero-board/evidence/hiring-tablet-2026-11-08/keyboard.mjs
PLAYWRIGHT_PATH=/absolute/path/to/playwright node docs/design/hero-board/evidence/hiring-tablet-2026-11-08/table-smoke.mjs
npx eslint docs/design/hero-board/evidence/hiring-tablet-2026-11-08/*.mjs
```

`CASES_PATH` and `PEOPLE_PATH` optionally override the committed case files. The default cases were checked against the captured manifest and the prior local case files; the selected routes and IDs are identical. This reproduction-only follow-up changes no captured UI; the original 40-case evidence remains pinned to master `ea9f5d8`. Stop local app/auth processes afterwards. Never deploy or configure a production service with the synthetic auth fixture.
