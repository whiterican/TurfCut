# Hiring builder slice: evidence (2026-11-06)

The job builder (`src/components/JobForm.tsx`, `src/app/globals.css`) after slice 1 of the hiring redesign, captured from the running app on a local test database (the fixtures of `docs/design/hero-board/mockups/hiring-2026-11-05/current/README.md`). Compare each with its frame in `docs/design/hero-board/mockups/hiring-2026-11-05/` at the same width and theme.

Every capture is DPR 2, light and dark (the app's own theme switch), full height, with a viewport capture of the light one. `manifest.json` records, per capture: horizontal overflow, page height, whether the current step sits inside the track's box, the current step's visible height and the extent a pointer actually lands on (probed with `elementFromPoint` in quarter-pixel steps after centring it), which element has focus, the problem summary's heading, whether every step-5 issue select fits "Not disclosed", the save line, the primary button and console errors.

| Capture | What it shows | Mockup frame |
| --- | --- | --- |
| `new-step1-errors-{320,390,1440}` | New job, Next pressed with nothing filled: "2 things to fix on this step", focus on the summary, the inline errors kept | `builder-new-errors` |
| `draft-step2-{390,1440}` | Saved draft, step 2 (dates, city, launch, staging map), save line with fields waiting for a fix | `builder-draft-step2` |
| `draft-step4-errors-{390,1440}` | Saved draft, Next on step 4 with the three contacts missing: "3 things to fix on this step", each line focusing its field | `builder-draft-step4-errors` |
| `draft-jump-to-review-stops-at-step4-{390,1440}` | Pressing Review on the same draft stops at step 4, the first step that fails, as today | (behaviour kept) |
| `live-step1-{390,1440}` | Published job, step 1: the live notice, "Changes save when you finish." | `builder-live-step1` |
| `live-step5-{320,390,1440}` | Published job, step 5: the issue rows stacked on a phone, "Not disclosed" whole at 320 and 390 | `builder-draft-step5` |
| `live-review-{390,1440}` | Published job, review grouped under the step titles, "Save changes" | `builder-live-review` |

Results: no horizontal overflow, no console errors, the current step in view in every capture, its target 44.5px (visible 26px), every issue select fitting its value.
