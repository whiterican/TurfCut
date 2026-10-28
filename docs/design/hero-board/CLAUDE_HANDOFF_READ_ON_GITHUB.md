# TURFCUT — CLAUDE'S COMPLETE TEXT HANDOFF (NO DOWNLOAD REQUIRED)
**Date:** 2026-10-28 · **Branch:** `docs/turfcut-hero-board-handoff-2026-10-28` · **Source commit:** `fec571252dbec0c5e69629e1ae71870c6e36f983` · **Design documentation only**.

This file is written as a **browser-readable fallback** because the founder cannot open ChatGPT-generated ZIP and other sandbox download links on iPhone. It gives Claude enough to understand and independently implement/review the *design contract without opening an attachment*. **The rendered pixel-reference PNGs and static HTML are not committed here yet.** Do not pretend that reading this file provides pixel comparison; obtain the package separately if needed or render from this specification and compare to real authenticated app screenshots.

## 0. NON-NEGOTIABLE FOUNDER DECISIONS

1. **Keep the floating mobile dock, but shrink it.** Target `max-width:348px; width:calc(100vw - 32px)`, bottom offset ~10px above `env(safe-area-inset-bottom)`, total ~60px including frame, 48px interactive tiles, icons ~17px, complete readable labels. **DO NOT reduce any hit target below 44px**, even at 320px or with text zoom. Rounded slab, not a full-screen bottom bar and not a tall generic pill. Active tile is filled eggplant with cream icon/text.
2. **Exact worker dock has six destinations, not four or seven:** **Today** `/dashboard` · **Feed** `/feed` · **Work** `/jobs` · **Shifts** `/shifts` · **Messages** `/messages` · **Profile** `/profile`. Preserve labels, access, message unread count, scroll tuck, keyboard focus and reduced motion. No Leads, Map, More or Home substitutions.
3. **Org dock is permission/role-based, not identical to worker.** Owner phone: Desk, Hiring, Field, Messages, More; More exposes only other granted areas (Jobs, Pay, Credentials, Campaigns, Members, Settings). Recruiter, Supervisor, Finance, Publisher, Compliance and Custom have different picks; derive from `src/lib/nav.ts` / `src/components/AppNav.tsx` and actual grants. On desktop: **organization rail**, full available areas, no duplicated top header navigation.
4. **Desktop is a genuine redesign.** Worker should use more of the available width with a useful secondary/context region, not a 390px column centered in 1440px. Org desktop uses dense tables and contextual inspector where appropriate. Do not paste oversized phone cards across the desktop.
5. **Identity and surface roles:** warm paper/cream, deep eggplant for identity/navigation, **forest green exclusively for deliberate primary actions and genuinely live states**, soft green decorative corner, no retired neon lime. Light/dark and accessible outdoor Sunlight.
6. **Fonts: compare, do not silently change.** Production uses Barlow UI, Barlow Condensed labels and DM Mono numerals. Founder's question: whether changing fonts would reduce 'vibe-coded' aesthetics. Recommended trial: Public Sans UI, Newsreader *only* in public-facing editorial/hero, DM Mono retained for precise evidence and financial figures. A/B on real app at 390/1440 before founder decision. Offline reference screenshot fonts were **Cabin/EB Garamond substitutes**, so the screenshot cannot be cited as an exact Public Sans specimen.
7. **Data honesty over concept-board cosmetics.** No 4.9-star rating, synthetic 28 completed jobs/120 hours, Hiring Rating column, decorative 124/86/12,340/$4,280 KPI values, speculative '+ bonuses', false worker GPS location dots, invented real-time presence or claimed commercial job types that are not implemented. No substitute for a forbidden item unless an actual loader supports it. Prefer removal/true empty state.
8. **Existing product remains fully functional.** Preserve worker discovery/hiring, application/engagement statuses, scorecards with math, consent/sharing, jurisdiction publish gates, scheduling, offline shift queue truth, petition custody, supervisor verification, payment and existing messaging. No migration or production changes authorized by this document.

