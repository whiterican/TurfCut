# Core hiring flow: plan and mockups for review (2026-11-05)

The family Caden asked for in #123, built to Astra's five constraints there and revised for her review of #126. Today's pages are in `current/` (40 captures from a local test database at master `8b1a80f`, every one listed in `current/manifest.json` with its route, role, width, height, overflow and console errors; none has horizontal overflow or console errors). The one new-job state with a saved draft (`builder-new-saved`) draws the Aurora draft's own step 1, the only saved draft in the fixtures. `MAP.md` gives the source line for every field, action, state and line of copy the mockups draw. `COVERAGE.md` is the index of every proposed state, width and theme, and of the screens that reuse an existing capture.

**What this family changes:** page structure and grouping. Not the builder's six steps or where publishing happens, not a word of policy copy, not the data model, not a dependency. Where a mockup would need a change the code doesn't support today, it is listed under Questions, never drawn as a promise.

## How the mockups are made

They are not drawings. Each frame is the app's own markup on the app's own stylesheet:

- `src/app/app.css` is the compiled stylesheet of the local build at `8b1a80f`, with the Inter files it loads in `src/media/`. Every token, class, radius, status tone, dark value and focus ring is the shipped one; `src/proposed.css` holds the only new rules (a scrolling step track, the problem summary, the share rows, the blocker groups, the desktop builder columns: about 70 lines, all on existing tokens).
- `src/parts/` are fragments harvested from the running app (the header, the dock, the organization rail, the step fieldsets, the scorecard panel, the applicants table, the job head, the no-access page), so the retained structures are the real ones, at their real heights.
- `src/gen/frames.mjs` composes each proposed state from those fragments plus the proposed markup; `src/gen/build.mjs` renders every frame at 390×844 and 1440×900, light and dark (`.dark` on `<html>`, as the app does), DPR 2, full content height, and writes `mockups-manifest.json` with two commits (the app build the stylesheet and parts come from, `8b1a80f`; the generator's own), viewport, theme, content height, a clipping check that names each element whose content is wider than its hidden-overflow box (visually-hidden elements excluded) and whether Inter was loaded before the capture. The frames themselves are in `src/frames/` and open in a browser.
- Clean renders carry only the 20px "MOCKUP · synthetic data" bar at the top (counted in the content height). The design notes are a separate render, `annotated/<frame>-390-light.png`, with the notes under the page, never over it.

Recipe: `PLAYWRIGHT_PATH=<a playwright install> node docs/design/hero-board/mockups/hiring-2026-11-05/src/gen/build.mjs` from the repository root, then `node …/src/gen/coverage.mjs`. Playwright is a tool here, not a dependency of the app.

## What's wrong today

| Screen | Problem | Contract (#114) |
| --- | --- | --- |
| Builder, phone | The six step chips wrap into three rows (about 170px) before the form starts, on every step. The save status, the step heading and the blurb follow, so the first field is 900px down on a phone. Next is a short button on the left. | Reading/form: single column, primary action fits the content column. Page state tabs: "one compact shared track". |
| Builder, phone, errors | The inline errors are right (after each field, with `aria-invalid`), but the only summary is "Fix the highlighted fields." under Next, at the bottom, where a phone can't see it while the field is on screen. | "Blocking validation near the field and in a focusable summary." |
| Builder, desktop | The form runs the full content width (about 1,100px) with two columns of fields. | Reading/form: main form max-width 680px. |
| Builder, live job | The eyebrow says "Edit published job" and the notice is right, but nothing on the steps says autosave is off, and the final button still reads "Save draft". | Show new draft, saved draft and published-job edit separately where their controls differ (#123, 1). |
| Job page, draft | "This job can't publish yet" lists every blocker as one flat list, mixing what organization settings fix with what the builder fixes and what counsel fixes; one link for everything. For the same never-approved profile two bullets appear. | Separate reasons and authorized recovery destinations (#123, 4). |
| Candidate page, phone | 2,943px for an applicant who shares nothing: the Not shared chip appears 12 times across five section cards, the scorecard draws four empty tiles plus "The math behind every number", then the snapshot repeats the political-fit block. The next action is inside the stage card below the head. | Record/ledger: title, status, action, key facts in aligned rows, then history. Keep the primary next action adjacent to the person. |
| Worker as an organization sees them, phone | 3,615px: the same five sections, each its own card stack; the invite composer above the scorecard. | Record/ledger. |
| Applicants, phone | Already a stacked table (#116). The bulk-action card shows above the table even with nothing selected, and the table says "not shared" where every other screen says "Not shared". | Keep (#123, 5); two small revisions. |
| Pipeline, Matches, Invites, Invitations (worker) | On the template, stacked on a phone, real counts, correct refusals and empty states. Nothing to change beyond what the shared pieces above bring. | Keep; reuse the SHA-pinned captures (COVERAGE.md). |

## 1. Builder (`builder-*`)

The six steps, the fields, the validator and the autosave are unchanged (`src/lib/job-builder.ts`, `JobForm.tsx`). The builder saves drafts; it never publishes. What changes:

- **One step track** (`proposed.css` §1): the same six `<button class="step">`s in one row. On a phone the row scrolls sideways; the current step is scrolled into view on load and on each change; the last step is reachable by scrolling or by Tab. From 64rem the row wraps, as today. The buttons keep today's semantics and styles: `aria-current="step"` and `.step-current` on the current one, `.step-done` on the steps already reached, `aria-disabled="true"` on steps not yet reached (plain, in the tab order, announced as unavailable, as today; pressing one does nothing, as today), the app's focus ring. Nothing is dimmed.
- **Save status under the track**, one line, words from `saveWords` unchanged: idle, "Saving draft…", "Draft saved 3:14 PM · 3 fields wait for a fix", "Couldn't save: couldn't reach Turfcut; it'll try again after your next change." Each is a frame.
- **A focusable problem summary under the step heading** (§2) whenever the step has errors: "2 things to fix on this step" and one link per problem that focuses its field; focus moves to the summary after a failed Next. The inline errors stay where they are, the entered values stay in their fields, and today's "Fix the highlighted fields." stays under Next. Jumping ahead still stops at the first step that fails.
- **Phone:** one column; "Next: When and where" full width, Back beside it from step 2. **Desktop:** the form in a 680px column (§3); a side note is optional new copy (question 9).
- **Review:** every row the Review draws today, grouped under the six step titles, each with "Change"; the footnote word for word. The live job's review reads its harvested values (both hiring modes: "Workers apply, We invite workers").
- **Live job:** the "This job is live…" notice above the track; the save line reads "Changes save when you finish." and the final button "Save changes" (both new, question 2). A closed job keeps today's refusal. No access: today's page with the notice.

Hit areas, measured in the rendered frames: `.btn-sm` action buttons are 36px tall (`min-h-9`; the header's round icon buttons are 40px by their own rule, `globals.css` "40px pin"), `.filter-chip` 36px, `.step` 26px (`py-1 text-xs`, no minimum height). The mockups inherit all three. Every one is below the #114 44px line today, in the app, not only here; it is question 10.

## 2. Publishing on the job page (`publishing-*`)

Publishing stays on the job page, in the "Publishing" section that a draft or paused job shows to its organization. `publishBlockers`' reasons, words unchanged, are grouped by who can fix them (§5):

| Group | Reasons | Destination |
| --- | --- | --- |
| In this job | Set the gross pay rate · Set the headcount · Set the start and end dates · The end date is before the start date · The job's end date has passed · Disclose the campaign's type, affiliation and message · Name who handles emergencies, disputes and lost materials · Pick at least one way to hire · Add at least one staging point, or switch the job to self-launch · the state mismatch · the compensation method the rules don't allow | The "Edit draft" button under the section (`canEdit`), as today; the group has no link of its own. Each reason's step label needs a reason-to-step mapping (question 3). |
| In organization settings | Your organization is awaiting Turfcut approval · Sign the contractor terms in organization settings · Complete the worker-classification review in organization settings | "Organization settings" only for a member who can open it (`canReadSettings`); otherwise the reasons with no link, as today. |
| With counsel | the jurisdiction's problems | No link; "Turfcut staff approve rule profiles." (new, question 4). |

Frames: blocked in all three groups with the link (a composite: the Aurora draft's head with every group's reasons; no fixture is blocked in all three, and the real draft page shows four bullets, none about staging); the same for a viewer with neither settings nor edit access (reasons only, no buttons); the jurisdiction alone; every check passes; a published job frozen under newer rules. Publish stays disabled while any group has a reason.

## 3. A candidate (`candidate-*`)

1. **Head:** eyebrow, name, "Since …" with the stage chip beside it (`StatusBadge`, unchanged), the stage's actions under the title (words and rules from `HiringActions.tsx`), Applicants and Job page.
2. **For this job:** the two rows, each a value, "Not set", or the Not shared chip. Hidden when the job gives nothing to compare (question 1).
3. **History:** the engagement's events as today, in the reading order at every width.
4. **What they share with you now** (§4): one card, one row per part. A part the worker shares shows its summary (the scorecard's summary is composed from its own visible tiles only; a withheld tile never counts as zero) and opens to the unchanged panel (`ScorecardPanel` is rendered in full, expanded, in `candidate-offer`, `candidate-hired` and `worker-shared`). A part that is withheld is one row with the app's Not shared chip and nothing else. A part that is empty says its empty words ("No credentials added."). Political fit: when every field is withheld, one row "Not shared" with the not-shared basis sentence; when any field is shared, the row says "2 of 4 fields shared" and opens to all four fields and the app's shared-basis sentence (`political-fit.ts:602`), as `FitSignals` draws them (`candidate-mixed`). **The partial-sharing frames are synthetic:** no fixture shares part of a profile, so `candidate-mixed` and `worker-name-not-shared` put Riley's real, empty scorecard beside two invented fit answers ("Union member", "Housing, transit"); they show the shape, not a person.
5. **Invite to a job:** `InviteComposer`'s own form and words, or its "no published job" line, after the profile.
6. **When they applied / When you invited them:** the snapshot under a disclosure whose summary carries the date (question 5); its words unchanged inside.
7. **Profile not open:** the notices unchanged, in place of 2 and 4.

Frames: nothing shared; partial sharing (synthetic); offer out; offer expired; invited (profile not open); invitation expired; hired (Message); not selected; an action that failed (the action's own message under the buttons, `text-danger-msg`).

## 4. A worker as an organization sees them (`worker-*`)

The same shared-profile card, the invite composer after it, the refusals unchanged. Frames: shared (scorecard expanded); nothing shared (Casey applied to the only published job, so `InviteComposer` refuses, `InviteComposer.tsx:21`); name not shared with partial sharing (synthetic, the composer open); the "awaiting approval" refusal.

## 5. Applicants (`applicants-*`), and the screens kept as they are

- The bulk form is one line, "0 selected", until a row is ticked; then today's form. The table reads "Not shared" (question 6). Tabs stay `filter-chip` links with `aria-current="page"` and the app's `--tab-active-bg`; the inspector stays from 1280. Frames: none selected; one selected; nobody applied; filters match nobody; the inspector at 1440.
- Pipeline, Matches, Invites and the worker's Invitations are kept as they are and listed in `COVERAGE.md` against their `current/` captures at `8b1a80f`.

## States to capture when built

Every frame in `COVERAGE.md`, at the same widths and themes, plus the live interaction the static frames can't show: the track scrolling as the step changes, focus landing on the problem summary, a bulk form opening when a row is ticked, a share row opening.

## Questions for review

1. **"For this job" with nothing to compare.** Both rows are conditional today; the mockup hides the section then. Keep that, or show "Nothing to compare for this job"? (Astra: hide it.)
2. **Live-job wording.** "Save changes" and "Changes save when you finish." are new words; one-line code changes each. (Astra: clearer.)
3. **Step labels on blockers, and landing on the step.** `publishBlockers` returns flat sentences; the labels need a reason-to-step mapping and landing there needs `?step=`: two small code changes, no data change. Without them the group is one list under Edit draft. (Astra: a proposed implementation change, not current behaviour.)
4. **The counsel sentence.** "Turfcut staff approve rule profiles." is new copy. Alternative: the reasons with no sentence.
5. **Folding the snapshot.** It is consented history; folded, its date stays visible and its words are unchanged inside. (Astra: reasonable if fully accessible.)
6. **"not shared" → "Not shared"** in the applicants table.
7. **Two bullets for one never-approved profile.** `jurisdictionProblems` reports "hasn't been approved" and "superseded" for a profile that was never current. The mockups show one bullet per cause; the fix is a separately reviewed behavioural change, never a hidden blocker (Astra).
8. **Order of build.** Builder (with the publishing groups), then the candidate and worker pages, then the Applicants revisions: one reviewed slice each, with evidence, after approval.
9. **New copy in the mockups, none of it promised:** "What they share with you now" and its hint; the scorecard row's summary line; "2 things to fix on this step"; "n of 4 fields shared"; the optional desktop side note; "0 selected"; the counsel sentence (4); the live-job words (2).
10. **Small hit areas are the app's today:** measured, `.btn-sm` 36px, `.filter-chip` 36px, `.step` 26px, against #114's 44px line (the 40px Astra cited is the header's round icon buttons, which have their own rule). The step track is this family's centrepiece and its buttons are the smallest. Raise them in the app (a minimum height each), or keep them and record the exception? (Astra: reconcile 44 vs 40; it is 44 vs 36 for the actions and 44 vs 26 for the steps.)
