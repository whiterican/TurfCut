> **CURRENT HANDOFF — SUPERSEDES THIS FILE'S VISUAL DIRECTIONS (28 October 2026)**
>
> The founder's latest twelve-screen concept and issue [#111](https://github.com/whiterican/TurfCut/issues/111) supersede conflicting older tab counts, fonts, colors and “concept only” visual directions below. Read [the current reference and corrective plan](https://github.com/whiterican/TurfCut/blob/docs/hero-board-audit-2026-10-28/docs/design/hero-board/README.md) in [draft PR #112](https://github.com/whiterican/TurfCut/pull/112). **The actual founder reference image is now committed in that package**; this file's old image-transfer limitations are historical. Preserve compatible data honesty, authorization and workflow requirements. The older rejected 64 renders remain rejected. This file is retained as history, not a competing design target.

---

# TURFCUT — UPDATED MOCKUPS: TWO NEW BOARDS FOR CLAUDE
**Date:** 2026-10-28 · **Delivery:** repo-resident design handoff on docs-only branch, tied to issue #78. **Status:** CONCEPT REVIEW, **NOT** production-code authorization, visual sign-off, or proof of features.

## What the founder just asked
After rejecting the earlier 64 renders as unlike the supplied reference, the founder asked to *see updated mockups* and now explicitly requests **"Then send them all to Claude."** Two updated **image-generated composite boards** were displayed in the ChatGPT conversation; both are intended as supplementary visual concepts to discuss with Claude, **not** pixel-accurate functional screenshots or an authorization to implement every depicted feature.

**Image source filenames as generated in founder ChatGPT session:**
- **Board A — 12-screen UX case study**: `turfcut_ux_case_study_board.png` — PNG 1448×1086. It shows the title/design system + 7 mobile mockups across the upper row and 5 concepts across the lower row (Messages, Profile, Organizer Dashboard, Field Map, More).
- **Board B — 9-screen fieldwork showcase**: `turfcut_fieldwork_app_showcase.png` — PNG 1448×1086. It shows six mobile mockups (Home, Jobs, Job Details, Schedule, Active Shift, Profile) and three desktop concepts (Organizer Overview, Workers/Hiring, Field Map).
- **Founder-provided authoritative reference**: `4A313411-293A-4707-B1EE-05A3B943001C.jpeg`, plus its individual concept crops (`01-landing-CONCEPT.png`, `02-work-CONCEPT.png`, etc.) in ChatGPT session. This governs reference fidelity **ahead of** assistant-generated boards.
- **First measured corrections**: `TurfCut_Reference_Correction/work-reference-v2.html` / `work-reference-v2-390-light.png` and `hiring-reference-v2.html` / `hiring-reference-v2-1440-light.png`, locally rendered proof-of-direction. Existing GitHub file [REFERENCE_FIDELITY_CORRECTION.md](./REFERENCE_FIDELITY_CORRECTION.md) documents those proofs.

### IMPORTANT IMAGE TRANSFER STATUS — READ BEFORE CLAIMING REVIEW
**This Markdown file is genuinely present on GitHub. The two PNG files listed above are NOT in this GitHub branch.** They were generated inside the founder's ChatGPT session and can be viewed there, but cannot be asserted accessible to Claude through this document alone. Do not claim to have seen the PNGs or conducted pixel comparison if they have not been supplied. The founder may attach the two image files directly to Claude, or a separately authorized image-capable upload workflow should commit the original PNGs to `docs/design/hero-board/`. No fabricated GitHub URLs. This text gives sufficient direction for a route-by-route planning review, not a substitute for the visual pixels.

