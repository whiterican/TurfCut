# TurfCut — Product Expansion & UX Roadmap
**Status:** Strategic plan / Claude handoff. Not authorization for unrestricted implementation, schema changes, production merges or deployment. Owner requested continued planning and feature expansion after Candidate Campaign Canvassing.

## North star
TurfCut connects campaigns, political field workers and organizations through discovery → hiring → scheduling → briefing → field activity → independent verification → transparent pay. Political neutrality at platform level. Explicit worker-controlled preference sharing and evidence-based verification are differentiators, not optional extras.

## Architecture already inspected
Next.js 16 App Router, React 19, TypeScript, Supabase/Prisma, Stripe, Vitest. Relevant navigation and pages: src/lib/nav.ts; src/components/AppNav.tsx; src/app/dashboard/page.tsx; src/app/desk/page.tsx; src/app/hiring/page.tsx; src/app/field/page.tsx; src/app/jobs/page.tsx; src/app/messages/page.tsx; src/app/notifications/page.tsx; src/lib/offline-queue.ts; src/lib/offline-sync.ts; src/lib/pay.ts; src/lib/access.ts; src/lib/scorecard.ts; src/lib/shift-slots.ts; src/lib/political-fit.ts; src/lib/jobs.ts. Workflows are present already; improve rather than duplicate. **Not a claim that all source files or live UX have been exhaustively audited.**

## Prioritization rubric
Risk-severity first (money loss, privacy breach, missing verified work), then worker activation and successful shift completion, then staffing/approval speed, then expansion value. Distinguish confirmed issue from hypotheses, validate baseline before setting numerical targets.

### M1 — Candidate campaign canvassing (approved direction, first scoped feature)
**Deliverable:** First-class candidate job discovery and job creation UX on top of existing CANVASS + campaignDisclosure.campaignType=candidate.
**Plan:** docs/product/CANDIDATE_CANVASSING_CLAUDE_HANDOFF.md. Do not invent a third activity enum.
**Accept:** Category and work activity visible separately; candidate filter intersects with existing job filters; legacy jobs unaffected; political consent and jurisdiction gates remain enforced; tests, screen-reader/mobile review; draft PR independently reviewed.

### M2 — Mobile worker home and shift readiness (proposed, not implemented)
**User problem:** Worker must navigate multiple screens to answer: Where do I go, when, who do I call, what is expected, what is pending?
**Design:** Unified Today card, one primary contextual action (prepare/check in/resume/log/check out), upcoming shift brief, staging access, visible emergency/support contacts, required credentials and needed training, offline readiness check, and status legend (unsent / accepted / under review / verified).
**Paths to inspect:** dashboard/page.tsx, shifts/[shiftId]/page.tsx, FieldDayLive.tsx, OfflineBrief.tsx, nav.ts, field-day-data.ts.
**Edge cases:** timezone/DST, stale shifts/cancellations, no signal, expired credentials, changed job terms, multi-org engagement.
**Accept:** all critical tasks possible on small phone, accessible tap targets, keyboard/screen readers, no hidden destructive gestures; no change to pay/verification authority.

### M3 — Offline integrity + recovery center (proposed, security-critical)
**Evidence:** offline-queue.ts stores actions in localStorage, falls back to memory on storage failure; offline-sync.ts corrects device timestamps and accepts actions within 24 hours; sync route validates and rate-limits.
**Hypotheses to test, not allegations of current defects:** local-storage quota and tab closure; duplicate/reordered requests; phone clock changes and replay; background expiry; signed-out/shared devices; stale shift; network flip-flop; worker fairness when >24h.
**Design:** persistent sync status, accessible errors, retry with idempotency, worker-initiated export/recovery, supervisor reconciliation queue; no collection of raw geo traces.
**Accept:** never silently promise persistence when memory-only; identical action IDs cannot double count; confirmed server state distinguishes unsent, rejected, saved and approved; recovery does not rewrite append-only events.

### M4 — Organization operations desk (proposed)
**User problem:** Teams need next actions rather than disconnected totals.
**Design:** role-sensitive action queue: jobs needing approval, understaffed shifts, unanswered offers, late check-ins, pending batch reviews, aging disputes, payout exceptions. Deep links; filter by campaign, region, date and responsible owner.
**Paths:** desk/page.tsx, hiring/page.tsx, field/page.tsx, pay/page.tsx, access.ts.
**Accept:** aggregate metrics with explained denominators, no hidden universal worker score; RBAC and org isolation; pagination and loading resilience.

