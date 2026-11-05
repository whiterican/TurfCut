# Core hiring flow: plan and mockups for review (2026-11-05)

The family Caden asked for in #123, built to Astra's five constraints there. Today's pages are in `current/` (43 captures from a local test database at master `2aed8c3`, listed in `current/manifest.json`; none has horizontal overflow or console errors). The mockups are rendered from the HTML in `src/` on the design tokens' values (`base.css`, the same file as the profile and settings family, with the dark values from `DARK_MODE.md`). Every frame is labelled "MOCKUP · synthetic data". `MAP.md` gives the source line for every field, action, state and line of copy the mockups draw.

**What this family changes:** page structure and grouping. Not the builder's six steps or where publishing happens, not a word of policy copy, not the data model, not a dependency. Where a mockup would need a change the code doesn't support today, it is listed under Questions, never drawn as a promise.

## What's wrong today

| Screen | Problem | Contract (#114) |
| --- | --- | --- |
| Builder, phone | The six step chips wrap into three rows (about 170px) before the form starts, on every step. The save status, the step heading and the blurb follow, so the first field is 900px down on a phone. Next is a short button on the left; on the review it becomes "Save draft". | Reading/form: single column, 14px field gaps, primary action fits the content column. Page state tabs: "one compact shared track". |
| Builder, phone, errors | The inline errors are right (after each field, with `aria-invalid`), but the only summary is "Fix the highlighted fields." under Next, at the bottom, where a phone can't see it while the field is on screen. | "Blocking validation near the field and in a focusable summary." |
| Builder, desktop | The form runs the full content width (about 1,100px) with two columns of fields; the step chips sit in one row. | Reading/form: main form max-width 680px; related help beside it only when useful. |
| Builder, live job | The eyebrow says "Edit published job" and the notice is right; but nothing on the steps says autosave is off, and the final button still reads "Save draft". | Show new draft, saved draft and published-job edit separately where their controls differ (#123, 1). |
| Job page, draft | "This job can't publish yet" lists every blocker as one flat list, mixing what organization settings fix (approval, terms, classification) with what the builder fixes (dates, disclosure, contacts) and what counsel fixes (the jurisdiction). One link, "Organization settings", for everything; the builder blockers don't say which step. For the same never-approved profile two bullets appear ("hasn't been approved by counsel" and "has been superseded by a newer version"). | Separate reasons and authorized recovery destinations (#123, 4). |
| Candidate page, phone | 2,943px for an applicant who shares nothing (Casey): the Not shared chip appears 12 times across five section cards, the scorecard draws four empty tiles plus "The math behind every number" with one withheld line, then the snapshot repeats the political-fit block. The next action is inside the stage card below the fold of the head. 3,680px for an applicant with an offer out; 4,936px for one with a scorecard. | Record/ledger: title, status, action, key facts in aligned rows, then history. Keep the primary next action adjacent to the person. |
| Worker as an organization sees them, phone | 3,615px: the same five sections, each its own card stack; the invite composer sits above the scorecard whether or not an invitation is possible. | Record/ledger. |
| Applicants, phone | Already a stacked table (#116). The bulk-action card ("For the selected applicants") shows above the table even with nothing selected, and the table says "not shared" in lower case where every other screen says "Not shared". | Keep (#123, 5); two small revisions. |
| Pipeline, Matches, Invites, Invitations (worker) | On the template, stacked on a phone, real counts, correct refusals and empty states. Nothing to change in this family beyond the shared head treatment. | Keep. |

## 1. Builder — `builder-390.png`, `builder-1440.png`, `builder-review-390.png`, `builder-live-390.png`

The six steps, the fields, the validator and the autosave are unchanged (`src/lib/job-builder.ts`, `JobForm.tsx`). The builder saves drafts; it never publishes. What changes:

- **One step track.** The chips become one row: the current step in eggplant, done steps plain, unreached steps quiet and `aria-disabled`, scrolling sideways on a phone with the current step kept in view and the last step reachable. Same `<ol aria-label="Steps">`, same `aria-current="step"`. Under it, "Step 1 of 6" stays as the step heading.
- **Save status beside the track**, one line: "Your draft saves as you go." / "Draft saved 3:14 PM · 2 fields wait for a fix" / "Not saved yet: …" / "Couldn't save: …". Words from `saveWords` unchanged.
- **A focusable problem summary under the step heading** whenever the step has errors: "3 things to fix on this step", each a link that focuses its field. The inline errors stay where they are. Today's "Fix the highlighted fields." moves up into that summary; it is the same message. Jumping ahead still stops at the first step that fails.
- **Phone:** single column, 14px between fields, 28px between groups. "Next: When and where" full width; Back under it as a ghost link. On the review, "Create draft" / "Save draft" full width.
- **Desktop:** the form in a 680px column; the step track above it; a quiet side note (320px) that says what this step feeds ("Workers see the title, type and description on the job card. The rule profile decides which checks the job must pass.") drawn from the step's existing blurb and the job card, no new copy promised beyond what's in `MAP.md`.
- **Review:** the same rows with "Change" per row, grouped under the six step titles so a long review reads in the order it was entered; the footnote stays word for word: "Saved as a draft. You publish it from the job page once every check passes, including the jurisdiction's rules."
- **Live job:** eyebrow "Edit published job"; the "This job is live…" notice unchanged above the track; the save line reads "Changes save when you finish" (new words, see Questions 2) instead of autosave; the final button reads "Save changes" (Questions 2). A closed job keeps today's refusal.
- **No access:** unchanged: the member lands on their home with the no-access notice.

## 2. Publishing on the job page — `job-publishing-390.png`

Publishing stays on the job page (`/jobs/[jobId]`), in the "Publishing" section a draft or paused job shows its organization. What changes is the grouping of `publishBlockers`' reasons by who can fix them, each group with its own destination, shown only to a member who can open it:

| Group | Reasons (words unchanged) | Destination |
| --- | --- | --- |
| In this job | Set the gross pay rate · Set the headcount · Set the start and end dates · The end date is before the start date · The job's end date has passed · Disclose the campaign's type, affiliation and message · Name who handles emergencies, disputes and lost materials · Pick at least one way to hire · the launch problem · the state mismatch · the compensation method the rules don't allow | "Edit draft" (`canEdit`), which opens the builder. The mockup labels each reason with its step ("Step 3 · Pay and hiring"); see Questions 3 for landing on that step. |
| In organization settings | Your organization is awaiting Turfcut approval · Sign the contractor terms in organization settings · Complete the worker-classification review in organization settings | "Organization settings" (`canReadSettings` only; otherwise the reason is listed with no link, as today) |
| With counsel | the jurisdiction's problems (not approved, expired, superseded, not yet effective) | No link: nothing in the organization fixes it. The sentence says who does: "Turfcut staff approve rule profiles." (new words, Questions 4) |

"Every check passes. Publishing re-runs them at that moment." and the Publish button are unchanged. Publish stays disabled while any group has a reason.

## 3. A candidate — `candidate-390.png`, `candidate-1440.png`, `candidate-offer-390.png`

Record/ledger order, with the next action beside the person:

1. **Head:** eyebrow "Applicant · <job>", name, "Since Nov 5, 2026", the stage chip in the head, and the stage's actions right under it (Send offer · Mark in review · Not selected; or the offer line and Withdraw the offer; or the invitation line and Withdraw invitation). Words and rules from `HiringActions.tsx`. Applicants and Job page links stay.
2. **For this job:** the two rows (Free on the job's dates · Required credentials), each a value, "Not set", or the Not shared chip. Shown only when the job gives it something to compare (Questions 1).
3. **History:** the engagement's events, one line each, as today.
4. **What they share with you now:** the five sections in one card as aligned rows, each row the section's summary and a disclosure for the detail:
   - Scorecard: "2 verified shifts · 100% show rate · 80 doors" or one row "Not shared" when every part is withheld. The tiles, "The math behind every number" and "Recent activity" open under it (`ScorecardPanel` unchanged inside).
   - Availability, Credentials, Experience: the same line each ("No availability set yet." / "No credentials added." / "No experience yet" / Not shared).
   - Political fit: the four fields as today (plain "Not shared", no colour, no chip) and the basis line.
   A section that is withheld is one row that says "Not shared" and nothing else: no explanation, no colour, no ordering. A section that is empty says its empty words ("No credentials added."). The two never look alike.
5. **Invite to a job:** the composer, or "No published job of yours is open to invitations for this worker." as today, after the profile rather than before it.
6. **When they applied:** the snapshot under a disclosure whose summary carries the date ("When they applied · Nov 5, 2026, 14 min ago"), closed by default; its lead sentence stays inside. See Questions 5.
7. **Profile not open:** the four notices unchanged, in place of 2 and 4.

The withheld case is `current/candidate-applied-withheld-*` (Casey): nothing shared, political fit never set. The mockup shows it at both widths.

## 4. A worker as an organization sees them — `worker-390.png`

The same shared-profile card as 3.4, with the invite composer after it. The refusal states are unchanged (`workers/[workerId]/page.tsx:25`, `src/lib/access.ts`). The mockup shows Jordan (shares with the organization, two verified shifts) and the Not shared summary row for a withheld section.

## 5. Pipeline, Applicants, Matches, Invites — confirmed, two revisions on Applicants (`applicants-390.png`)

- The bulk-action card becomes one line under the tabs, "0 selected", that grows into the form once a row is checked. Same `select`, same actions.
- The table's "not shared" cell reads "Not shared", the same words as the chip everywhere else (Questions 6).
- Tabs stay links with `aria-current="page"`, counts stay real, the inspector stays at 1280 and above. Pipeline, Matches and Invites are drawn as they are, in `current/`.

## 6. The worker's invitations — `/jobs/invitations`, confirmed

Its own page, its own words (organization, job, dates, pay, the note, "Answer by …", Accept · Decline · Decline and mute). Unchanged. `current/worker-invitations-*`.

## States to capture when built

- **Builder:** new (step 1), validation on a step, draft saved, "fields wait for a fix", couldn't save, review, editing a saved draft, editing a live job, closed job, no access. 390 and 1440, light and dark.
- **Job page, publishing:** blocked in this job only; blocked in settings with the link; blocked in settings without the link (a role without settings access); blocked by the jurisdiction; every check passes; frozen live job.
- **Candidate:** applied, in review, offer, offer expired, invited, invitation expired, not selected, withdrawn, hired (with Message), closed account, unapproved organization, no open relationship; shared and withheld profile; job without dates; snapshot present and absent.
- **Worker page:** shared, withheld, name not shared, each refusal.
- **Applicants:** none, some, filtered to none, one selected (bulk form open), inspector open.

## Questions for review

1. **"For this job" with nothing to compare.** Both rows are conditional today, so a job without dates and without required credentials shows an empty section. The mockup hides the section then. Keep that, or show "Nothing to compare for this job"?
2. **Live-job wording.** The final button reads "Save draft" on a published job (`JobForm.tsx:568` keys off whether the job is saved, not its status), and nothing says autosave is off. The mockup shows "Save changes" and "Changes save when you finish". Both are new words; a one-line code change each.
3. **Landing on a step from a blocker.** The builder opens on step 1 (or on the first step with a server error). Linking "Set the headcount" to step 3 needs the builder to read a `?step=` parameter: a small code change, no data change. Without it, the labels still say which step.
4. **The counsel sentence.** "Turfcut staff approve rule profiles." is new copy for the jurisdiction group. Alternative: no sentence, just the reasons with no link.
5. **Folding the snapshot.** "When they applied" is consented history ("Exactly what you could see then"). Folding it by default makes the page a third shorter but hides it behind a tap. The date stays visible in the summary either way.
6. **"not shared" → "Not shared"** in the applicants table: a capital letter, so the table matches the chip. Trivial, but it is copy.
7. **Two bullets for one never-approved profile.** `jurisdictionProblems` reports both "hasn't been approved" and "has been superseded" for a profile that was never current (Boulder in `current/job-draft-blocked-*`). The mockup shows one bullet per cause. The fix is in the check, not the design; flagged so the mockup isn't read as today's behaviour.
8. **Order of build.** Builder (including the publishing groups), then the candidate and worker pages, then the two Applicants revisions: one reviewed slice each, with evidence, after approval.
