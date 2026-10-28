# TurfCut hero-board — Claude review handoff

**Design-only branch** `docs/turfcut-hero-board-handoff-2026-10-28` based on master `fec571252dbec0c5e69629e1ae71870c6e36f983` (2026-10-27). No production code, runtime dependencies, schema, migrations, or deployment changes.

## Founder decisions — definitive
- **Keep and SHRINK the floating mobile dock.** Compact rounded 348px-wide max reference, 48px hit tiles (real production minimum ≥44px), 17px icons, short complete labels, eggplant filled current tile; 10px + safe-area bottom inset.
- **Do not omit worker tabs.** Exact worker destinations: Today `/dashboard`, Feed `/feed`, Work `/jobs`, Shifts `/shifts`, Messages `/messages`, Profile `/profile`. **Six tabs, no More, no invented Leads/Map worker tabs.**
- Org owner mobile: Desk, Hiring, Field, Messages, More. Owner More: only granted Jobs, Pay, Credentials, Campaigns, Members, Settings. Other roles derive authorized nav from `src/lib/nav.ts:PHONE_PICKS`, `orgNav` and server grants; desktop org retains full permission-filtered rail, not duplicate top bar.
- Typography: test **Public Sans** for work interfaces, **Newsreader** sparingly on public editorial hero and existing **DM Mono** for audited numbers, A/B against current production **Barlow/Barlow Condensed/DM Mono**. Font substitution is a proposal, **not already approved**.
- Brand: deep eggplant + warm cream + forest green primary + soft green decorative cut, with the current actual branding and Sunlight. No lime return, fake product logo, second design language, or invented metrics.
- No invented worker rating 4.9, 28 jobs/120 hours, arbitrary Rating column, dashboard vanity totals, + bonuses, worker GPS pins or as-yet-inexistent live commercial sales categories. Drop forbidden elements with no substitute where real data cannot support one.

## Independent assets ready to transfer
A separate **TurfCut_Claude_Hero_Board_Final_2x.zip** was prepared in the founder's ChatGPT conversation, with:
- 16 static HTML screens (Today live/next/overdue/empty, Work feed, Job detail apply/applied/hired, Shifts, active shift, Messages, Profile, org Desk/Field/Hiring/More).
- 64 individual Playwright PNG screenshots: each at `390×844` and `1440×900` CSS px, device pixel ratio 2, in light and dark. Examples: `today-live-390-light.png`, `job-hired-1440-dark.png`.
- Per-screen Markdown specs (`specs/<screen>.md`), `tokens.css`, `DESIGN_TOKENS_SPEC.md`, `NAVIGATION_CONTRACT.md`, `FORBIDDEN_ITEM_DECISIONS.md`, `OPERATIONS_CORE_LOOP_REUSE_AUDIT.md`, `SCREEN_STATES_MATRIX.csv`, `qa-results.json`, `qa-small-viewport.json`.
- Original static HTML/CSS meant only for Playwright pixel comparison with existing Next 16/Tailwind v4 components, **not** production integration.

**Important asset-delivery limitation:** the PNG/HTML ZIP is **not yet committed to this GitHub branch**. This README is the repo handoff pointer only. Founder must attach/provide the ZIP to Claude, or the ZIP's contents must be committed to `docs/design/hero-board/` through an authorized binary-capable workflow. Do NOT infer or fabricate screenshots from this README. Individual image access in GitHub is not claimed.

## QA already performed on reference files
- All 64 PNGs exist at their exact physical 2× dimensions (780×1688 and 2880×1800).
- 64 of 64 core renders measured zero horizontal overflow; 48px minimum mobile hit areas in 390px renders.
- 64 additional checks at 320px and 430px, light and dark: zero overflow, no clipped dock labels, minimum dock hit 46px.
- Desktop org top-nav/rail duplication found in preliminary reference and corrected prior to final ZIP render.
- 320px and 200% text zoom/focus/keyboard in **the actual app** still need implementation QA. Light/dark static references do not prove full Sunlight conformance.
- **Not genuine production screenshots.** Existing full-length authenticated live screenshots remain missing and should be recaptured separately.

## Read the app before changing anything
`src/app/globals.css`, `src/app/layout.tsx`, `src/lib/nav.ts`, `src/components/AppNav.tsx`, `src/app/dashboard/page.tsx`, `src/app/jobs/[jobId]/page.tsx`, `src/app/shifts/[shiftId]/page.tsx`, `src/app/desk/page.tsx`, `src/lib/chat-data.ts`, `prisma/schema.prisma`.

Flagship redesign master issue #78 remains the active implementation track. Roofing/solar RS1 v1 issue #110 is a separately gated **expansion**: job-linked walkbook stops → stop outcomes → minimal leads/followups → existing messages, no second hiring, pay, messenger or verification system. RS1 work must not block F00–F11 redesign.

**No code changes are authorized by this docs branch.** Founder review + C1/C2/C3 requirements still apply.
