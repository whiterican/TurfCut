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

## Approved expansion direction — One-stop shop for all door-to-door work (founder approved 2026-10-23)
**Proposed public headline:** **“The One-Stop Shop for All Door-to-Door Work.”**
**Three top-level sectors:**
1. **Political — Candidates & Issues:** petition circulation, electoral candidate canvassing, ballot/issue outreach.
2. **Nonprofit — Fundraising & Outreach:** charitable door-to-door fundraising, awareness, membership recruitment.
3. **Private — Sales & More:** commercial door-to-door sales, customer acquisition, lead generation, market surveys and permitted neighborhood outreach.

**Product definition:** A cross-sector field-work marketplace and operations system, covering discover → hire → schedule → brief → work → verify → pay. The political, nonprofit and private sectors share a common operational foundation but must retain distinct campaign identification, training, compensation, outcome units, safety and compliance requirements.

**Approved design direction:** Introduce a prominent three-sector navigational concept and improve campaign category labeling, job discovery, worker-first mobile UI and launch onboarding. This approval is strategic/product UX approval; it is **not** permission to represent private-sector or nonprofit job types as already launched, enable donation processing, change payroll accounting, bypass jurisdiction rules, or merge/deploy without verification.

### Implementation stages
**Stage A — low-risk, no schema:** On existing political jobs, clearly label candidate vs ballot-measure vs civic canvassing using already stored campaignDisclosure; preserve petition pay unit and legacy jobs. Add tests and a draft PR. For marketing/docs, distinguish **available** and **coming later** clearly.
**Stage B — sector taxonomy architecture:** Design separate `sector`, `campaignPurpose` and `workActivity` values. Existing JobType PETITION/CANVASS and existing political disclosures stay backward compatible. Propose migration and data ownership/RBAC plan for approval before modifying schema.
**Stage C — nonprofit:** nonprofit account identification, genuine charity/paid solicitor verification as appropriate by jurisdiction; fundraising job disclosure and consent; avoid collecting donor credit cards or sensitive donor data in worker devices; donation processor and worker wages must be separated.
**Stage D — private:** private company identities, clear employer/contractor classification, sales training/compliance, no misleading pay/rate or unverified commission statements, lead privacy, territory assignments only after opt-in/authority and security review.
**Stage E — unify:** sector tabs for worker discovery (All / Political / Nonprofit / Private), appropriate job cards and category-specific wizard paths; verified history remains activity-specific without a universal worker score.

### UX design principles
- Be **one brand, three paths**; use a neutral clean design and sector icons, never party colors for private/nonprofit work.
- Make *who is hiring, what activity, where, when, pay basis and what counts as verified* immediately visible.
- Show 'Coming later' on any nonprofit/private sections until end-to-end onboarding, hiring, compliance and payment are actually usable.
- Mobile-first large targets, readable high-contrast typography, clear current shift state and offline status.
- Do not infer political leanings, causes or personal interests from user demographics or job behavior; follow worker-controlled preferences.
- Maintain explicit verification distinction between donations pledged vs received and leads collected vs independently accepted; avoid ungrounded outcome claims.

### Risks and approval gates
- Different state/local charitable solicitation and professional fundraising rules, commercial solicitation licensing, consumer protection, no-soliciting laws, wage/hour and independent contractor treatment must be reviewed before launch.
- Charity contributions **must not** be routed through existing worker payout flows.
- Candidate-specific and nonprofit/private enhancements should be phased; do not silently reclassify existing political data.
- Schema, legal policy, new provider integrations and production rollout require separately reviewed plans.

## Founder-approved additional job category — Phone Banking (2026-10-23)
Phone banking is a **first-class work activity** alongside door-to-door canvassing, petition circulation, nonprofit fundraising and private outreach. It is available as a proposed job type for all three sectors where relevant; do not force it into the existing `CANVASS` classification.