## Design direction represented by BOTH boards
- **Overall:** premium, focused field-work software, dark eggplant/near-black frame, white/cream practical canvas, restrained forest-green actions, vivid but functional field photographs. A purposeful mix of premium editorial public-facing visuals and dense operational tools.
- **Public marketing / Home:** full-height neighborhood fieldworker photograph with dark gradient, white serif editorial *"Field work that matters."*, credible call to action and an example job preview. Distinguish public landing from **authenticated** `/dashboard` Today/next/live shift; do not replace the actual signed-in Today with a promotional poster.
- **Work discovery:** light, compact job listing with search/location, subtle category chips and photo-led rows; title and published gross pay prominent, date/location/org subtle; density sufficient for multiple rows above dock.
- **Job details:** photographic header, white job information sheet, permitted pay and exact schedule/requirements, one green primary apply action, distinct real `APPLIED`, `OFFERED`, `ACTIVE`/hired states. Avoid fake urgency, bonuses, verified checkmark unless supported.
- **Schedule:** concise tabs, real shifts and their statuses plus genuinely required next actions (not invented training or agreement tasks).
- **Active shift / stop outcome:** small, task-first work surface with accessible primary action and honest offline/sync status. **Stop #5 / 1234 Maple St, 12 stops left, 8 completed, 2h30m** are synthetic future features: no production evidence for per-address stops. Treat as **RS1 V1 planned**, not live, and do not silently substitute them for `DOOR_KNOCK` aggregate counts.
- **Leads / followups:** compact list, contact outcome and follow-up date — **future RS1 V1**, not a full CRM, no arbitrary demographics, no personal data invented from addresses. It is a contextual job workflow, **not** a new tab in the actual worker nav.
- **Messages:** job-linked conversation list and existing messages, not a new Slack clone; adhere to current `ConversationJob` / `Engagement` permissions.
- **Profile:** real worker credentials and actual scorecards/availability/privacy. **No 28 jobs, 120 hours, generic "stage", fake ratings**, illustrative identity or email as if live.
- **Org overview:** dark left navigation rail, white desktop work canvas, tight overview/actions, genuine worker/hiring/field facts only. The concept's KPI tiles and metrics (124, 86, 12,340, $4,280, +92%, etc.) are **fabricated illustration**, not backend results. Prioritize truthful `/desk` need-action queues.
- **Org Hiring/Workers:** useful searchable/sortable table for actual `/hiring` states, not fabricated star Rating or fictional performance ranking. Existing app lacks the full standalone Workers CRM shown in the concept.
- **Org field map:** zone polygons, real assigned turf and statuses, **not** live individual worker GPS dots, surveillance or claimed field tracking. Real source `/field` has no worker location tracking. Property stops are RS1 future.
- **More:** role/grant-scoped organization options, not a new worker-level catchall menu.

## WHICH BOARD TO USE FOR WHAT
**Board A** emphasizes **the full interaction vocabulary**: stop results, lead list, messages, More, compact white working pages and a dark dock. Use as a long-term composition reference **only** where the route is actually authorized. **Board B** emphasizes **the public photographic cover, worker schedule and desktop org density**. Use as an alternative visual treatment, **not** a second information architecture. Their contradictory nav and invented KPIs are explicitly disallowed.

## DOCK — CRITICAL FOUNDER REQUEST
**Keep and shrink the floating dock.** Render it as a compact dark eggplant/near-black rounded slab, inset from screen edges, approx. `max-width:348px` at a 390px viewport, total outer height roughly 58–62px, each **tap target ≥44px** and no clipped labels. Use active cream-text-on-eggplant tile and deliberate forest-green icon accent only where consistent with approved token roles. Preserve phone safe-area, screen reader and focus/keyboard behavior.

**Actual worker navigation from `src/lib/nav.ts`: exactly SIX**: 
1. Today (`/dashboard`)
2. Feed (`/feed`)
3. Work (`/jobs`)
4. Shifts (`/shifts`)
5. Messages (`/messages`)
6. Profile (`/profile`)

**DO NOT copy either image-generated board's fictional worker nav** (Home / Jobs / Work / Map / Leads / Messages / More, or Home / Jobs / Schedule / Messages / More). Neither is authoritative. Keep all six real tabs. Org owner mobile uses **Desk / Hiring / Field / Messages / More** and all remaining options through role-scoped More; desktop org navigation is a rail with all granted areas. No duplicate top nav + rail.

