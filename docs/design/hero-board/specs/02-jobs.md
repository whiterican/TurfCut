# 02 — Jobs

**Route/source:** `/jobs`, `src/app/jobs/page.tsx`, `JobFeedCard`, `parseFeedFilters` in `src/lib/jobs.ts`, and the `src/lib/jobs-data.ts` feed loader. Keep worker and organization behavior distinct.

**Order:** Jobs H1 + legitimate locality/action → 44px search and filter control → short category chip row → vertically stacked compact thumbnail rows → persistent dock. Remove the redundant Find work/My Schedule switch after Jobs/Work are distinct destinations; preserve the underlying schedule URL and filters.

**Rows:** 76×92px thumbnail, then title (16/24 semibold), exact pay (14/20 semibold), date/time and locality (12/16 or 14/20 where needed), organization if space permits; independent 44px save action at trailing edge. White rows, subtle divider/border, 10–14px radius. Title/pay must be readable without opening. Do not nest several soft cards or add a badge for every field. Desktop keeps a deliberate dense list workspace, not enlarged mobile tiles.

**Copy/data:** **Jobs**; **Search jobs, organizations…**; **Filters**. Search needs a real authorized query/filter contract and clear/reset behavior; this is not already implemented by rendering an input. Only current live categories get live filters. Pay uses `payText`, unknown pay retains existing honest wording. Campaign image uses the eligible `campaignProfile` relation and media helper; fallback preserves thumbnail footprint without an invented employer photograph.

**States:** populated, no results (**No jobs match your filters.** / **Clear filters**), no inventory (**No jobs available right now.**), loading, error (**Jobs couldn’t load.** / **Try again**), saved/unsaved, image absent, long title, planned category. Keep save/hide behavior and eligibility visibility; show no success before server result.

**Acceptance:** four representative rows at 390px, no clipped pay, one authoritative set of search/filter parameters, stable focus after save, Jobs active for details and invitations, identical row tokens across sizes/themes.