## 1. VERIFIED CURRENT FILES / INTERFACE SOURCES
Read repository at current head again before applying:
- `src/app/globals.css`: tokens and current `.tabbar` (370px max; new reference recommends 348px), `.tab` at least 44px.
- `src/app/layout.tsx`: Barlow, Barlow Condensed, DM Mono; shell header and role-specific org rail.
- `src/lib/nav.ts`: `WORKER_TABS`, `PHONE_PICKS`, `ORG_TABS`, `orgNav` and `navTabs`.
- `src/components/AppNav.tsx`: `TabBar`, `OrgTabBar`, `OrgRail`, scroll behavior, More dialog.
- `src/app/dashboard/page.tsx`: worker Today hero with live/next/empty and back-end shift priority.
- `src/app/jobs/page.tsx`: Work feed, filters, "Your jobs", invitations and saved/hidden.
- `src/app/jobs/[jobId]/page.tsx`: worker apply/applied/hired, real engagement state, job terms/pay.
- `src/app/shifts/[shiftId]/page.tsx` and `src/components/FieldDayLive.tsx`: shift facts, offline field actions, packet custody and corrections.
- `src/app/desk/page.tsx`, `src/app/field/page.tsx`, `src/app/hiring/page.tsx`: org operational screens.
- `src/app/profile/page.tsx`: real scorecard, availability, credentials, share controls.
- `src/lib/chat-data.ts`, `src/lib/chat.ts`: direct and GROUP chats scoped to engagement and jobs.
- `prisma/schema.prisma`: job types and entities; commercial/roofing/solar activity types not yet live.

## 2. SCREEN INVENTORY / ACTUAL ROUTES — DESIGN STATES, NOT CUSTOMER DATA
A static design package was rendered with **16 HTML screens × [390×844 mobile, 1440×900 desktop] × [light, dark] = 64 PNGs** at device scale 2 (files 780×1688 or 2880×1800). Naming `<screen>-390-light.png` etc. **The PNG bytes are not in this GitHub branch.** This browser-readable file is their authoritative companion spec.

| Design key | Actual route / surface | State | Required priority and replacement |
|---|---|---|---|
| today-live | `/dashboard` | shift checked in | Live shift is first actionable card, credible check-in/field CTA and accurate work/pay labels |
| today-next | `/dashboard` | upcoming shift, not checked in | Future date, start, staging, next step, no false "live" |
| today-overdue | `/dashboard` | a shift requiring attention | Confirm `shiftPriority` and actual data; do not imply a guaranteed overdue state |
| today-empty | `/dashboard` | no scheduled shifts | "Nothing scheduled" / "Find your next field job"; no artificial activity |
| work-feed | `/jobs` worker | discoverable openings | Valid rate/type/date/place, relevant filters, saved/hidden and invited; no imaginary bonus |
| job-apply | `/jobs/[jobId]` | eligible, no engagement | CTA **Apply** tied to actual hiring method, visible pay and schedule |
| job-applied | `/jobs/[jobId]` | APPLIED | Application status and real next step; never show Apply again |
| job-hired | `/jobs/[jobId]` | ACTIVE or CLAIMED | Hired state, shifts/messaging as authorized, no second acceptance step |
| shifts | `/shifts` | upcoming/past list | Group by real date, actual status and check-in scheduling |
| shift-live | `/shifts/[shiftId]` | active shift | Existing offline queue, check-out, custody/signature/doors by job type; protect supervisor truth |
| messages | `/messages` | conversation list | Existing direct + group job chats, unread source and privacy rules |
| profile | `/profile` | real worker profile | Actual scorecard/shared periods, credentials, availability, consent/sharing; no 4.9 stars or 28/120 |
| org-desk | `/desk` | operational overview | Needs you, action queues, time/window-scoped numbers, actual live shifts; no invented vanity KPIs |
| org-field | `/field` | field board | Zones/turf only, no worker live location pins; review queue and verified shift statuses |
| org-hiring | `/hiring` | hiring pipeline | Applied/Offered/Working counts from real engagements, no Rating column |
| org-more | OrgTabBar More dialog | available secondary areas | Exactly authorized org links, works with keyboard/Escape/focus restore |

**Additional states still require implementation-specific screenshots:** loading, failure, denied, post-submit, rejected sync, no storage, keyboard, at least one actual job type per role, and authentic full-length page capture. No generated board substitutes for this evidence.

## 3. EXACT SYSTEM TOKENS
Use **production token names**, not a new hardcoded theme. Values below match checked reference on 2026-10-27; validate again when working.

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#EFEAE1` | `#120D18` |
| `--surface` | `#FBF7F0` | `#23182F` |
| `--surface-2` | `#E9E3D8` | `#30223F` |
| `--field` | `#FFFDF8` | `#1A1224` |
| `--fg` | `#1B1422` | `#F6F1E6` |
| `--muted` | `#4A4254` | `#CBBDD8` |
| `--border` | `#E3DCD0` | `#3C2D4C` |
| `--hero` | `#281539` | `#4A3365` |
| `--primary` | `#164B38` | `#164B38` |
| `--cut` | `#82BC9B` | `#82BC9B` |
| `--tab-active-bg` | `#281539` | `#4A3365` |
| `--tab-active-fg` | `#FBF7F0` | `#FBF7F0` |

