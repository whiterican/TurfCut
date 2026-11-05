# Field and action map: the core hiring flow

Every field, action, state and line of copy the mockups draw, with the source that produces it at master `2aed8c3`. The mockups add no field, action or state that isn't here. Anything that would need new data is listed at the end as a question, not drawn.

## 1. Job builder — `/jobs/new`, `/jobs/[jobId]/edit`

| What | Source |
| --- | --- |
| Guard: a member whose role includes `jobsEdit`; anyone else is sent to their home with the no-access notice | `src/lib/employer-session.ts:19` (`requireJobEditor`), `src/components/NoAccessNotice.tsx:42` |
| The six steps and the fields each one holds | `src/lib/job-builder.ts:16` (`BUILDER_STEPS`): The work · When and where · Pay and hiring · Requirements and contacts · Campaign disclosure · Review |
| Lead on a new job: "Six short steps. Your draft saves as you go, from the first step, and is published from the job page once every check passes." | `src/app/jobs/new/page.tsx:16` |
| Autosave words: "Your draft saves as you go." · "Saving draft…" · "Draft saved 3:14 PM" (· "2 fields wait for a fix") · "Not saved yet: …" · "Couldn't save: …" | `src/components/JobForm.tsx:23` (`saveWords`) |
| Step list: current, done, not yet reachable (`aria-current="step"`, `aria-disabled`) | `JobForm.tsx` step `<ol>` (`.step`, `.step-current`, `.step-done`) |
| Inline error after its field, `aria-invalid` + `aria-describedby`; problems no field shows listed under the step heading | `JobForm.tsx` (`err`, `describe`, `loose`) |
| Next checks the current step with the server's validator; jumping ahead checks every step on the way and stops at the first that fails; the first field with a problem takes focus | `JobForm.tsx` (`goTo`, `focusFirstProblem`) |
| Buttons: Back · "Next: <step title>" · on Review "Create draft" / "Save draft" / "Saving…" | `JobForm.tsx:568` |
| Review rows, each with "Change" back to its step; footnote "Saved as a draft. You publish it from the job page once every check passes, including the jurisdiction's rules." | `JobForm.tsx` (`Review`), `:629` |
| Jurisdiction option suffixed " — can't publish" when the profile has problems | `JobForm.tsx` (jurisdiction `<select>`), `src/lib/jurisdiction-options.ts` |
| Editing a saved draft: every step open from the start; autosave on | `src/app/jobs/[jobId]/edit/page.tsx` (`autosave={job.status === "DRAFT"}`) |
| Editing a live job: eyebrow "Edit published job"; notice "This job is live. Every change is recorded and everyone on the job is told. …"; autosave **off** | `edit/page.tsx:29` |
| A closed job: "This job can't be edited" / "A closed job keeps the terms it closed with." | `edit/page.tsx:38` |
| Enter in a text field goes to the next step | `JobForm.tsx` (`onKeyDown`) |

### Publishing (on the job page, never in the builder)

| What | Source |
| --- | --- |
| Section "Publishing" on a draft or paused job | `src/app/jobs/[jobId]/page.tsx:551` |
| "This job can't publish yet" + one bullet per blocker | `page.tsx:554`; reasons from `src/lib/jobs.ts:529` (`publishBlockers`): awaiting approval · sign the contractor terms · classification review · jurisdiction problems (`jurisdictionProblems`) · compensation not allowed there · state mismatch · pay rate · headcount · dates · disclosure · support contacts · hiring mode · launch ("Add at least one staging point, or switch the job to self-launch.", `src/lib/job-launch.ts:141`). The list is flat: no reason carries its step. |
| "Organization settings" link only for a member who can open it (`canReadSettings`) | `page.tsx:557` |
| "Every check passes. Publishing re-runs them at that moment." | `page.tsx:560` |
| Publish (disabled while blocked) · Edit draft (`canEdit`) | `page.tsx:564` |
| Frozen live job: "No new shifts or seats until this job fits the current rules" + reasons + edit link (`canEdit`) | `page.tsx` (`jobFreezeReasons`) |

## 2. Hiring overview — `/hiring`

