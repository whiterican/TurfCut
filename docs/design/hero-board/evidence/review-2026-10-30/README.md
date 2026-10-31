# Review response evidence (#113 review of 2026-10-30)

Answers the design review in PR #114
(`docs/design/hero-board/reviews/2026-10-30/REVIEW.md`), findings 1 to 3 and
the first milestone of finding 4 (Jobs, Field and one exemplar, Members), as
its implementation sequence asks. Everything else in finding 4 and the full
state matrix in finding 5 wait for this milestone's review.

## How these were captured

Real routes in the local preview harness, synthetic fixtures only (the
repo's seed and demo seed in a local database, plus one owner profile, two
notifications and turf on one shift), Inter loaded, clock frozen at
2026-10-30 19:00 UTC, America/Denver, device scale factor 2.
`manifest.json` gives each image's route, role, CSS viewport, theme and its
**source**: the exact commit, whether the tree was clean, and the SHA-256 of
any uncommitted patch. Every capture here was taken from a clean tree: the
before set at 18d2e0b, the 390/1440 after set and the failure states at
5a05280, the 1024/320 set at c0f27dd, and Jobs at 1024 again at 32f5033 (the top bar's
44px icon-only links and its unread count on its own link). The `before-after/` images put the clean-commit
"before" and the "after" side by side at the same size.

## What changed

| Finding | Change | Evidence |
|---|---|---|
| 1 Field filter scope | The job filter is applied inside the review and kept-packet queries, before their caps and inside the organization; the Review queue button keeps the organization's count and says "all jobs" when a filter is on. Tested with a mocked database (`src/lib/field-scope-data.test.ts`) and the known-job rule (`field-turf.test.ts`). | `field-*` |
| 2 Save and share feedback | A failed save keeps the previous state, says "Couldn't save this job. Try again." (or the remove wording), stays retryable and re-announces on a repeated failure; a closed share sheet is ignored; other share failures fall back to the clipboard, then to the link with "Couldn't share this job. Copy the link below."; "Link copied" only after the copy succeeds. | `job-save-failed-390-*`, `job-share-failed-390-*` |
| 3 Turf quantity | Every card reads "n of m shifts checked in now", with Starts / Running / Ended and the hours on their own line; each bar is named for its turf. | `field-*` |
| 4 Jobs | The job you're on is one compact row; Invitations sits beside the Open jobs heading with the real waiting count; the plain category line ("Petition circulation", "Door-to-door canvassing") is dropped, while every campaign disclosure and every In development / Planned status stays. | `jobs-*`, `before-after/jobs-*` |
| 4 Field | One strip above the map: the scope, the live figures in words, the definitions, and the job filter; the map comes straight after. | `field-*`, `before-after/field-*` |
| 4 Members (exemplar) | A bounded invite panel with role help in "About roles"; "Waiting to join" always present ("No invitations waiting."); aligned rows from 1024 (member, role, actions) with a fixed action column; stacked and labelled on a phone; every permission branch and the removal explanation unchanged. | `members-*`, `before-after/members-*` |
| Overflow found while checking | The worker's top bar ran 96px past a 1024px window (icon-only 44px links from 1024 to 1279 now, labels from 1280; the Messages unread count now sits on its own link), and a job row's screen-reader label escaped its clipped line at 320px. Both pre-date this milestone; fixed in their own commit. | `*-1024-light.png`, `*-320-light.png` |
| 5 Provenance | Manifests now record the exact commit, clean flag and patch hash, with file names relative to this folder; the s1 README's dead links point at PR #112's pinned commit. | this folder |

## Not shown here, honestly

- The two-job filter is covered by query tests, not a capture: the fixture
  organization has one job in the window.
- The demo job titles are long, so the 390 Jobs capture shows two rows and
  part of the third, not three short ones.
- The state matrix of finding 5 (Today, job engagement, schedule, messages,
  field states, permission denied) is not captured yet.
