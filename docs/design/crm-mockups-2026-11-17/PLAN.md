# CRM mockups and plan — for Caden's approval

Status: **mockups only.** No application code, no schema change, no live database change. Nothing here is built until Caden approves.

Order, as Caden asked: **(1) the hiring-pipeline CRM**, then **(2) the field-leads loop** from issue #110. This page is the plan for both.

## How to look at the frames

`renders/` holds 24 screenshots: six frames, each at phone (390 wide) and desktop (1440 wide), light and dark. Every frame sits inside the real app shell (real rail, header, dock and stylesheet). The page content is a stand-in with fictional "demo" people and businesses, and each image carries a "MOCKUP" strip. `frames/*.html` is the source of each frame. `render.mjs` rebuilds the images against a local app. `proposed.css` is the only new CSS, a few patterns on the app's own tokens.

| Frame | What it shows |
|---|---|
| H1 `h1-people-list` | Organization-wide People list with an inspector: who they are, stage, last contact, follow-up. |
| H2 `h2-person-record` | One person: follow-up, private team notes, stage history, and what she shares with you. |
| H3 `h3-follow-ups` | A queue of who needs a reply or decision, earliest first. |
| F1 `f1-worker-today` | Worker's "Today's stops" with the six outcomes and Saved / Sent / Recorded state per stop. |
| F2 `f2-walkbook-import` | Manager uploads a CSV, reviews it, assigns stops to confirmed workers. |
| F3 `f3-leads-list` | Manager's leads list by stage with a lead inspector and Do-not-return suppression. |

## Part 1 — hiring-pipeline CRM

**What it is.** A relationship view for the organization: one row per person across all jobs, instead of only per job. It sits beside the existing Pipeline and per-job applicants pages and links into them. It does not replace them.

**Reuse map**

| | |
|---|---|
| KEEP | `/hiring` Pipeline, `/hiring/[jobId]/applicants`, `/hiring/[jobId]/matches`, `/hiring/[jobId]/invites`, `/hiring/[jobId]/people/[engagementId]` (the per-job person page), the applicant inspector, `Engagement` and its append-only `EngagementEvent` history, the frozen `applicationSnapshot`, the job chat. |
| ADD (new route) | An organization-wide People list (H1) and person record (H2), for example `/hiring/people`. There is no org-wide people route today (`/admin/people` is staff-only). Stage labels are derived from existing data: Applied = APPLIED, Offered = OFFERED, Invited = INVITED, Working = ACTIVE, Past worker = COMPLETED; CLAIMED, DECLINED, WITHDRAWN and CANCELLED would need their own labels. Last contact comes from existing messages and events. |
| ADD (needs schema approval) | Follow-ups, and, only if you decide yes, private team notes. Both append-only. |
| DEFER | Email or SMS sending, bulk messaging, tags, custom stages, import of outside contacts. |

**Proposed new data (not built, needs your approval first, rule 8).** Two append-only tables, each keyed to an organization and a worker:

- `org_follow_ups`: who, due date, short text, created by, and a separate `org_follow_up_events` row when it is done or snoozed (never an update).
- `org_person_notes` (only if Q5 changes): text, author, created at; a correction is a new note that points at the old one.

Both are visible only to members of that organization with the existing hiring access. Neither is visible to the worker.

**Rules this design keeps**

- The "What she shares with you" fields in H2 (experience, availability, languages) are illustrative. Only fields that already exist and that she authorized would appear; the build slice confirms which ones exist.
- Sample note text in H2 is illustrative and appears only if Q5 changes. The H1 "Add note" button and the "private to your team" line belong to that option too and go away under option (a).
- Never infers politics. No political column, filter, sort or label anywhere on these pages. The "What she shares with you" panel shows only what she authorized for this organization, and withheld items stay withheld (H2).
- No universal worker score. Nothing ranks people. Sorting is by date and stage only.
- Append-only. Follow-ups and notes are new rows; "done", "snooze" and corrections are new events.
- Existing approvals still apply: nobody is hired without the worker's accept.

**Decision needed — Q5.** The schema and `src/lib/engagements.ts` say hiring has **no free-text notes about a worker** (structured reason codes only). H2's "Team notes" would reverse that. Options: (a) keep the rule, drop notes and keep only follow-ups with a short structured reason; (b) allow private team notes. My recommendation is (a) first, because notes about a person are the highest-risk part (privacy law, discovery, and access requests). Ask counsel if you pick (b).

## Part 2 — field-leads loop (issue #110, RS1)

**What it is.** A job-attached walkbook: a manager imports business addresses from a CSV, assigns numbered stops to confirmed workers, workers log one of six outcomes per stop, and the manager sees leads and dated follow-ups. This is the commercial roofing and solar loop in #100/#101. It is not a voter-data or voter-contact feature.

**Outcomes (workers pick one):** Not home · Answered, not interested · Interested · Callback · Sale (worker reported) · Do not knock.
**Lead stages (manager side):** New · Contacted · Interested · Callback · Sale · Not interested · Do not return.
Sales are a worker's report until a manager confirms them.

**Reuse map**

| | |
|---|---|
| KEEP | `/field` shift day and check-in, job-linked chat, existing map and turf views, `WorkEvent` and shift records. |
| EXTEND | Field page template (`FieldPage`/`StatusBadge`) hosts the stop list and outcome sheet (F1), as the redesign architecture already planned. |
| ADD (needs schema approval) | Walkbook, walkbook stop, and visit (outcome) tables; a lead record with append-only stage history. Branch name per the issue: `ops-core-loop`. |
| DEFER | GPS dots and routing, photo evidence, contact capture beyond what a person volunteers, payment per lead, voter files. |

**Privacy and legal points the mockups already respect**

- Do not knock is a hard suppression for everyone on the job, and it is never deleted (a new entry can only restore it with a manager reason).
- No GPS dots. Outcomes are what the worker reports.
- Contact details only when a person volunteers them; the CSV contact column is optional and off by default.
- Business addresses only. No residential or voter lists in this slice.
- Free-text on a stop note: F1 hints "no personal details"; the build adds the same guard in validation. "Reported by Maria R." shows worker activity to managers, which is work attribution and gets disclosed in the worker terms. Local "saved on this phone" storage needs a privacy check when built.
- Offline: F1 shows Saved on the phone → Sent → Recorded so a worker with weak signal never loses an entry silently.

## Proposed build order (after approval)

1. Hiring: follow-ups table + People list (H1) + person record (H2) + follow-ups (H3). One slice per frame, each reviewed.
2. Field: walkbook import preview (F2) with no data written until publish; then stops and outcomes (F1); then leads and follow-ups (F3).
3. Every slice: typecheck and tests, a separate reviewer, evidence screenshots. One milestone at a time.

## Questions for Caden

1. **Q5 notes:** keep "no free-text notes about a worker" (my recommendation) or allow private team notes?
2. **Follow-ups on people you have not hired yet:** allowed for applicants only, or for past workers as well?
3. **Schema:** approve the follow-up tables, and later the walkbook, stop, visit and lead tables, as separate approvals?
4. **Field leads:** commercial roofing and solar only, as in #100/#101? Confirm no voter lists in this slice.
5. **Who can see leads:** job owner and managers only, or any member with Field access?
6. **Do-not-return rule:** may a manager lift it, and with what reason?
7. **First client:** which organization will use this first, so I can sanity check the CSV columns?