### M5 — Recruitment and recurring staffing (proposed)
**Design:** clear application stages, availability-aware slot discovery, shift conflict warnings, saved job preferences (non-political), invitation tracking, rehire invitations with consent, crew scheduling. Avoid auto-selection using proxy political signals.
**Paths:** hiring/*, shift-slots.ts, engagements.ts, availability.ts, matches-data.ts.
**Accept:** no double booking/oversubscription under concurrent claims, no employer exposure of private availability/political answers not authorized for sharing, messaging restrictions preserved.

### M6 — Worker payment trust (proposed)
**Design:** earnings timeline clearly separates logged work, approved verification, approved payable line, initiated transfer, settled payout, and disputed/held amount; explain gross amount, platform fee charged to org, frozen formula, adjustments and receipts. Plain-language next step when payout setup incomplete.
**Paths:** earnings/*, pay/*, pay.ts, statements-data.ts, receipts-data.ts, stripe/webhook route.
**Accept:** event-sourced balances reconcile exactly, no double transfer on retry, fees unchanged retroactively, no claim 'paid' before confirmed, dispute/correction preserves original events.

### M7 — Campaign launch wizard (proposed)
**Design:** campaign identity and classification → jurisdiction/approval status → campaign brief and disclosure → job and pay setup → staffing → shifts → worker instructions → review and launch. Keep draft autosave and explicit blocked state when jurisdiction rules are missing.
**Future candidate data:** candidate name, office sought, jurisdiction/district, election date, authorized sponsoring committee; first inspect current schema then seek owner approval for any new columns/tables.
**Accept:** no silent defaults for affiliation, legal requirements or classification; replayable publish checklist; backward compatibility for existing campaign profiles.

### M8 — Campaign-specific field operations (proposed)
**Ideas:** work area assignments with privacy-preserving aggregate coverage; offline worker brief; literature inventory; shift-level training acknowledgment; supervisor escalation; verifiable activity summaries. Separate door knocks, conversations and completed contacts clearly. Do not add individually targeted voter persuasion or personal voter profiling without a separate lawful/product review.
**Accept:** activity units, evidence and pay basis stay mutually consistent; no inflated coverage or performance numbers; clear supervisory approval boundaries.

### M9 — Portable verified worker career profile (proposed)
**Design:** selectable professional portfolio: verified shifts, areas of experience, training, credential expiry, transparent formulas with sample sizes, permissions-based sharing and export. No composite score, ideologically inferred labels or disguised sorting.
**Accept:** self-reported vs independently verified work visually distinct; revocation of shared data respected; no signal extracted from withheld responses.

### M10 — Notifications and collaboration (proposed)
**Evidence:** notifications/page.tsx mixes hiring/pay events with followed campaign posts; messages/page.tsx supports conversations post-hire.
**Design:** action-needed vs informational sections, reliable read-state, grouped non-urgent notices, notification preferences, safe deep links and accessibility; compliance-friendly moderation/report processes.
**Accept:** employer cannot see private read state; no leaked worker or other organization's messages; queue/notification failures do not block payments or field activity.

## Feature ideas to research, not implement without scoping
- Campaign finance-ready exports or integrations (legal/accounting review before claiming compliance)
- Role-specific command center for candidate committees and ballot initiative organizations
- Shift-specific preparation packets and reusable training templates
- Worker safety button with rapid access to designated campaign contact, without unnecessary GPS tracking
- Supervisor audit trails for correction reasons and field materials custody
- Campaign season continuity: repeat staffing, worker retention, calendar conflicts, seasonal availability
- Accessibility and offline-first PWA resilience checks on actual low-end phones
- Organization verification, identity and financial accountability
- Transparent operational forecasting for staffing cost and coverage (aggregate, not voter profiling)
- Fraud/abuse defenses: fake jobs, wage misstatement, payment holds, credential-document misuse

## Cross-cutting audit before each milestone
1. Read exact impacted code and tests with file:line evidence; mark verified fact, risk hypothesis or proposal.
2. Threat model auth, tenant isolation, RLS/service role, rate limits, SSRF/uploads, secrets, Stripe webhook replay/idempotency, privacy and retention.
3. Test desktop and phone UX, poor connectivity, keyboard/screen reader, role-specific empty/error/loading states.
4. Test event and ledger invariants and adversarial concurrency against real Postgres when relevant.
5. Avoid DB migration/dependency changes until owner approves; respect CLAUDE.md append-only and jurisdiction hard stop.
6. Require separate Claude reviewer for each slice; typecheck, lint, tests, build, acceptance as relevant; staged rollout/rollback.
7. One milestone at a time; return to owner for approval before proceeding beyond each independently scoped phase.

## Suggested design system direction
Create a coherent, calm hierarchy: role-specific home, one primary task per surface, fewer competing cards, useful informative empties, consistent labels, visible operational status, explicit confirmation of important transitions, readable outdoor high contrast, large reachable controls, no hidden app state. Preserve existing branding unless owner approves redesign.

## Evidence and measurement
Baseline metrics to instrument ethically: worker onboarding completion; job → application conversion; filled shift rate; check-in friction; unsent actions recoverable; supervisor review turnaround; pay approval → confirmed transfer; dispute resolution time; error rate by device/connection. Collect aggregate operational analytics only, with privacy/consent review; never turn worker behavior into secret political propensity scores.

## Owner decision gates
- Implement M1 only under its specific approved brief, on isolated branch and draft PR.
- Approve M2–M10 independently before implementation.
- Any schema/dependency, compensation, party-related matching, geolocation, legal or production changes require explicit approval, even within approved milestone.
