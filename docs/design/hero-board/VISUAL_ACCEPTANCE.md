# Visual acceptance and evidence

## The comparison must have an independent target

The founder's committed composite is the source concept. It is not a pixel-perfect screenshot of a 390px/1440px application and cannot support a precise numerical similarity claim. Rejected older 64 renders are not valid baselines. A screenshot of the newly changed app is not automatically its own approved reference.

For the first pilot, make individual readable references from the locked composition/tokens, using plain HTML/CSS if source design exports do not exist. One plain file per screen, using shared named tokens; no Vite/Lovable/shadcn replacement application. Show each reference next to the relevant original concept region, then the actual Next route at the same viewport. Freeze approved references separately from implementation screenshots. Future-feature references must be labeled as future fixtures outside the product viewport.

## Capture contract

- CSS viewports: **390×844** and **1440×900**, device scale factor **2**; physical viewport screenshots **780×1688** and **2880×1800**. Full-page variants are additional and marked as such. Aspect ratio is a measurement convention, not a reason to delay or crop important content.
- Required themes: light and proposed dark for every screen/state. Sunlight retains its existing strong contrast behavior and gets dedicated field/control checks.
- Filename: `<route-slug>-<state>-<css-width>-<theme>.png`, e.g. `today-live-390-light.png`, `job-detail-applied-1440-dark.png`. Put future references and actual app captures in different directories.
- Capture route, role/grants, fixture ID, frozen clock/timezone, source commit, mode, viewport/DPR, image hashes, fonts loaded and overflow measurements in a manifest. Record exact view parameters for reproducibility. Use non-production fixture records/accounts and no personal data.
- Wait for fonts and legitimate images, hydration and intended deterministic map state. Record image/tile failures explicitly. Do not replace Inter with a screenshot-friendly fallback and claim fidelity.
- Screenshots must include the header/dock and first useful content. Add lower-page captures for details/actions, modal sheets, keyboard states and long records; one top screenshot is not evidence of reachable content below the fold.

## Minimum state inventory

| Screen | Required states |
|---|---|
| Home | Signed out, available/no featured job, image failure; signed-in entry behavior |
| Jobs | Populated, saved, no results, no inventory, loading/error, missing media, long title/unknown rate |
| Job details | Apply, applied, offered/invited, hired with/no shift, closed/paused, eligibility blocker, failed action |
| Schedule | Upcoming, past, none, canceled/overdue, cross-midnight/date boundary |
| Today / active shift | Live, next, overdue, none, live plus separate overdue, offline queue/ack/error, custody/check-out blocker |
| Stop Outcome | Docs-only future until approved; later unselected/saving/offline/ack/failure/correction and access tests |
| Leads | Docs-only future until approved; later empty/filter/search/follow-up/permission/error |
| Messages | Empty, unread/read, frozen, startable, error; thread composer keyboard/send/retry |
| Profile | Missing/pending/verified/expired credential, availability unset, payout setup, sharing-version warning |
| Overview | Populated/empty, overdue, partial grants, unknown/unavailable totals, consistent date scope |
| Field Map | One/multiple/empty turf, selection/filter, tile failure, invalid geometry, forbidden other-org record |
| More | Open/closed, child selected, keyboard focus/return, enlarged text, relevant roles, sign-out safeguards |

Each scenario needs both widths/modes unless a clearly documented combination is inapplicable. Do not imply that twelve happy-path images prove this matrix. Mark `planned`, `captured`, `reviewed`, `blocked-feature`, or `not-applicable` separately.

## Pass/fail checklist

1. **Visual identity:** computed values match the exact base tokens; Inter is really loaded; original logo geometry retained; no beige/lime decoration, oversized editorial headings, white dock or lavender active tile. Approved exceptions are named.
2. **Geometry:** record actual header/row/card/control/dock/rail rectangles. After pilot target approval, use a proposed ±2 CSS px tolerance for ordinary component measurements, not for variable content height. Inspect wrapping/crop/visual density manually; antialiasing and real map tiles make a single global pixel threshold misleading.
3. **Navigation:** exactly one owning section; `/shifts/turf` selects Map, shift IDs select Work, job details select Jobs; More children and role-filtered org menus work. No broken/dead/inaccessible links or duplicate navigation shells.
4. **Responsive/accessibility:** also check 320, 768, 1024 and 1280px; 200% text; dynamic viewport/safe area; orientation; keyboard-only; focus rings; reduced motion. Record dock target sizes, complete labels, overflow and last-action visibility. Normal text meets AA; Sunlight retains its stronger requirements. No tiny-font workaround for seven destinations.
5. **Function/data:** real server states and actions, permission checks, payment distinctions, append-only history, truthful sync, no fictional people/metrics. Loading/error/empty states must be visually designed too.
6. **Regression:** run typecheck, lint and unit tests; relevant real workflows/RBAC and offline checks must be reported separately. Preserve state/permission tests. Revise obsolete design assertions without deleting meaningful checks.
7. **Review:** include reference/actual pairs, a per-screen remaining-gap list, independent Claude review findings and resolutions. A reviewer approves the appearance; a test run cannot do so.

Suggested manifest fields:

```json
{
  "screen": "jobs",
  "route": "/jobs",
  "state": "populated",
  "role": "WORKER",
  "grantsFixture": null,
  "fixtureId": "<recorded non-production fixture>",
  "sourceCommit": "<actual SHA>",
  "referenceFile": "<actual reviewed reference path>",
  "implementationFile": "<actual captured path>",
  "viewport": {"width": 390, "height": 844, "deviceScaleFactor": 2},
  "theme": "light",
  "timezone": "America/Denver",
  "clock": "<frozen ISO time>",
  "fontCheck": "<actual result>",
  "assetHashes": {},
  "overflowPx": 0,
  "minimumTargetPx": "<measured>",
  "status": "planned",
  "exceptions": []
}
```

This example is a schema illustration, not recorded QA. Replace placeholders with real evidence; do not paste it as a passed result.

## What this audit actually verified

See [audit-evidence/README.md](audit-evidence/README.md). Source audit, 948 passing unit tests, clean typecheck/lint, and two real **public signed-out light-mode** development captures are available. Authenticated route rendering, full dark/Sunlight coverage, production build, database acceptance tests and real-device behavior were not certified. No reference exports or 64-screen replacements were generated during this audit.
