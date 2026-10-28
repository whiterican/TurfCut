# Corrective plan for Claude — 28 October 2026

## Directive

Reconcile the handoff first, then finish the existing Next.js implementation against the **attached twelve-screen concept**. The result should look like this specific product: photographic entry, compact white work surfaces, Inter, a restrained eggplant dock and rail, and forest actions. Do not reinterpret it as a serif editorial site, beige card dashboard, or another navigation system.

This audit authorizes a documented correction plan and review handoff. It does not approve a merge, deploy, schema change, or expansion milestone. Follow the existing milestone and independent-review requirements in `CLAUDE.md`; retain the founder's decisions already authorized in the session. Do not use the stale architecture document as an excuse to reopen settled visual choices.

## 1. What was found

| Source | Actual status | How to use it now |
|---|---|---|
| `master` at `fec571252dbec0c5e69629e1ae71870c6e36f983` | Default branch, separate from the implementation being audited | Baseline; do not assume redesign commits are deployed |
| `redesign/hero-board` at `c0f8115bfa9fd0d4ce1e4a0297c491b944f668d5` | Claude's implementation: 129 changed files, 4,421 insertions and 747 deletions versus master | Continue from these working components and domain logic; do not restart the application |
| `docs/product/REDESIGN_ARCHITECTURE.md` on that branch | Says four tabs, Fraunces, older colors and “inspiration only”; its description also disagrees with the five-tab code | Historical engineering context. Its conflicting visual sections are superseded |
| `docs/turfcut-hero-board-handoff-2026-10-28` at `aa13a05458d5abb6adab0f1aa146aaa1f534103b` | Original GPT handoff documents and later corrections. Old 64 renders explicitly rejected. Six worker tabs and font experiments still appear. Named images/HTML/ZIP were not committed there | Preserve provenance and useful data constraints, not its visual choices or claims about accessible image files |
| Issue [#78](https://github.com/whiterican/TurfCut/issues/78) | Redesign discussion and successive handoff comments | History and review thread, not permission to pick whichever older design is easiest |
| Issue [#111](https://github.com/whiterican/TurfCut/issues/111) | New twelve-screen contract: exact palette, Inter, seven-destination target, visual QA | Current visual contract, with the explicit contrast/width/data clarifications in this package |
| `reference/founder-12-screen-concept-2026-10-28.jpg` | Actual latest founder attachment, now committed in this package | Open this image before editing. It is the source image, not a regenerated interpretation |

**Chronology matters:** the audited implementation's last commit was at **11:32:01 UTC**; #111 was created at **11:54:34 UTC** on October 28. The branch predates that contract. The evidence shows version drift and contradictory instructions; it does not show Claude knowingly ignoring a later contract. Recheck HEAD before starting and audit any commits after the SHA above.

### Useful work already present

- Seven page templates in `src/components/layout/Page.tsx`, responsive organization/staff rails, route skeletons, shared status vocabulary, skip links and focus handling.
- Today state selection distinguishes a real live shift, a missing check-out, the next shift, and none; a live shift does not erase a separate overdue warning. Keep `src/lib/home-hero.ts` and its tests.
- Job details preserve application, invitation, offer, hire and shift actions, with a mobile action panel before the full legal/job card. Preserve eligibility and jurisdiction gates.
- Applicant inspector has server-side viewer scoping and a deliberate data projection. Keep `src/lib/applicant-view-data.ts` and its privacy checks.
- Role/grant-aware organization navigation and worker/organization route guards already exist. Do not replace them with screenshot-only links.
- Existing messaging, TurfMap/Leaflet, offline work events, packet custody, payout setup and status handling are product infrastructure to reuse.
- Job draft autosave and category-label changes also landed on the branch. These are not necessary to correct the visual mismatch. Record their provenance and keep them out of cosmetic rewrites; the architecture's “autosave out of scope” statement is stale, not proof those commits lacked approval.

## 2. Concrete findings, ordered by impact

All source paths below refer to the audited SHA. These are source-confirmed findings unless stated otherwise; this audit is not authenticated visual acceptance.

| Priority | Finding and evidence | Required correction | Completion evidence |
|---|---|---|---|
| P0 | Competing handoffs describe four, five, six, and seven tabs; original source pixels were missing from the handoff branch | This README becomes the entry point. Add supersession pointers to legacy visual documents; keep their history. Use the committed attachment | Claude names the image and SHA, current target and exceptions in his first reply |
| P1 | `src/app/globals.css:46–119` uses `#164b38`, `#2b1b3d`, `#efeae1`, `#fbf7f0`, and lime `#c6ec8c` | Map the exact printed tokens centrally. Remove decorative lime and old beige from the standard light theme. Preserve Sunlight's deliberate accessibility treatment | Computed token report and same-page light screenshots, not a palette-only swatch |
| P1 | `src/app/layout.tsx:2,23–47` loads Barlow, Barlow Condensed, DM Mono and Fraunces; `globals.css` assigns display serif to operational headings | Use Inter for the specified UI roles, including headings, dock labels and tables. Use tabular numerals where needed. No replacement font experiment | Loaded font evidence, actual text wrapping, no stale font-variable references; obsolete preloads removed |
| P1 | `.tab[aria-current]` around `globals.css:1424` draws a lavender filled tile; `src/lib/nav.ts:74–80` has Today/Jobs/Messages/Earnings/Profile | Match the single eggplant slab, light outline inactive icons and green active treatment without the tile. Apply the route mapping and explicit narrow-screen/feature exceptions below | 390px dock on every worker screen, selected route tests, 320px and enlarged-text proof |
| P1 | `src/lib/design-tokens.test.ts` explicitly asserts old green, serif titles and lavender current tile; `src/lib/nav.test.ts` asserts five tabs | Rewrite design-specific assertions to the current contract **in the same slice**. Preserve accessibility, state, authorization and route coverage | Tests fail for a deliberate old-color/serif/tile regression; passing tests are not treated as image approval |
| P1 | `/` uses the giant headline “The work behind every campaign.” with two actions and a steps panel (`src/app/page.tsx:21–43`); no photographic hero | Use the actual concept's photo-led composition, exact headline/supporting copy, and a dominant Find Jobs action. Keep authentication behavior truthful | Public home at 390 and 1440, image loading/failure state, no fabricated nearby jobs |
| P1 | `src/components/JobFeedCard.tsx` is a text-first vertical card; its `FeedJob` has no image. `loadFeed` does not provide campaign media. `/jobs` uses a two-column card grid at desktop and a Find work/My Schedule switch | Compact thumbnail rows, title then pay then facts, restrained category chips and save action. Search must be connected to real filtering, not decorative. Retain meaningful existing filters | Four-row fixture at 390, long title/unknown pay/no media/saved state; preserved save/hide and filter behavior |
| P1 | `Frame` defaults to `gap = 10` (40px); general template top spacing is generous. Uniform spacing alone cannot reproduce dense lists and field tools | Introduce explicit compact densities using shared tokens. Tune the handful of primitives; keep wide desktop workspace geometry | Measured gutter/row/control/nav dimensions compared with approved per-screen references |
| P1 | `/desk` is currently live hero/needs queue/week table, and `/field` is a grouped text board. Neither is the depicted map-centered desktop workspace | Recompose authorized data into the reference hierarchy. Preserve needs/actions and grant filtering. Map aggregation and any new metrics need an explicit data mapping | 1440px owner plus restricted-role views; map/list selection, no invented totals or tracking |
| P1 | No per-address Stop/Lead/Visit models or routes in audited schema. Existing door counts and turf pins are not these features | Keep the full visual target in specs, mark persistence blocked and scope it separately under the existing expansion discussion (#110). Never show a successful Save Outcome or fabricated lead in production | Feature gap record and honest present-state screenshots; separate reviewed model/API proposal if approved |
| P2 | Profile remains a long ReadingPage with Scorecard, Experience and subnav; Messages still uses the old page wrapper and large descriptive header | Restore concise identity/menu and conversation-list hierarchy while retaining all existing record/sharing functions | Profile/menu, credential/privacy states; messages empty/unread/read-only/error fixtures |
| P2 | Architecture refers to a git-excluded local `zz-preview` harness and historical performance checks | Provide reproducible, reviewable screenshot evidence tied to the actual commit. Local fixture renders must be labeled separately from authenticated workflow evidence | Manifest with source SHA, fixture, font, mode and output dimensions; no untracked harness needed to understand the evidence |

## 3. Source of truth and decisions that must not drift again

Order: latest founder request and attached concept → #111 plus this documented reconciliation → real domain/authorization/accessibility requirements → older handoffs only where compatible. The reference is not permission to fabricate facts, bypass guards or hide essential field states.

Settled now: Inter; exact ten printed base colors; photo-led entry and detail; compact work rows; eggplant dock; no lavender selected tile; full seven-destination **target order**; desktop rail and wide map/workspace; no ratings, invented counts or worker tracking.

There are four bounded items to resolve with visual evidence, not another general design exploration:

1. **Dock label contrast.** Forest on eggplant is 3.374:1, below normal-text AA. Preserve Forest as the action/base token; propose a lighter green dock foreground extension. Do not darken every surface or quietly return to lavender tiles. See the exact alternative in the token sheet.
2. **Seven destinations at narrow width.** At 320px, seven 44px targets plus 24px side inset and 8px padding require 340px. Do not shrink tap targets to hide this. Present the proposed overflow treatment and retain the 390px target.
3. **Unavailable features.** Lead and stop screens cannot be shipped as working persistence in a cosmetic slice. Make the exception visible in the route matrix. Keep existing authenticated routes reachable.
4. **Unspecified assets/dark geometry.** Only the composite is supplied. Printed values are exact; proposed geometry and dark extensions need pilot screenshots. Use authorized source photography, not an upscale of the phone mockup as a product background.

These do not block the audit or the preparation of a concrete pilot. They block claims that the final product matches all twelve screens with no exceptions. Do not ask the founder to choose the whole design again.

## 4. Implementation sequence

### Slice 0 — reconcile before editing runtime code

- Open the committed JPEG; read this package and #111. Confirm the current implementation SHA and any later changes.
- Return the twelve-route matrix from `specs/README.md`, marking implemented foundation, visual gap, and backend gap separately.
- List the four bounded decisions above and the actual photo asset/license paths. Do not request the same composite again; it is now in GitHub.
- Keep this branch as a docs-only review package. Continue production work on the established redesign branch or a small child branch after the applicable milestone checkpoint. Do not reset/rebuild 129 files from scratch.

### Slice 1 — one measurable pilot

Pilot: **390px Jobs + dock**, **390px Job Details**, and **1440px Organizer Overview**. These expose row density, type, CTA hierarchy, phone navigation and desktop composition. Include light first, dark second. Public Home is the image-led check in the next slice; secure its real asset in parallel.

- Fix central tokens/fonts and replace the selected-tab tile. Update contradictory tests together. Keep old semantic names as aliases if necessary; do not scatter hex literals through routes.
- Make compact row/section/control primitives, reusing the existing template system. Do not rewrite domain queries beyond reviewed projection/filter needs.
- For approved campaign imagery, `Job.campaignProfileId → CampaignProfile.headerKey` already exists (`prisma/schema.prisma`). Resolve through the existing media helper; respect published/organization visibility. Do not expose an unpublished campaign's assets through a job feed. Where no eligible image exists, show a neutral non-photographic fallback with the same footprint.
- Write one plain HTML/CSS reference per pilot screen, using the token sheet, if per-screen design exports are unavailable. This is comparison scaffolding, not a second app or proof of backend behavior.
- Render those references and the real Next routes at matching viewports. Get the actual composition reviewed before propagating it everywhere. Do not make the newly rendered application its own reference image.

Exit: reviewer can point to the reference, the implementation and an explicit small gap list. No vague “looks polished” or “all tests pass” as the visual decision.

### Slice 2 — existing worker screens and real states

Home/discovery → Today → Schedule → Active Shift → Messages/thread → Profile/More. Use the twelve specifications. Retain the full application/offer/eligibility workflows and record/history access; a compact redesign is not permission to delete them.

Required Today states: live, next, overdue, empty, plus live+separate-overdue warning. Required detail states: apply, applied, offered/invited where present, hired, unavailable/closed, and eligibility blockers. Required field states: queued offline, acknowledged, failed/retry, missing check-out, packet custody as applicable. Never put these critical states behind decorative tabs.

Exit: individual light/dark screenshots and actual workflow checks; no footer action covered by dock or keyboard; forbidden-item replacement list reconciled.

### Slice 3 — organization workspaces and remaining routes

Desk and Field map/workspace, then Hiring/applicant inspector, jobs management, pay, compliance, campaign pages, notifications and settings, preserving their existing route/grant models. The twelve pictures are not the whole product route inventory. Apply approved primitives to remaining routes; do not claim a screenshot exists for every route just because a template exists.

- Desk layout: rail, concise Overview header, source-backed summary strip if permitted, large field/map region, practical needs queue. Keep restricted-role empty/partial views intentional.
- Map: reuse Leaflet, assigned polygons/staging/manual pins, keyboard/list alternative and correct attribution. Selected polygon and selected list item must represent the same scoped record. Do not use person avatars or moving dots to imply GPS tracking.
- Hiring: existing job-scoped applicants/invites/matches. No global Workers CRM or Rating column added to fill the board's sidebar.
- Validate custom-grant roles as well as OWNER/SUPERVISOR/RECRUITER/FINANCE/COMPLIANCE/PUBLISHER. An attractive link to a route that returns forbidden is a failed navigation design.

### Separate feature slice — only with approved model/API plan

Stop Outcome and Leads need job/shift/stop ownership, assignment, outcome taxonomy, permitted contact data, follow-up semantics, append-only history, offline idempotency and server acknowledgement. `DOOR_KNOCK` aggregate counts and arbitrary map pins cannot stand in for this model. Use #110's existing expansion scope rather than inventing a parallel CRM or messenger. No production fake-data route. Finish the authorized visual slices without pretending this feature gap is solved.

## 5. Verification and review contract

See [VISUAL_ACCEPTANCE.md](VISUAL_ACCEPTANCE.md) for filenames, dimensions, fixture states and evidence. At the audited SHA, after clean dependency installation and Prisma generation:

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | 110 test files; 948 tests passed |
| Public signed-out `/`, light | Captured at 390×844 and 1440×900 CSS px, DPR 2; HTTP 200; no horizontal overflow. See `audit-evidence/` |
| Authenticated end-to-end/RBAC workflows | Not run in this audit; no test account/database session supplied |
| Full production build/deployment | Not performed |
| Full visual comparison of all authenticated screens | Not performed; source findings must not be presented as that comparison |

Do not weaken authorization, status or offline tests to get the new appearance green. Rewrite assertions that freeze superseded visuals; preserve meaningful contrast and behavior checks. Existing AAA-only tests may be deliberately adjusted where the current reference specifies AA colors, with the exact pair and ratio documented. Sunlight keeps its stronger existing requirements.

The next implementation review must include an independent Claude reviewer as required by the repo. This audit is not that separate Claude review. Record findings, resolutions, and recheck results; do not state a review occurred when it did not.

## 6. What Claude should send back

1. Current HEAD and confirmation that the attached image/#111 supersede old visual choices.
2. Updated twelve-screen matrix and the smallest next slice under the already approved milestone.
3. A specific response to dock contrast, narrow width, missing feature/backend data and media availability.
4. Pilot reference/actual pairs and exact remaining differences, followed by per-screen/state evidence as work proceeds.
5. Test results, workflow evidence, independent reviewer outcome and a draft PR. No merge/deploy without founder approval.

**Definition of done:** a reviewer can open the actual reference, each corresponding screen/state, its data contract and its screenshot evidence, and explain every remaining difference. A new palette over the current cards, another font experiment, or tests passing against the old design does not meet this request.
