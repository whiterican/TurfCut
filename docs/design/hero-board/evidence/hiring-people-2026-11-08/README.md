# Candidate and worker records: running-app evidence

Board claim: [#128](https://github.com/whiterican/TurfCut/issues/128#issuecomment-6723749797). Implements PLAN.md sections 3–4 in #126. The manifests name the captured implementation commit.

The candidate head keeps the existing stage and actions beside the name, followed by available job comparisons, history, the current shared profile, invitation composer and retained snapshot. An empty comparison or history section is omitted. The snapshot uses a native disclosure with its captured date visible when the stored snapshot has a valid date. No snapshot content is changed.

The shared profile has five compact rows. A wholly withheld part has one neutral chip. Authorized content expands with native details/summary controls to the existing component. Partial political fit retains every field and its existing shared-basis sentence. Shared-but-empty credentials, experience and availability retain their distinct empty words. Scorecard summaries use only authorized headline values, never hidden counts or an overall score. The worker's organization-view preview uses the same component.

## What the evidence covers

`manifest.json`: 12 actual candidate/worker routes, at 390×844 and 1440×900, light/dark. Base states include all-withheld, partial sharing, hired, offered, expired offer, invited, expired invitation, not selected and closed account. Additional captures open the shared scorecard, partial-fit rows and retained snapshot. Each state has a viewport and full-height image. The viewport keeps the real floating dock/header; full-height exports place the dock at the page's end and header at the top to avoid screenshot-only occlusion. Screenshot caret hiding is disabled to avoid mutating input styles during hydration.

`interactions-manifest.json`: pointer targets hit-tested with elementFromPoint in quarter-pixel increments at 320, 390 and 1440, both themes; closed-account profile content is absent, and a different organization's owner receives the existing explicit refusal. The closed-account not-found can be streamed with HTTP200, so the check does not claim a 404 transport guarantee. This behavior was preserved, not changed by this slice.

The main manifest records the actual route, visible navigation selection, document height, overflow, Inter readiness, open disclosures and browser errors. The interaction manifest records measured targets and refusal results. Disclosures were opened with the keyboard and pointer.

## Fixture boundaries

All records are local PostgreSQL data created by the repository's c3 acceptance suite, with a few explicit synthetic sharing choices. They are fictional test people, not production users. `prepare-fixtures.ts` uses the app's saveSharing/savePreferences functions: Sam shares no profile parts; Riley shares the independent identity label and no-party-affiliation relationship, with the other fit fields withheld. These are synthetic consent choices, not inferred political facts. Preferences and audit history remain append-only. Other capture states come from the existing acceptance fixtures; the recipe inventories their generated IDs.

The real guarded Next routes, loaders, database role/grant queries, shell, components and server-action markup run unchanged. `auth-fixture.mjs` is an explicitly **untrusted local auth fixture**, not an authentication implementation: on loopback it returns a selected synthetic user to getUser and acknowledges no-op realtime subscriptions. This lets the app exercise session/profile/grant code against the local database. It does not verify production Supabase authentication, message delivery or realtime behavior. The fixture uses the websocket implementation already bundled with the locked Next package; no dependency is added. No production database, credentials or services were used.

Not demonstrated by these captures: a successful hiring mutation, a failed mutation after the page loads, or the plan's synthetic name-not-shared/partially-shared composite. Existing HiringActions, ActionButton and server actions are reused. An approved organization always receives the display name in today's authorized profile view, so the mockup's name-not-shared composite is not presented as a reachable worker-route state. Review remains required; these limits are not marked as passed states.

## Reproduce locally

Use the repository's locked dependencies, generated Prisma client, a separate PostgreSQL17 server at localhost:55438, and an external Playwright/Chromium installation. Stop the app before rebuilding its fixture database. The fixture preparation deliberately refuses a non-local DATABASE_URL.

```sh
PGURL=postgresql://turfcut:local-only@localhost:55438 bash tests/acceptance/run.sh c3
DATABASE_URL=postgresql://turfcut:local-only@localhost:55438/turfcut_acc_c3 npx tsx docs/design/hero-board/evidence/hiring-people-2026-11-08/prepare-fixtures.ts
node docs/design/hero-board/evidence/hiring-people-2026-11-08/auth-fixture.mjs
```

In another terminal:

```sh
DATABASE_URL=postgresql://turfcut:local-only@localhost:55438/turfcut_acc_c3 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55521 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-test-fixture npm run dev -- --hostname 0.0.0.0 --port 3020
```

With an external Playwright package:

```sh
PLAYWRIGHT_PATH=/absolute/path/to/playwright node docs/design/hero-board/evidence/hiring-people-2026-11-08/capture.mjs
PLAYWRIGHT_PATH=/absolute/path/to/playwright node docs/design/hero-board/evidence/hiring-people-2026-11-08/interactions.mjs
```

The scripts default to `/usr/bin/chromium` and `/tmp/turfcut-people-cases.json`. Set CASES_PATH consistently when preparing and capturing to use a different cases file. Keep the server bound to the local test environment and stop the fixture processes afterwards. Never configure this auth fixture or its keys in production.

## Verification

At implementation `596f085`, typecheck and lint passed, and the full unit suite passed **1,030 tests in 121 files**, including nine new profile/privacy/record tests. One earlier full run during concurrent browser captures hit the unchanged five-second limits in job-marks isolation and the large-image cap test; the complete rerun without captures passed (those tests took about 1.4s and 0.6s). No timeouts were raised or tests skipped.
