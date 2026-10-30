# TurfCut redesign review — 2026-10-30

Reviewed PR #113 at `d40b66399e6d89ac3b6ef5f80406d3e084823ea7` (`redesign/mockup-fidelity`). This is a review and implementation handoff, not a claim that the corrections below are implemented. Requested scope includes screens outside the original twelve-screen board.

## Verdict

Keep the six completed slices and refine them. The palette, Inter hierarchy, photo treatment, worker navigation and removal of unsupported statistics are substantially closer to the founder's concept. The remaining visual mismatch is mostly composition: too much introductory material, oversized summary tiles, wide forms and repeated card containers before the useful rows. Changing only the page wrapper from narrow to wide does not produce the dense, intentional desktop layouts in the concept.

Do not restart the redesign, swap the logo, introduce a new component framework, add schema fields, or copy invented data from the board. Do not describe this audit as visual approval of all routes.

## Authority and material to open first

1. [Original founder concept, preserved in PR #112](https://github.com/whiterican/TurfCut/blob/0de6152eab063028379809a8005ede1dbf7b3cbc/docs/design/hero-board/reference/founder-12-screen-concept-2026-10-28.jpg).
2. [Previous corrective plan](https://github.com/whiterican/TurfCut/blob/0de6152eab063028379809a8005ede1dbf7b3cbc/docs/design/hero-board/CORRECTIVE_PLAN_2026-10-28.md) and [data replacements](https://github.com/whiterican/TurfCut/blob/0de6152eab063028379809a8005ede1dbf7b3cbc/docs/design/hero-board/DATA_REPLACEMENTS.md).
3. Issue #111 and PR #113's recorded later decisions: six worker destinations until Leads exists; mint `#5ED39B` active dock icon/label; derived dark mode; approved interim photo handling. Those later choices supersede conflicting earlier suggestions. Keep the existing logo.
4. [Extended-screen contracts](EXTENDED_SCREEN_CONTRACTS.md) and [route inventory](ROUTE_COVERAGE.csv). New dimensions below are proposed implementation targets, not measurements extracted from the low-resolution composite.

At this reviewed commit, the reference and corrective-plan relative links in `evidence/s1/README.md:4–5` point to files absent from this branch. PR #112 contains them. Bring the approved docs/assets onto the implementation branch or use the immutable links above. Do not make Claude reconstruct the visual authority from a prose summary.

## Findings, in order

### 1. P1 — Job-filtered field totals mix two scopes

Source: `src/app/field/page.tsx:29–46,58–65`.

`rows`, map/turf cards and the polled figures are filtered by `job`. `waiting` uses all organization review candidates, and `heldNow` uses all organization held packets. They appear in the same “Field totals” group even though the source comment says the job filter narrows everything. Selecting Job A can therefore display Job B's review backlog and kept packets alongside Job A's shifts.

Fix the scope explicitly. Preferred: scope the loaders before limits/aggregation, keeping organization authorization. `heldPackets` already accepts `{orgId, jobId}`. `loadReviewCandidates` currently returns no job ID and applies `REVIEW_CAP` at query time; do not filter its capped organization result afterward or filter by non-unique job title. Add an optional job query constraint without changing the schema. An acceptable alternative is to keep organization-wide review/held counts in a separately labelled region outside the job-filtered totals. Preserve the cap's `+` semantics.

Acceptance: two jobs with distinct checked-in shifts, kept packets and pending reviews; selecting either job must show only its scoped figures, or clearly separated “All jobs” figures. Test no filter, unknown job, and enough candidates to hit the cap. Do not weaken tenant checks.

### 2. P2 — Save and share failures are silent

Source: `src/components/JobHeadActions.tsx:30–47,51–71`.

Save discards the `useActionState` result. A returned failure only reverts the icon, with no explanation. Share treats every exception as a cancelled share sheet, including clipboard denial. This makes a polished control feel unreliable.

Keep the action result, announce returned errors in a visible status region with `aria-live`, preserve the prior saved state on failure, and permit retry. Handle unexpected failures consistently with the app's action error pattern. Copy: “Couldn’t save this job. Try again.” / “Couldn’t remove this saved job. Try again.” For share, ignore an actual cancellation (`AbortError`); for other failures expose the link with “Couldn’t share this job. Copy the link below.” Show success only after the operation succeeds. Test server rejection, retry, clipboard denial and cancellation; retain 44px controls and pending disabled state.

### 3. P2 — Turf occupancy can be mistaken for completion

Source: `src/components/staff/TurfCards.tsx:34–46`.

The figure is only “n of m.” During future or ended windows the adjacent caption becomes “Starts” or “Ended,” removing the visible explanation that these are checked-in shifts. The reference has completion percentages, but this implementation deliberately has different data.

Always label the quantity: “{n} of {m} shifts checked in now.” Keep start/end timing separate. Do not rename this “Turf completed” or substitute doors/signatures as a denominator. Preserve text plus the bar and accessible name. Capture future, active and ended turf; include zero totals and multiple jobs sharing turf.

### 4. P2 — Density and hierarchy still drift from the concept

These are visual judgments supported by committed fixture captures, not claims of production-session testing.

| Screen | Evidence | Correction |
|---|---|---|
| Jobs | [s3 phone](../../evidence/s3/jobs-populated-390-light.png) | The current-job region and invitations consume substantial vertical space before listings. Make the current engagement a compact summary row with a clear link; put invitations beside the relevant section heading. Retain pay, date/time, location, organization and truthful planned-state labels. Remove redundant category decoration before shrinking essential text. Aim for three short rows and part of the next at 390px in a defined short-title fixture, rather than promising four rows for every content length. |
| Home | [s2 comparison](../../evidence/s2/side-by-side/home-390-light.png) | The small inline Find Jobs button and generic crop lose the strong photo/CTA composition. Make the phone CTA span the content column, position title/copy/CTA as one group over the lower image, and select a field-work crop that leaves readable negative space. Preserve real public sign-in access and the existing brand; do not add a fake signed-in dock. |
| Field | [s4 desktop](../../evidence/s4/field-populated-1440-light.png) | The masthead, explanatory paragraph and summary tiles defer the map. Place a short header/filter strip above the dominant map; use a compact textual summary or move secondary detail beneath it. Keep the time window and “assigned turf” explanation visible. No worker tracking pins. |
| Members | [s6 desktop](../../evidence/s6/members-populated-1440-light.png) | A workspace-width invite form and large member cards look stretched. Bound the invite form, use aligned desktop member rows and labelled mobile rows, and put extended role help in a disclosure. Keep access limits and destructive-action explanations visible at the action. |
| Credentials | [s6 desktop](../../evidence/s6/credentials-populated-1440-light.png) | A wide outer card for one short empty record creates unused space. Use a compact worker heading plus credential rows, with verification controls attached to the relevant credential. Preserve sharing distinctions and proof-access notice. |
| Pay | [phone](../../evidence/s6/pay-populated-390-light.png), [dark desktop](../../evidence/s6/pay-populated-1440-dark.png) | Four summary tiles plus repeated gaps and pill filters precede the queue. Use a compact summary band; keep the selected queue and its contents together. Style queue filters as a coherent secondary control, not a second floating dock. Do not hide fee disclosure or change payment-state meaning to achieve density. |

The bottom dock is not the main remaining problem. Preserve the current active icon/label without adding a lavender active tile. Separate navigation, state tabs, filters and status badges by behavior and styling; see the extended contract. Do not globally remove the organizer sidebar's selected-row treatment just because the worker dock uses a different selected state.

### 5. P1 release gate — Screenshots do not establish all critical states at this head

Existing evidence is valuable but incomplete. Slice 1 explicitly captures job Apply only. Today evidence does not establish the full live/next/overdue/empty matrix. Slice 5 documents a completed shift and a fixture settings page without the real Supabase account section. These are evidence gaps, not assertions that the missing states fail.

Manifests identify earlier commits: for example s6 lists `d7f140b`, while the slice lands at `d40b663`. If captures were made from an uncommitted worktree, a parent SHA alone does not identify the rendered source. s1 also includes temporary local implementation paths. Record the exact source commit, or base commit plus a reproducible patch hash, and repository-relative image paths. Keep fixtures explicitly synthetic.

Required closing evidence:

- Today: live, next, overdue, none; live plus another overdue action; long job title.
- Job details: apply, applied, offer/hired as supported by real engagement states, unavailable/closed, compliance blocker, mutation error.
- Schedule: upcoming, past, empty; messages list plus real thread, pending/failed send; profile sharing withheld.
- Field: two-job filter, empty turf, future/active/ended, loading/error, permission denied.
- Extra screens: states in the extended contracts, especially payment failure/dispute, credential withholding/expiry, delegated member access and forms with validation errors.
- Light and dark, 390 and 1440 CSS px at 2x for approved captures; targeted 320px, 200% text, keyboard focus and software-keyboard checks. Use existing sunlight rules and verify critical task readability; do not invent a fourth theme.

Do not label a fixture “populated” as evidence that every queue has a visible record: s6 Pay opens an empty To approve queue while Ready to pay has one item. Capture the populated queue itself too.

## Verification performed

At the reviewed source: `npm run typecheck`, `npm run lint`, and `npm test` completed successfully; 112 test files / 958 tests passed. Existing installed dependencies were reused because package lock and Prisma schema did not change versus the prior reviewed checkout. Reviewed source and selected committed screenshots from slices 1–6, including dark Pay. This audit did not run a production build, authenticated production E2E or every route/state. Passing unit checks does not close visual/state coverage gaps.

## Claude implementation sequence

1. Read this review and the founder image. Preserve accepted tokens/navigation and the six existing slices. Resolve the two source-of-truth links.
2. Fix field scope, save/share feedback and turf quantity labels in small commits with focused regression checks. Have a separate Claude reviewer check those changes per CLAUDE.md.
3. Refine Jobs/Field density and one extra-screen exemplar (Members). Render before/after at matching sizes and get the current milestone reviewed before expanding it.
4. Apply the approved patterns from EXTENDED_SCREEN_CONTRACTS.md to the remaining route families. Keep backend actions, permissions, consent, jurisdiction checks and append-only histories intact. No dependencies/schema changes without their required approval.
5. Capture the state matrix against identifiable source, run typecheck/tests/lint, then request visual acceptance. A route inventory or updated wrapper is not proof that a screen is finished.
