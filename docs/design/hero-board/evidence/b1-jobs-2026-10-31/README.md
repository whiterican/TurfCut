# B1 — Jobs refinement (2026-10-31)

Answers the #113 review's Jobs refinements: quieter inactive filters, no
repeated card shadow, small/medium radius tokens, 44px targets kept, only
unnecessary gaps tightened, and a varied-media check.

Source: every capture is from commit `07771b7` with a clean tree
(`manifest.json` → `source.clean: true`). Viewports 390 and 1440 at DPR 2,
light and dark, clock frozen at 2026-10-30T19:00:00Z, America/Denver.
Before images are the `review-2026-10-30` captures (commit `5a05280` / `32f5033`).

## What changed

- **Filter chips:** inactive chips have no outline, just a quiet `--surface-2` fill.
  Hover shifts the fill. The visible chip is 36px, with a 44px hit band (`::before`).
  The selected chip is unchanged: eggplant fill, check icon, `aria-current`.
  Staff Hiring tabs share the class and pick up the same treatment on purpose,
  so every screen uses one chip grammar.
- **Job rows:** border-only at `--radius-sm`, with no shadow.
  The Save/Hide swipe underlay matches that radius. A save failure now shows below the row.
- **Two-up desktop grid:** cards in a row share a height, so the gaps between rows are even.
- **Gaps:** the Open jobs heading sits closer to the list, and the list gap is 8px on phone and 12px on desktop.
  The Invitations link keeps its 44px target.

## Varied media and fallback (fixture)

The local preview DB has two **published** fixture campaign profiles, one per
demo organization, each with a header image key:

- `mile_high_fixture` is linked to the Library Hours and Bike Lane (Mile High) jobs.
- `front_range_fixture` is linked to the Neighborhood Parks Bond job.

The page builds header URLs from the real loader (`jobHeaderUrls`) and campaign
media wins over the category photo. The capture browser serves the placeholder host's
two keys from the licensed `public/photos` set (`job-event.jpg`, `job-field.jpg`).
These are **synthetic stand-ins**, not real campaign uploads.
Every job without an eligible published header falls back to its category photo.
That happens in the same capture, so populated and fallback rows can be compared directly.
No photo is attributed to an organization at random.

## Reference vs implementation

`jobs-reference-vs-implementation-390.png` puts the concept's screen 2 (an upscaled crop)
next to the first phone screen. Known differences, all deliberate:

- **Fewer rows on the first screen.** The concept fits about four rows; this shows two and a half.
  Real job titles are longer than the concept's two-word ones, and they wrap rather than truncate.
- **No "+ bonuses" or location chip.** The concept's "+ bonuses" and its "Denver, CO" header chip aren't backed by data, so neither is shown.
- **No Leads tab** in the dock. That feature isn't built yet (#110).
- **A "Your job" strip and Invitations link** sit above the list. Both were endorsed in review and aren't in the concept.