Spacing **4/8/12/16/20/24/32/40px**. Card radius **14px**, inner surface **12px**, controls **10px**. Restrained light shadow `0 1px 2px rgb(27 20 34 / .04), 0 6px 18px -16px rgb(27 20 34 / .25)`. Public hero serif 34–38px mobile / 44–50 desktop if typography A/B approved; app h1 29–34 mobile / 34–38 desktop; body 14–16; label 12–13; kicker 10–12; all read at real device size. Sunlight should use production `.sun`: white/black high contrast, visible boundaries, no transparency/shadow.

## 4. FORBIDDEN ITEM DECISIONS, NO "CREATIVE" REPLACEMENTS
- **Worker 4.9★** → remove entirely. Official portable math-backed scorecard exists, but not as aggregate rating.
- **28 jobs/120 hours** → remove without verified source, do not replace with illustrative production totals.
- **Hiring Rating column** → remove. Use real status, shared period/credential info, and individual access permissions.
- **Overview made-up KPI tiles** → remove fixtures. Real Desk's queue and operational facts can be shown only with trustworthy numerator/denominator/time context.
- **Worker-position GPS pins** → remove. Property stop/map pins (if licensed and later implemented) are not worker tracking.
- **+ bonuses** → remove unless supported by exact employer-authored gross pay terms.
- **Worker Leads/Map/More tabs** → remove; six actual worker tabs above.
- **Standalone CRM or full Slack clone in v1** → defer; existing job-scoped messaging and minimal follow-up list.
- **Roofing/Solar/phone bank as live job types** → label future; current `JobType` is PETITION/CANVASS.
- **Door-knock aggregate → stop-by-stop proof** → not allowed; existing counts have no address attribution.
- **Sale click → verified/payable** → not allowed. Worker report ≠ verified sale ≠ approved payout.

## 5. CORE-OPERATIONS RS1 V1 — SEPARATE FROM ACTIVE REDESIGN
Milestone [#101](https://github.com/whiterican/TurfCut/issues/101); binding lean acceptance [#110](https://github.com/whiterican/TurfCut/issues/110).

**Only three functional gaps** to address *after founder approval*, while preserving everything existing:
1. **Walkbook/turf:** CSV source rights check and upload, numbered job-attached stops, assign only confirmed ACTIVE/CLAIMED workers; stop order in existing shift. No optimizer/drawing/worker location map.
2. **Stop outcome → minimal lead:** outcomes Not home / Answered—not interested / Interested / Callback / Sale (worker reported) / Do not knock; optional note, idempotent append-only event. Interested/Callback/Sale can generate *authorized* job-scoped lead and dated follow-up; Do not knock suppresses outreach. No standalone CRM.
3. **Messages in context:** surface existing direct per-engagement and group chats inside job and shift, respecting grants and participant removal. Do NOT build a second chat system.

**Repo audit, critical:** `Shift.turfArea` is geographic polygon JSON, manual map pins are notes, `DOOR_KNOCK`/`APP_COUNTS` are aggregate shift counts (not visit IDs). To support address-level stops/visit histories, propose a minimal separate typed stop and visit model with idempotent queue sync, permissions and audited dispositions. Current `syncWorkerActions` uses client IDs, shift lock, deduplication and saved/duplicate/rejected; don't damage any of those mechanics. `ConversationJob` already covers job links. None of these additions can bypass jurisdictional legal gates, tenant isolation, pay verification or political-vs-commercial source restrictions.

**Major founder sequencing rule:** finish active F00–F11 flagship redesign [#78](https://github.com/whiterican/TurfCut/issues/78) before starting RS1 commercial code. Planning review and read-only audit are allowed now, **not coding/migrations/merges/deploy**.

## 6. EXACT DELIVERABLE CLAUDE SHOULD PRODUCE
1. Read this GitHub document and actual code paths above.
2. Obtain the founder's separate rendered ZIP only when an opening/sharing path works; if not, use the text specification, but be explicit you **cannot claim pixel-match QA from absent PNGs**.
3. Capture genuine authenticated app screens full-page (earlier contact sheets were cropped); role+state fixtures, mobile/desktop/light/dark and Sunlight when field-relevant.
4. Compare against every screen/state contract and report actual responsive gaps, especially the *smaller but complete* six-tab floating dock, desktop organization rail and 2-zone worker layout.
5. Produce C1 design/product, C2 engineering/privacy/access, and C3 adversarial accessibility/payment/offline QA review. Report blockers, scope, and approval decisions.
6. **Do not silently build** based solely on this handoff. Founder signs off on a scoped implementation PR plan; no unauthorized changes to production.

**This handoff is content-complete for planning but is not a replacement for the individual PNG/HTML bundle needed for precise visual matching.**