## TYPOGRAPHY DECISION STILL OPEN
Current production: **Barlow UI / Barlow Condensed tiny labels / DM Mono precise figures**. Founder asked to reduce "vibe-coded" feel. Test **Public Sans** for practical app UI and **Newsreader** very sparingly for public editorial headings; retain DM Mono for appropriately precise tables. Need side-by-side REAL 390/1440 renders before final font signoff. Avoid too many exaggerated card titles, badges, gradients, rounded widgets and inconsistent font roles. Do not let a font experiment replace actual layout work.

## DATA INTEGRITY / COMPLIANCE GUARANTEES
- No fake star ratings, 28/120 profile stats, fabricated 124/86/12,340/$4,280 admin tiles, bonus promises, "92% fill rate" without the real query basis, anonymous synthetic people inferred to be current account users.
- No worker GPS pins, live tracking, or identifying residents at addresses from a marker.
- No politically licensed data in commercial roofing/solar lead workflows; organization verification/source license and permitted purpose required for future dataset offerings.
- Pending roofing/solar field sales and walkbook leads are **future** and must not be presented as shipped. Current `JobType` PETITION/CANVASS.
- Worker-reported knock/outcome ≠ independent verification ≠ approved payment. Existing `WorkEvent.DOOR_KNOCK` is aggregate, not proof of visiting a specific house.
- Preserve existing discover→hire→schedule→work→verify→pay, consent, pay ledger/Stripe controls, roles/grants, offline server acknowledgment, team chat, and petition packet custody.
- Branch is **docs only**; no changes to production UI or deployment without independent C1/C2/C3 and founder approval. Flagship redesign F00–F11 remains ahead of RS1 commercial features.

## EXACT CLAUDE HANDOFF / NEXT STEPS
**1. Read:** [REFERENCE_FIDELITY_CORRECTION.md](./REFERENCE_FIDELITY_CORRECTION.md) first, followed by this document. Treat the original founder image as the authoritative visual reference, the two new boards as *alternative illustrative screens*, and the old 64 PNG handoff as **rejected for visual fidelity**.

**2. Get the actual pixels:** if you can access the founder's ChatGPT-shared two boards and original screenshot, inspect them; if not, request/directly receive the images from founder. Do not assume GitHub has binary files. **No pixel matching without actual source PNGs.**

**3. Produce three first polished evidence-driven pairs before broad build:** (a) photographic public landing + authenticated Today, (b) 390px worker Work + Job Detail apply/applied/hired, (c) 1440px manager Desk + Hiring/Field. Match original reference composition, spacing and dense information hierarchy—not merely color words. Show both themes, compact SIX-tab worker dock and correct org navigation.

**4. Audit each visual claim against source:** `src/app/dashboard/page.tsx`, `src/app/jobs/page.tsx`, `src/app/jobs/[jobId]/page.tsx`, `src/app/shifts/[shiftId]/page.tsx`, `src/app/desk/page.tsx`, `src/app/hiring/page.tsx`, `src/app/field/page.tsx`, `src/components/AppNav.tsx`, `src/lib/nav.ts`, `src/app/globals.css`.

**5. Report separately:** C1 visual fidelity, C2 product/permissions and data correctness, C3 responsive/real-device/keyboard/accessibility/offline QA. Founder decides first-pilot visuals before any broad rollout. No code merge or Supabase mutation from this request.

**6. Keep RS1 V1 (#110) minimal:** job-attached numbered walkbooks, confirmed-worker stop visits in existing shift, stop outcome→one job-scoped lead/follow-up, job-linked existing messages. This is future expansion, not to be mixed into the immediate redesign as if present.

## PRECISE BOUNDARIES
The latest two images are **composite storytelling boards**, not 390px individual assets at true 2×, and contain errors. Do **not** turn them into CSS pixel measurements. Exact per-screen reference-export + static HTML/CSS work remains to be produced and tested on actual application screenshots. This document contains the current founder-reviewed visual and product constraints but does NOT claim binary art delivery.