| What | Source |
| --- | --- |
| Guard `requireArea("hiring")` | `src/lib/employer-session.ts:33` |
| Title "Pipeline"; meta "Open jobs and the people at each stage. …" | `src/app/hiring/page.tsx` |
| Band: open jobs · applications waiting · offers out · invited · working (singular/plural per count) | `hiring/page.tsx` (`summary-band`) |
| Table (stacks on a phone): Job · Applied · Offered · Invited · Matches ("—" when it can't be measured) · Working · Filled ("3 of 5") | `hiring/page.tsx` (`DataTable stack`), counts from `src/lib/hiring.ts` (`pipeline`), `src/lib/matches-data.ts` (`matchCounts`) |
| Empty: "No open jobs. Publish a job to start hiring." | `hiring/page.tsx:39` |

## 3. Applicants — `/hiring/[jobId]/applicants`

| What | Source |
| --- | --- |
| Eyebrow "Applicants"; title = job; meta "4 applicants · 2 to decide · 1 offer out · 5 spots" | `applicants/page.tsx` (Masthead) |
| Tabs Applicants · Matches · Invites, each with its count | `src/components/staff/HiringTabs.tsx` |
| "Columns and filters" disclosure: column checkboxes; Stage (Every stage / Waiting on someone); Applied on or after; Free on at least one of the job's days; Holds every required credential; "Show" / "Reset"; hint "A filter narrows what workers shared. Anyone who doesn't share what it looks at stays on the list, marked 'not shared'." | `applicants/page.tsx` |
| Columns: Applicant · Applied · Stage · Free on job dates · Required credentials · Signatures / active hr · Validity rate · Doors / active hr · Contact rate · Doors / shift · Show rate · Verified shifts (by job type) | `src/lib/applicants.ts:37` (`COLUMN_DEFS`) |
| Row select + bulk actions on APPLIED/OFFERED rows while the job is published or paused | `applicants/page.tsx` (`BulkApplicantActions`) |
| Inspector beside the table from 1280 (stage, since, actions, free on dates, required credentials, "Open the full page"; never political fit) | `src/components/inspector/ApplicantInspector.tsx` |
| Empty: "Nobody has applied yet" / "Workers who apply show up here, with what each one shares with your organization."; filtered empty "No applicants match these filters." | `applicants/page.tsx:157`, `:165` |
| Footnote: "Only what each worker shares with your organization, as of now. 'Not shared' is never counted as zero or ranked. There is no overall score. Political answers never appear in this table." | `applicants/page.tsx` |

## 4. Matches — `/hiring/[jobId]/matches`

| What | Source |
| --- | --- |
| Intro: workers who turned on "organizations can find me" for this work, within the distance they'd travel; one fact per column; no overall score; "do not match" answers keep a worker off with nothing shown | `matches/page.tsx` |
| Refusals: not approved · not open (publish the job) · no city · city unplaced · not found, each with title and body | `matches/page.tsx:24` (`REFUSED`) |
| Filters: Free on at least one of the job's days · Holds every required credential · Show · Clear (n of m shown) | `matches/page.tsx` |
| Columns: Worker · Distance ("under 5 mi · travels up to 25 mi", "about 10 mi · …") · Free on job dates · Required credentials · the job type's rate · Show rate · Verified shifts | `matches/page.tsx`, `src/lib/matches-data.ts` (`distanceBand`, 5-mile bands only) |
| Empty: "Nobody matches yet. Workers appear here when they choose to be found for this kind of work nearby." | `matches/page.tsx:106` |
| "Invite a match": worker select · note (optional, `NOTE_MAX`) · "Send invitation"; or "This job isn't published or doesn't hire by invitation."; footnote on `INVITE_DAYS` and `INVITES_PER_WEEK` | `matches/page.tsx`, `src/lib/engagements.ts:37-45` |

## 5. Invites for a job — `/hiring/[jobId]/invites`

| What | Source |
| --- | --- |
| Eyebrow "Invites"; meta "3 sent · 1 waiting for an answer" | `invites/page.tsx` |
| Intro: invite from the worker's page once they've applied to or worked one of your jobs; lasts 7 days; at most 3 a week; never told whether opened | `invites/page.tsx` |
| One card per invitation: name (link to the person) · stage chip · "Sent Nov 5 by Morgan Lee" · actions · history | `invites/page.tsx` |
| Empty: "No invitations yet" / "Invitations you send for this job appear here." | `invites/page.tsx:48` |

## 6. A candidate — `/hiring/[jobId]/people/[engagementId]`

| What | Source |
| --- | --- |
| Eyebrow "Applicant · <job>"; title = worker; meta "Since Nov 5, 2026"; Applicants (back) · Job page | `people/[engagementId]/page.tsx` |
| Stage chip; actions; Message (hired only); history | same; `src/components/HiringActions.tsx`, `src/components/EngagementHistory.tsx` |
| "For this job": Free on the job's dates (value, "Not set", or Not shared chip); Required credentials (held/missing lines, or Not shared chip) | `people/[engagementId]/page.tsx`, `src/components/staff/NotSharedChip.tsx` |
| Invite composer (relationship exists): job select · note · "Send invitation" · "{n} of 3 invitations left this week for this worker. It lasts 7 days; you aren't told whether they open it."; or "No published job of yours is open to invitations for this worker."; or the weekly-limit notice | `src/components/InviteComposer.tsx:25-49` |
| Scorecard · Availability · Credentials · Experience (or Not shared) · Political fit (each field "Not shared" when withheld, plain text, no colour) | `src/components/OrgProfileSections.tsx`, `src/components/FitSignals.tsx` |
| Profile not open: closed account · invited and unanswered · "Profiles open once Turfcut approves your organization." · no open relationship | `people/[engagementId]/page.tsx:85-93` |
| "When they applied" / "When you invited them": the snapshot, "Exactly what you could see then. It never changes, even if they share less later."; or "No copy was kept for this engagement." | same |

### Actions by stage (organization side)

| Stage | Actions | Source |
| --- | --- | --- |
| Applied | Send offer · Mark in review (once) · Not selected (reason the worker sees + optional note → "Confirm not selected") | `HiringActions.tsx:39`, `src/components/NotSelectedForm.tsx`, reasons `src/lib/engagements.ts:65` |
| In review | as Applied, without Mark in review | `HiringActions.tsx:39` |
| Offer | "Offer sent, waiting on the worker (about 40 hours left to accept)." · Withdraw the offer | `HiringActions.tsx:48` |
| Offer expired | "The offer lapsed before the worker answered." · Send a new offer · Close as not selected | `HiringActions.tsx:48` |
| Invited | "Invitation sent; the worker can answer until Nov 12." · Withdraw invitation (confirm) | `HiringActions.tsx:62` |
| Invitation expired | "The invitation expired unanswered. You can invite them again from their page." (or "…once the job is published.") · Withdraw invitation | `HiringActions.tsx:62` |
| Closed job | only the close-outs; "The job closed before the worker answered." | `HiringActions.tsx` |
| Active / Completed / Declined / Not selected / Withdrawn / Invitation withdrawn | no actions; the chip and history only | `src/lib/engagements.ts:247` (`workerStage`), `src/lib/engagement-labels.ts:10` |

## 7. A worker as an organization sees them — `/workers/[workerId]`

| What | Source |
| --- | --- |
| Guard `requireEmployer`; access via `workerAccessFor` | `workers/[workerId]/page.tsx`, `src/lib/access.ts:164-193` |
| Refusals: "This profile isn't available" + "Workers can only view their own profile." · "No organization on this account." · "Worker hiring profiles are available to owners and recruiters." · "Your organization is awaiting approval." | `workers/[workerId]/page.tsx:25`, `src/lib/access.ts:182-193` |
| Title = display name or "Name not shared"; back to Jobs; invite composer; the same five sections as the candidate page | `workers/[workerId]/page.tsx`, `OrgProfileSections.tsx` |

## 8. The worker's invitations — `/jobs/invitations`

| What | Source |
| --- | --- |
| Worker only (`requireAuth`, else `/jobs`); title "Invitations"; meta on 7 days and no read receipts | `src/app/jobs/invitations/page.tsx` |
| Open invitation card: organization · job (link) · type · dates · pay · the note · "Answer by <local time> (about 3 days left)" · Accept · Decline (confirm) · "Decline and mute <org>" (confirm) | same |
| Expired list: job · "org · expired Nov 2" or "job closed" · Mute | same |
| Muted organizations: "None." or rows with Unmute; link to who you don't want to be matched with | same |
| Empty: "No invitations waiting" / "When an organization invites you, it shows here." | `invitations/page.tsx:49` |

## Questions (would need new data or a decision; not drawn)

1. **Candidate page, "For this job" when the job has no dates or no required credentials:** the section is empty today (both rows are conditional). The mockup shows the section only when it has a row. Keep that, or show "Nothing to compare for this job"?
2. **The live-job edit's final button** reads "Save draft" (`JobForm.tsx:568` keys off `savedId`, not the job's status), and nothing on the steps says autosave is off. The mockup shows "Save changes" and "Changes save when you finish" for a published job. Both are one-line code changes, not data changes; flagged so they aren't taken as today's behaviour.
3. **Invites page:** "Sent … by <name>" shows the sender only when recorded (`sentBy`). Older invitations have none; the mockup shows both forms.
4. **New copy drawn in the mockups** is listed in PLAN.md, question 9. None of it exists in the code.
