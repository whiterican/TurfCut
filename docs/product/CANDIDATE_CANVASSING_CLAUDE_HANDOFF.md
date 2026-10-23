# TurfCut — Candidate Campaign Canvassing | Claude handoff

Status: **approved product direction, planning document**. Do not merge or deploy. Follow CLAUDE.md one-milestone-at-a-time and approval-before-schema/dependencies.

## Product architecture
Treat **campaign category** and **work activity** as independent dimensions. An electoral candidate campaign can hire door-to-door canvassers without changing the existing Prisma work enum. Existing CANVASS + campaignDisclosure.campaignType='candidate' already represents it. Preserve PETITION/CANVASS, payroll units, work validation, worker metrics, historical records and employer permissions.

## Verified code references (master at 2026-10-23)
- src/lib/jobs.ts: JOB_TYPES around 34; JobDisclosure 60–67; validateJob campaignType 208–214; readDisclosure 322–335; parseFeedFilters 732–753.
- src/components/JobForm.tsx: work type 190–194; campaign type 365–370; candidate or measure name 381–384.
- src/components/JobFeedCard.tsx: currently displays only Petition/Canvass 24–44; candidate identity not prominent.
- src/app/jobs/page.tsx: quick chips 71–77, advanced filter 140–149.
- src/lib/jobs-data.ts: loadFeed 181–208; preserves do-not-match exclusion logic.
- src/components/JobCard.tsx: shows campaign disclosures 66–82.
- src/lib/jobs.test.ts: filter tests around 299 and party badge tests around 357.
- Earlier founder roadmap GitHub issue #7.

## First implementation milestone — require draft PR and review
1. Add a pure helper for job-facing activity/category labels. 'Candidate campaign canvassing' must mean CANVASS plus category candidate. Other combinations retain their own accurate names. Malformed/legacy disclosures are displayed neutrally, not guessed.
2. Add a validated campaign-category URL filter alongside existing work-type filter. Support intersection with existing type/date/rate/credential options, respecting worker do-not-match choices. Prefer SQL JSON campaignDisclosure filtering when safe; ensure legacy/no-disclosure jobs continue in unfiltered views.
3. Add 'Candidate campaigns' quick filter and category in advanced filters; clear and toggles should behave consistently. Verify filter state in both worker feed UI and /api/jobs.
4. Improve feed cards to show campaign category, candidate name when supplied, and self-disclosed affiliation without removing pay, location, date or job type.
5. Adjust the job wizard UX so category is understood early. Preserve create/edit round-trip, field validation, screen-reader labels and mobile responsiveness. Do not invent persisted office, district or election fields in unrelated columns.
6. Add tests for candidate+CANVASS, ballot+PETITION, ballot+CANVASS, civic+CANVASS, missing/invalid disclosure, combined filter conditions, privacy boundaries, and historical jobs.
7. Run typecheck, lint, unit tests, build and applicable database acceptance tests. Use independent Claude reviewer. Report actual results, don't claim tests run when not.

## Prohibited shortcuts
- No new JobType enum solely for labeling; no schema/dependency changes without owner approval.
- Never infer politics, political preferences or affiliations; never expose withheld worker answers.
- Preserve append-only work, audit, validation and pay data; preserve jurisdiction publishing hard stop.
- Do not extend compensation methods or per-contact semantics in this slice.
- No merge/deployment without explicit owner approval.

## Roadmap after milestone 1 (separate approval)
- Candidate campaign organizational profile: sponsoring committee, office, district, election details with validation and regulatory review.
- Guided campaign launch, shift readiness brief, work-area planning with aggregate progress.
- Operational command desk for openings, staffing risk, sync exceptions, review backlog and approved payment obligations.
- Worker-first mobile improvements: offline queue health/recovery, shift quick actions, earnings timeline, accessible outdoor design.
- Structured invitation and repeat-work workflows, portable verified portfolio without universal worker scores.
- Compliance review for regional rules, nonpartisan participation and worker privacy.

## Expected handoff output
Create a small implementation PR only after confirming this scope. PR body: changes, exact files, screenshots/mobile behavior, tests, residual risks, reviewer notes, explicit decisions needed. Stop at any approval gate.
