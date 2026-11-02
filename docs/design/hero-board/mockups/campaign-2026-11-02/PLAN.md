# Campaign and public pages: plan and mockups for review (2026-11-02)

These are mockups for review before building, not an implementation. They extend the **Editorial** pattern in the #114 contracts ("photo/title/brief context, then posts/jobs; bounded text measure, no KPI wall"). Each PNG is rendered from the HTML in `src/`, on the design tokens' values, and every frame is labelled "MOCKUP · synthetic data". The data follows the local preview fixture: Mile High Civic Works, its two published jobs, and four synthetic posts, one of them a talking point.

`current/` holds the pages as they are today, captured at `09bf839`. That commit fixed a real phone bug: the header's action buttons used to wrap onto the photo.

## 1. Public campaign page: `campaign-390.png`, `campaign-1440.png`
Route `/c/[handle]`. Data from `loadPublicCampaign`, `loadPinned`, `loadPosts`, `loadFacts` and `listResources`.

- **Hero:** the campaign's own header photo, or the plain surface when there is none. Then the avatar or initials, the name as the page heading, the handle, and "Verified" (Turfcut's one label, shown only when staff verified the profile). Then the bio on a bounded measure.
- **Actions:** Follow is the primary action for a signed-in worker. A guest gets the same button, which leads to sign-in, as today. An organization login sees no Follow. Copy link is a quiet secondary action.
- **Hiring now:** see open question 1. On desktop it sits in a 320px side column, with "From the campaign" resources below it. On a phone it comes before talking points.
- **Talking points:** a quiet bordered block with an eggplant edge and a "Pinned by the campaign" label. Supporting facts stay folded under the point, as now.
- **Posts:** one surface separated by rules, not a shadowed card per post. A post shows only its time, because the campaign's name is already the page heading. Like (signed-in workers only) and Copy link are quiet text actions. An embedded job uses the job-row grammar, with its live state. A draft or closed job reads "No longer hiring", as `publicPost` already decides.
- **No numbers on display:** no follower or like counts, and no engagement figures.

## 2. Single post page: `post-390.png`
Route `/c/[handle]/p/[postId]`. Data from `loadPublicPost`.

The page is where a shared link lands. It shows the campaign's identity line first, then the post text at 18/28 on a reading measure, then its real time, the embedded job, the actions, and a link back to the campaign.

## 3. Feed and management: no new layout proposed
- **`/feed`** keeps its current structure. It takes the same post treatment as above, with the campaign name kept on each post (the feed mixes campaigns).
- **`/campaigns` and `/campaigns/[id]`** (management) take the same header and posts treatment. Their forms follow the existing Reading/form pattern. No new layout decision is needed, so there is no mockup.

## States to capture when built
- Guest, worker following, worker not following, organization login.
- No header image, no posts, a long post, a talking point with facts.
- An embedded job that has closed.
- An unavailable handle or post.
- An unverified campaign.
- An empty feed, and a feed with sources but no posts.

## Open questions
1. **Hiring now.** The page has no list of the campaign's jobs today; a job appears only when a post embeds it. A list needs one new read-only query: the campaign's published jobs, using the same filter as the directory's existing "hiring" count. There is no schema change. **Add it, or leave jobs inside posts only?**
2. **Talking points in Posts.** A pinned post appears twice today: in Talking points and again in Posts. **Show it only under Talking points, or keep it in the time-ordered list too?**
3. **Desktop side column.** Is the right column (jobs, then resources) worth it, or should one column hold everything at every width?
