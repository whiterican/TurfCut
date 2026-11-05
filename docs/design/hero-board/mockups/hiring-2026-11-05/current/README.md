# Today's pages: the core hiring flow (master `2aed8c3`, 2026-11-05)

Captured from a local dev server on a clean tree against a local test database, full page at DPR 2, light theme, America/Denver. `manifest.json` lists each capture with its route, role, width, page height, horizontal overflow (0 for all) and console errors (0 for all).

## Fixtures

Everything is synthetic and exists only in the local test database. It was made through the app's own forms (sign-up, Who sees what, the builder, the hiring actions, the staff jurisdiction form), with two exceptions noted below.

| Who | State |
| --- | --- |
| Pass Test Org (Dana Field, owner) | Approved, terms signed, classification reviewed. One published canvass job, "Pass test canvass 390" (Denver, $24/hr, 5 spots, hires by application and, since today, by invitation). One draft, "Aurora door knock, November", filed under an unapproved profile. |
| Second Pass Org (owner2) | Not approved. One draft, "Second Pass canvass", made today from step 1. |
| Jordan Blake | Hired on the published job (Active); shares with organizations they have a relationship with; two verified shifts of tens of seconds each, so the rates are not representative. |
| Riley Chen | Applied, marked in review. |
| Morgan Diaz | Applied, offer sent. |
| Alex Rivera | Applied, offer sent (a second offer out). |
| Casey Nguyen | Applied. Shares nothing: availability, credentials and hours and history set to "Nobody"; political fit never set. The withheld case. |
| Taylor Brooks | Applied, then not selected ("Availability doesn't fit the job's dates"). |
| Sam Torres | Findable for canvass work from Denver; invited from Matches with a note; unanswered. |
| Devon Park | Findable; invited from Matches. **Exception:** the invitation's `inviteExpiresAt` was set to yesterday by SQL so the expired state could be captured without waiting seven days (`Engagement` is not an append-only table). |
| Jamie Okafor | Findable for canvass work from Aurora, 30 miles; not applied or invited, so the one row on Matches. |
| Pat Staff | Turfcut staff. Proposed a "Boulder, CO" rule profile that was never approved. |
| finance@fp.test | A finance member of Pass Test Org: no `jobsEdit`, no hiring. The no-access captures. |

Not captured, and why:

- **An expired offer.** It needs an offer older than 48 hours. `EngagementEvent` is append-only (the database refuses the update), so the state can't be made without waiting. The mockup draws it from `HiringActions.tsx:48`.
- **A closed account, a withdrawn application, a closed job's candidate.** Not made; each is one notice, listed in `MAP.md`.

## Captures

| Capture | Shows |
| --- | --- |
| `builder-new-*` | A new job, step 1, both widths. |
| `builder-new-validation-*` | Next pressed with nothing entered: inline errors and "Fix the highlighted fields." |
| `builder-edit-draft-*` | A saved draft: every step open, autosave on. |
| `builder-edit-draft-review-390` | Jumping to Review stops on step 4, whose contacts are missing. |
| `builder-edit-published-*` | The live job: "Edit published job", the notice, autosave off. |
| `builder-no-access-390` | The finance member sent to the Overview with the no-access notice. |
| `job-draft-blocked-*` | The draft's job page: "This job can't publish yet", a flat list mixing the jurisdiction, settings and builder reasons, one "Organization settings" link, Publish disabled. |
| `job-draft-unapproved-org-390` | The unapproved organization's draft: approval, terms and classification among the reasons. |
| `hiring-overview-*` | Pipeline: the band and the stacked table. |
| `applicants-*`, `applicants-inspector-1440`, `applicants-filters-390` | Six applicants at every stage; the inspector; filters open with "Showing n of m". |
| `matches-*` | One match (Jamie), the distance band, "not shared" cells, "Invite a match". |
| `invites-*` | Two invitations: expired (Devon) and waiting (Sam, with the note). |
| `candidate-applied-withheld-*` | Casey: Not shared everywhere, political fit "Not shared" as plain text; the snapshot repeats it. |
| `candidate-in-review-390`, `candidate-offer-390`, `candidate-offer-second-390`, `candidate-not-selected-390`, `candidate-invited-unanswered-390`, `candidate-invitation-expired-390`, `candidate-hired-390` | One capture per stage. |
| `worker-shared-*`, `worker-withheld-390` | A worker as the organization sees them: Jordan (shared), Casey (withheld). |
| `worker-denied-finance-390`, `worker-denied-unapproved-390` | The finance member (sent home); the unapproved organization ("Your organization is awaiting approval."). |
| `worker-invitations-*`, `worker-invitations-empty-390` | Sam's invitation with the note and deadline; Riley's empty page. |