### Required job-type options and naming
- **Phone Banking**
  - **Remote / Work From Home** — phone outreach completed off-site; disclose timezone, technical requirements, remote supervision/attendance rules, required systems and equipment, training, compensation and calling hours.
  - **Office / On-Site** — phone outreach at a designated office or call center; disclose actual worksite, arrival/check-in instructions, available equipment, training, compensation and calling hours.
Both options must be distinct in filters, job cards, job creation and scheduling. The primary work-activity category stays `phone_banking` with a separate `workMode` of `REMOTE` or `ONSITE`, not two independent enums per sector. Do not assume a third `HYBRID` option without further approval.

### Sector examples
- Political: candidate voter-contact calls, ballot/issue education and outreach, volunteer recruitment.
- Nonprofit: supporter engagement, fundraising calls, donor follow-up and membership outreach.
- Private: sales calls, appointment setting, customer outreach, research, subject to applicable permissions and rules.
No worker is presumed willing to work for a particular party or cause; workers decide what jobs to apply to, and private political preferences stay protected.

### Functional implications for Claude
1. Extend planned three-axis architecture: `sector`, `campaignPurpose`, `workActivity`, plus `workMode` and `worksite/remoteRequirements`. The existing Prisma JobType only encodes PETITION/CANVASS and cannot accurately encode phone banking; request a reviewed schema/API/backward compatibility plan before implementation.
2. Create job form progressive disclosure: phone bank selection reveals Remote or Office radio choices; location field becomes optional for remote but timezone and eligibility, operating hours, equipment and communications protocols must be explicit. For onsite, require actual worksite details and jurisdictional rule profile.
3. Worker feed filters: category `Phone Banking`, with subfilters `Work From Home` and `Office / On-Site`; preserve one-click mobile browse and honest status for unavailable categories.
4. Scheduling/shift workflows must support remote start and wrap-up without GPS check-in expectations; office shifts use appropriate location confirmations. Never require geolocation for remote work solely because the door-to-door workflow supports it.
5. Work verification must distinguish calls attempted, connected conversations, consented follow-ups, appointments, pledges or contributions and other outcomes; **do not** count attempted calls as completed conversations or donations. Ensure compensation rates and payable units are approved before launch; maintain auditable, append-only work/pay histories.
6. Integrations with calling software, numbers, CRM or donor systems are future optional integrations needing provider, security and privacy approval. **Do not implement bulk dialing, upload contact lists or record calls** by default. Review consent, telemarketing/calling-hour restrictions, privacy, recording laws, nonprofit fundraising obligations and election rules per jurisdiction and outreach purpose.
7. Tests: remote vs onsite form validation, default/legacy card handling, filter intersections, shift status and pay invariant, permissions and access control, no accidental location requirement for remote, no leaks of phone numbers or donor/voter information.

### Positioning adjustment
The founder's preferred three-sector headline remains **“The One-Stop Shop for All Door-to-Door Work”** for the field-work market, but it is no longer a complete umbrella description once Phone Banking is offered. Suggested umbrella headline:
**“TurfCut — One Platform for Field Work and Phone Outreach.”**
Subhead: **“Political • Nonprofit • Private — From door-to-door canvassing and fundraising to remote and in-office phone banking.”**
Consider reserving “One-Stop Shop for All Door-to-Door Work” as a campaign tagline / door-to-door landing-page headline rather than the entire product definition.

**Status:** Founder direction approved; document and design now. Actual phone banking job type, payment units, legal review, database migration and production release each require implementation review and validation. Do not advertise as currently shipped.

## Founder-requested job activities — Polling (2026-10-23)

Add TWO **first-class, separately discoverable job types** to the cross-sector work taxonomy:

1. **Phone Polling** — structured telephone surveys / opinion research, separate from **Phone Banking** (organizing, outreach, persuasion, fundraising or contact campaigns). Required sub-options:
   - **Remote / Work From Home**
   - **Office / On-Site**
