# Applicants revisions: running-app evidence

Board claim: [#128](https://github.com/whiterican/TurfCut/issues/128#issuecomment-6726499521). PLAN.md §5 in #126. Implementation and the three primary manifests: `919a7dd9084c0b4d5f07da31d25440b9fdafa6ce`.

The bulk form shows a live selection count and keeps its controls mounted but hidden/disabled with no selections. Checking a table row opens the controls; temporary deselection keeps the chosen action, reason and note. The selection store reads successful controls belonging to that form and follows external-checkbox changes, row replacement/sorting and native reset. A successful action keeps the existing behavior of clearing selection; a refused action preserves selection and inputs. While pending, only the submit button disables, preserving the original input editability.

The table's withheld cells now say "Not shared" with unchanged null sort values and withheld flags. Policy paragraphs and filtering/ranking rules are unchanged. The stage, bulk reason and individual/inspector reason selects remain native; only a clipped selected option gets a wrapping visual caption. The caption is hidden from assistive technology because the native option already exposes the complete text. Small actions use a route-scoped hit-area extension without changing the visible box or typography.

`ReadableSelect.tsx` is byte-identical to the independently reviewed helper in unmerged #130 (blob `4ce00d35ae2a118eb5e0ec312675a6c564651065`). It is included so this master-based branch builds independently; no dependency on unmerged #130 or #132 is required. No schema, dependency, server action, authorization loader or global stylesheet changed.

## Recorded checks

- Typecheck, lint and the full master-based unit suite: **1,021 tests in 119 files passed**. This branch does not contain the extra tests from unmerged #132. Existing applicant tests retain their sort/withholding assertions with the corrected display capitalization.
- `interactions-manifest.json`: two external selections survive table sorting; native reset clears them; temporary deselection preserves action/reason/note; a real server refusal for an unknown engagement preserves those inputs; a real successful local review action clears selection and collapses controls. The refusal request is delayed 500ms in the browser harness to verify that the submit button disables while inputs stay editable. This is artificial transport latency, not an application performance measurement.
- `manifest.json`: 46 states across 320×844, 390×844 and 1440×900, light/dark. Each has viewport and full-height images: no selection, one/two selected, longest bulk reason, longest stage filter selected with the keyboard and applied through the actual GET form, filtered empty, genuinely empty, and desktop inspector with its longest reason selected. The filtered-empty masthead retains the real total counts; the genuinely empty job has zero applicants. Political-fit content does not appear in the inspector.
- `targets-manifest.json`: six width/theme cases hit-test scoped small actions and the bulk submit button at quarter-pixel intervals. All measured targets are at least **44.5px**. Existing native checkboxes and inherited filter-chip targets are unchanged and are not claimed as44px.

`tablet-manifest.json` adds four read-only Applicants cases at 768×1024 and 1024×768, light/dark, captured at `fd0746a` (same implementation). The same selected row, action, longest reason and note survive resizing without reloading. The inspector is absent below its desktop breakpoint. Eight screenshots record the results. Viewport dimensions are explicit; `height` records full document height. This is Chromium at DPR1, not native iPad/Safari/touch coverage or app-wide tablet signoff. No server mutation was submitted.

All captured states loaded Inter and had no horizontal page overflow or browser console/page errors. Selected-option measurements record the complete option text, text width, available space and caption; no wording is shortened. Full-height screenshots place the dock at the page's end and keep the header in flow at the top to avoid capture-only occlusion. Viewport images retain their actual fixed behavior. Screenshot caret hiding is disabled so capture tooling does not mutate input styles before hydration.

## Fixture boundaries

Everything runs against the isolated local `turfcut_acc_c3` PostgreSQL database, initially made by the repository's c3 acceptance suite. `prepare-fixtures.ts` refuses non-loopback, non55438, other-database or query-overridden URLs. It adds two clearly named fictional local workers and uses the real applyToJob function; no political preferences are supplied. Their generated IDs and the real empty job are recorded in the manifests. Earlier local fixture workers may remain, so counts are read from the real page, never invented or hardcoded.

The actual guarded Next routes, session/profile/grant queries, components and bulk server action execute. `auth-fixture.mjs` is an intentionally synthetic, loopback-only user response and no-op realtime acknowledgement, using the websocket package already bundled with locked Next. It does not implement authentication or prove production Supabase authentication, email delivery or realtime behavior. No production service/data was used. The successful review creates an actual append-only local engagement event; no recorded history is updated or deleted.

## Reproduce

Use the locked dependencies, generated Prisma client, a separate PostgreSQL17 instance at localhost:55438 with psql available, and an external Playwright/Chromium installation. Stop the app before rebuilding its database. These commands modify only the separate local acceptance database:

```sh
PGURL=postgresql://turfcut:local-only@localhost:55438 bash tests/acceptance/run.sh c3
DATABASE_URL=postgresql://turfcut:local-only@localhost:55438/turfcut_acc_c3 npx tsx docs/design/hero-board/evidence/hiring-applicants-2026-11-08/prepare-fixtures.ts
node docs/design/hero-board/evidence/hiring-applicants-2026-11-08/auth-fixture.mjs
```

In another terminal:

```sh
DATABASE_URL=postgresql://turfcut:local-only@localhost:55438/turfcut_acc_c3 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55521 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-test-fixture npm run dev -- --hostname 0.0.0.0 --port 3020
```

Run the real action regressions first, then the read-only captures:

```sh
PLAYWRIGHT_PATH=/absolute/path/to/playwright node docs/design/hero-board/evidence/hiring-applicants-2026-11-08/interactions.mjs
PLAYWRIGHT_PATH=/absolute/path/to/playwright node docs/design/hero-board/evidence/hiring-applicants-2026-11-08/capture.mjs
PLAYWRIGHT_PATH=/absolute/path/to/playwright node docs/design/hero-board/evidence/hiring-applicants-2026-11-08/targets.mjs
PLAYWRIGHT_PATH=/absolute/path/to/playwright node docs/design/hero-board/evidence/hiring-applicants-2026-11-08/tablet.mjs
```

The fixture defaults to `/tmp/turfcut-applicants-cases.json`; set CASES_PATH consistently to override it. Chromium defaults to `/usr/bin/chromium`. To repeat the mutation test, prepare fresh workers first; the first worker's review event is retained. Stop local fixture processes afterwards. Never deploy or configure production services with this synthetic auth fixture.
