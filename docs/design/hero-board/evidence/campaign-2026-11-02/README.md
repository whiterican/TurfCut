# Campaign and public pages (#116, 2026-11-02)

This is the campaign slice built from the design direction approved at `31c2208` (plan and mockups in `../../mockups/campaign-2026-11-02/`).

Every capture is from commit `efeecc5` with a clean tree (`manifest.json`). Captures are full page at DPR 2, with the browser clock frozen at 2026-10-30T19:00:00Z in America/Denver. None has horizontal overflow.

## Fixtures

The fixtures are synthetic and exist only in the local preview database.

| Campaign | What it covers |
| --- | --- |
| `mile_high_fixture` | Header photo (a licensed stand-in from `public/photos`), one talking point, three posts (one embedding a job, one long), and two linked published jobs. Worker Alex Rivera follows it. |
| `front_range_fixture` | 22 short posts, so there is a second page, plus a talking point dated before all of them (the pinned-past-page-one case). One linked job. |
| `plain_fixture` | No header photo, no posts, no jobs and no resources. |

## Captures

| Capture | Who | What it shows |
| --- | --- | --- |
| `campaign-public-signed-out-*` | Signed out | Follow is the primary action, then Copy link. Hiring now sits in the side column at 1440 and before the talking points at 390. The talking point appears once, and the posts share one surface with only their time. Light and dark. |
| `campaign-worker-following-*` | Worker who follows it | Following, Notices off, Copy link, Like on each post, and the production dock. Light at both widths; dark at 390. |
| `campaign-org-organization-login-390-light` | Organization owner | No Follow control (following is for workers); Copy link only. |
| `campaign-plain-no-photo-empty-*` | Signed out | A short band instead of a photo, under the avatar. The side column is gone (nothing to show), and "No posts yet." |
| `campaign-paged-page-one-390-light` | Signed out | Page one: Hiring now, the old talking point once, 20 posts, then Older posts. |
| `campaign-paged2-older-posts-390-light` | Signed out | The second page: "Older posts", the last two posts, a link back to Latest posts, and the talking point not repeated. |
| `campaign-post-post-with-job-*` | Signed out | A single post: the campaign's identity line, the post at reading size, the live job with "View job", and More from the campaign. Light and dark. |
| `feed-populated-390-light` | Worker | The mixed feed keeps each post's campaign name and its order. |
| `campaign-mockup-vs-built-*` | | The approved mockup beside the built page at the same width. |

To keep this folder small, the 1440 captures that only repeat what another capture already shows were dropped: organization login, both pagination pages, the feed, and worker dark.

## Applied from the approval

1. **Hiring now:** `listHiringJobs` uses the directory's rule and cutoff (published, `endsAt` null or after `openJobsEndAfter(now)`), scoped to this campaign and its organization. It returns at most 20 rows, newest published first.
   - Each row shows the real pay unit and a quiet "View job". The job page runs the application.
   - Acceptance tests (s3) cover two campaigns in one organization, paused, closed and ended jobs, a job with no end date, and agreement with the directory's count.
2. **Talking points once:** `loadPosts(..., { excludePinned: true })` leaves pinned posts out in the query, so Older posts never repeats them.
   - Acceptance tests (s1) cover a pinned-only campaign and a pinned post older than page one.
   - Each talking point keeps its permalink, sharing, Like and facts.
   - The feed and the management page keep the attributed card unchanged.
3. **Layout:** the desktop side column holds jobs and public resources, and disappears when both are empty.
   - On a phone it is one column: header, Hiring now (3 shown, the rest under "Show N more jobs"), resources, talking points, posts.
   - The production dock is used for signed-in users. There are no mockup notes on the real screens.
   - Jobs keeps Open jobs and Invitations (unchanged).

## Deliberate differences from the mockup

- **Posts show the full text, not a truncation:** there is no "Read more" control, so none is implied.
- **No "sources" count on the talking point:** the facts fold under it as before, and only when the campaign added some.
- **No "Shared with everyone" line on resources:** the public page only ever lists public resources.
- **The embedded job keeps its date and affiliation chips:** these are the existing job grammar. The mockup's simpler row is used for Hiring now.

## Not covered here

- **An invalid header image:** the upload checks reject it, so the page never receives one, and no fixture can show it.
- **A failed follow:** the existing inline status message, unchanged in this slice.