2. **Door-to-Door Polling** — in-person interviewer / survey enumerator visiting residences or assigned field areas, separate from **Door-to-Door Canvassing** (outreach, persuasion, fundraising, sales, petitions).

Both polling categories may serve **Political**, **Nonprofit**, and **Private** sectors when appropriate. Examples: public-opinion surveys, program evaluation, customer research, and community feedback. Do not assume surveys are inherently partisan.

### Taxonomy and UX rules
- Sector (political/nonprofit/private), campaign purpose, activity and work arrangement are **distinct dimensions**. `phone_polling` and `door_to_door_polling` must not be encoded as `CANVASS` merely to avoid migration.
- Suggested top-level activities for design: Petition Circulation; Door-to-Door Canvassing; Door-to-Door Fundraising; Door-to-Door Sales; Phone Banking; **Phone Polling**; **Door-to-Door Polling**. Only show as live selectable postings after each is end-to-end supported.
- Phone Polling form requires a `workMode` choice (Remote or Office); remote needs disclosed calling timezone/hours, equipment/software and accessibility expectations; office needs physical worksite and check-in details. No GPS requirement for remote phone polling.
- Door-to-Door Polling form needs service area, shift route/assignment if permitted, interview protocol, travel/staging instructions, safety escalation contact, required training and accessibility considerations.
- Feed filters and job cards must distinguish **Phone Banking vs Phone Polling** and **Door-to-Door Canvassing vs Door-to-Door Polling**; display clear paid unit and confirmation criteria. Avoid misleading outcome counts.
- Work verification distinguishes attempted calls/visits, live interviews started, completed interviews, interviewer-reported data and independently validated survey completions. Never count attempted contact as a completed survey.
- Workers should receive a truthful disclosure of who sponsors/conducts the research and whether the work involves collecting sensitive personal responses. Keep individual respondent identities, survey answers, and respondent contact details out of worker scorecards and broad employer views by default.
- Seek legal/privacy review on survey consent, calling-hour restrictions, automated/prerecorded calls, call recording consent, consumer contact rules, election/political-research regulations, data minimization, retention and vendor obligations. Don't build dialers, scraping, respondent profiling or data exports by default.
- Payroll and compensation design needs explicit approval of polling-specific units (e.g., verified completed interview) prior to any per-unit pay; do not treat a survey as an accepted canvass contact using existing formulas.
- Backward compatibility: keep existing PETITION and CANVASS jobs, historical records and jurisdiction publish gates unchanged; propose versioned schema/API changes separately for approval.

### Claude implementation milestones
**Polling P0 — Architecture and interaction design:** wireframe candidate flows and approve job taxonomy, database changes, privacy and employment/compliance assumptions. Documentation only until approved.
**Polling P1 — Discovery + hiring:** add validated job-category and work-mode data, create/edit form, worker filters, badges, organization jobs list, read-only details, unit tests and tenant isolation checks.
**Polling P2 — Shifts + activity:** phone/field shift readiness, permitted attendance check, offline field event queue, survey-completion audit evidence (without storing raw sensitive survey answers in generalized work events), manager review.
**Polling P3 — Payments + optional integrations:** verified interview compensation if legally/operationally approved; separate integration review for approved survey software/telephony.
**Acceptance cases:** phone poll (remote and office), door poll, phone banking (remote and office), door canvassing, malformed/legacy jobs, combined filters, timezone, internet loss, privacy boundary, employer access isolation, pay dispute and duplicate activity replay.

### Brand positioning refinement
The three organization sectors remain **Political • Nonprofit • Private**. Activities now include both **Field Work and Phone Outreach & Research**, suggesting:
**“TurfCut — One Platform for Field Work, Polling and Outreach.”**
Keep “One-Stop Shop for All Door-to-Door Work” as a memorable vertical tagline, not the entire scope.

**Delivery status:** Polling is now **specified for future implementation, not released**. No production schema or pay changes occur from this roadmap entry.
