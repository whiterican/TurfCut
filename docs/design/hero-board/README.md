# TurfCut / Hero Board — corrected dock, typography and screen-state handoff
**Design branch only. No production implementation.** Founder correction dated October 28, 2026.
**Baseline:** `fec571252dbec0c5e69629e1ae71870c6e36f983`, PR #99 compact dock. **Product context:** #78 flagship visual redesign, #110 minimal operations core-loop, #101 future roofing/solar milestone.
**Companion screenshot package:** `TurfCut_Claude_Hero_Board_Exact_Nav_2x.zip` created in the originating ChatGPT conversation. It contains **16 static HTML screens**, **16 per-screen specs**, a shared `tokens.css`, **64 PNG 2x screenshots** (390×844 and 1440×900; light/dark), a CSV manifest, QA JSON, and contact sheets. The ZIP's PNG assets are **NOT yet committed to this GitHub branch**. Get the ZIP from the founder, then add/cite those assets here. Don't claim GitHub contains uncommitted PNGs.

## Mandatory corrections to earlier image-generation concept boards
1. **Worker dock is SIX links in this order:** Today, Feed, Work, Shifts, Messages, Profile. The original four-item images were WRONG. No worker Map, Leads or More tabs. `src/lib/nav.ts:WORKER_TABS` is source of truth.
2. **Organization phone dock is role-aware.** Owner has Desk, Hiring, Field, Messages, More (where More contains authorized Jobs, Pay, Credentials, Campaigns, Members, Settings). Other roles follow `PHONE_PICKS`; `orgNav` permission-filters tabs, so do NOT put a hardcoded owner dock on supervisor/finance mocks. Organization desktop keeps the complete authorized left rail.
3. **Compact floating dock stays.** New reference max-width **348 CSS px** (vs current PR #99 max-width 370), 48px label/icon hit tile, 4–5px padding, 16–18px icons, 10px bottom + safe-area, and a filled eggplant current tile with cream text. Test 320px and 390px for all SIX worker tabs; DO NOT shrink hit targets below 44px. This is a proposed reference dimension, not an approved CSS change.
4. **Typography:** Barlow / Barlow Condensed / DM Mono is CURRENT. Recommend A/B testing operational `Public Sans` and sparse public-hero `Newsreader` while retaining DM Mono for audited numbers where useful. Avoid sprinkling serif into work forms/tables; avoid excessive condensed shouting. Images use locally available `Cabin`/`EB Garamond` **offline rendering surrogates**, not actual Public Sans specimens. Compare actual installed web fonts before changing production.
5. **Do not reuse fake values** from older boards: 4.9 worker rating; worker 28 completed / 120 hours; Rating column; 124 shifts, 86 active, 12,340 doors, $4,280 spent; worker GPS map pins; unsupported “+ bonuses”. Remove them; don't invent substitutions.

## Accurate screen-state matrix / companion file naming
| Path or role | Screenshot prefix | Sample states | Real binding |
|---|---|---|---|
| `/dashboard` worker | `today-live`, `today-next`, `today-overdue`, `today-empty` | checked-in live; next scheduled; overdue/needs checking (review backend rule!); nothing scheduled | `src/app/dashboard/page.tsx`, `Shift` |
| `/jobs` worker | `work-feed` | real feed, saved/hidden privacy | `src/app/jobs/page.tsx`, `loadFeed` |
| `/jobs/[jobId]` worker | `job-apply`, `job-applied`, `job-hired` | no engagement; APPLIED; CLAIMED/ACTIVE | `src/app/jobs/[jobId]/page.tsx`, `Engagement` |
| `/shifts` worker | `shifts` | upcoming, past, availability | `src/app/shifts/page.tsx` |
| `/shifts/[shiftId]` worker | `shift-live` | active, honest offline, proposed stop panel labelled as planned | `FieldDayLive`, `WorkEvent` |
| `/messages` worker | `messages` | existing job-linked direct and group threads | `ConversationJob`, `chat-data` |
| `/profile` worker | `profile` | sharing, scorecard, credentials, earnings | `src/app/profile/page.tsx` |
| `/desk` org | `org-desk` | genuine queues and shift truth | `src/app/desk/page.tsx` |
| `/field` org | `org-field` | territory polygons, no GPS tracking | `src/app/field/page.tsx` |
| `/hiring` org | `org-hiring` | staffing and legitimate counts | `src/app/hiring/page.tsx` |
| `OrgTabBar` org | `org-more` | permission-filtered More sheet | `src/components/AppNav.tsx`, `src/lib/nav.ts` |

Every screenshot is a **reference layout with SYNTHETIC FIXTURES**, not an extraction of real customer data. Do not cite visual fixtures as live metrics. Every HTML reference is framework-free, intended for Claude to Playwright-render beside the actual Next 16/Tailwind v4 screen, NOT to transplant as an alternative app.

## Priority & delivery contract
- **Flagship F00–F11 redesign remains implementation priority.** Keep existing core hiring, scoring, compliance gating, scheduling, offline shift data, verification, pay, messaging, consent, and accessibility intact.
- A first-party roofing/solar future roadmap exists, but lean operations V1 #110 is only job-attached numbered CSV stops, shift outcomes→simple follow-ups, and contextual existing job messaging. None of those are production capabilities merely because mockups depict them.
- Finish screen-by-screen C1/C2/C3 review, compare actual spacing at matched viewport and device scale, obtain founder's final visual/scope approval before changing production.
- Branch is **documentation only**; no migration, production CSS, app code, integration, merge or deployment approved here.
