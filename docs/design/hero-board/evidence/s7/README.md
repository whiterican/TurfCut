# Slice 7 evidence — every remaining route on the scheme

Same contract and capture method as `../s1/README.md`: real routes, synthetic
fixtures (the rebuilt set), Inter loaded, frozen clock (2026-10-30 19:00
UTC), device scale factor 2, `<screen>-<state>-<css width>-<theme>.png`;
`manifest.json` records the font check, overflow and dock measurements.
Every route here is captured at 390 and 1440 in light; six are captured in
dark as well.

## What is in this slice

Every page that still drew its own `page max-w-*` frame now sits on the
template the architecture doc assigns (`docs/product/REDESIGN_ARCHITECTURE.md`
§5), with its loading skeleton on the same template:

| Template | Routes | Evidence |
|---|---|---|
| Reading | Job new and edit, profile sub-pages (availability, credentials, political fit, preview, sharing, setup), messages new and reports, roles, the error and not-found pages, the no-organization fallbacks | `jobs-new-*`, `job-edit-*`, `availability-*`, `profile-credentials-*`, `preferences-*`, `preview-*`, `sharing-*`, `messages-new-*`, `reports-*`, `roles-*` |
| List | Campaign feed, receipts, invitations, campaign directory, My schedule, Messages | `feed-*`, `receipts-*`, `invitations-*`, `directory-*`, `schedule-*`, `messages-*` |
| Record | Campaign pages and posts, dispute and receipt pages, a hired person, a worker as the organization sees them, statements by period | `person-*`, `worker-*` |
| Workspace | Invites and Matches tables, My turf | `invites-*`, `matches-*`, `turf-*` |
| Hero | Sign-up, as sign-in already was (art beside the form from 1024, a band above it on a phone); Welcome on the form side only (signed in: no art) | `signup-*` |

The older metric tile (`.stat`, on scorecards and experience) takes the same
white surface and figure as every other tile.

## Not changed, and why

- The worker's Jobs feed keeps its own frame: its two-column grid at 1024 and
  the chip row were designed in slice 1 and need the wider measure.
- The open conversation keeps its own frame: the thread's composer and
  header have their own full-height rules.
- The admin console's shell is the staff console's own frame.
- Campaign pages, dispute and receipt pages and statements by period are
  moved but not captured: the fixtures hold no campaign profile, dispute,
  transfer or closed statement period, and nothing is invented for a picture.
