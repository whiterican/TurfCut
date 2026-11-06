# Hiring builder slice: evidence (2026-11-06)

The job builder (`src/components/JobForm.tsx`, `src/app/globals.css`) after slice 1 of the hiring redesign, captured from the running app on a local test database (fixtures as in `docs/design/hero-board/mockups/hiring-2026-11-05/current/README.md`) at commit **`3a26ba3`**, the head that carries every code change in this PR (the evidence commit itself only adds these files). Compare each with its frame in `docs/design/hero-board/mockups/hiring-2026-11-05/` at the same width and theme.

## How each capture was taken

1. Load the route and do the action (press Next, open a step).
2. Record the app's own state before anything else touches the page: whether the current step sits inside the track's box (the app's own centring, no help from the capture), what has focus, the summary heading, the step's line, the footnote, the save line and the primary button.
3. Take the viewport capture (light) where the fixed dock really sits, and on a phone review a second viewport scrolled to the save button.
4. Draw the dock at the page's end and take the full-height capture, so the dock covers nothing.
5. Last, probe the current step's touch target with `elementFromPoint` in quarter-pixel steps, saving and restoring the track's scroll.

Chromium runs with its scrollbars shown (not the headless default of hiding them), so the scrollbar check is real. At 1440 that makes `over` read −15, the page's own vertical scrollbar, not overflow; the track's `scrollbar-width` reads `thin` there with 0px shown because the track wraps and doesn't scroll.

## Captures (`manifest.json` has every number)

| Capture | What it shows | Mockup frame |
| --- | --- | --- |
| `new-step1-errors-{320,390,1440}` | New job, Next with nothing filled: "2 things to fix on this step", focus on the summary, the inline errors kept | `builder-new-errors` |
| `draft-step2-{390,1440}` | Saved draft, step 2 with the staging map; save line with fields waiting for a fix | `builder-draft-step2` |
| `draft-step4-errors-{390,1440}` | Saved draft, Next on step 4 with the contacts missing: "3 things to fix on this step" | `builder-draft-step4-errors` |
| `draft-jump-to-review-stops-at-step4-390` | The Review step pressed in the track on that draft stops at step 4, the first step that fails, as today (the capture script's action; the manifest records the result) | (behaviour kept) |
| `live-step1-{390,1440}` | Published job, step 1: the live notice, "Changes save when you finish." | `builder-live-step1` |
| `live-step5-{320,390,1440}` | Published job, step 5: the issue rows stacked on a phone, "Not disclosed" whole | `builder-draft-step5` |
| `live-review-{320,390,1440}` (+ `-scrolled-to-save` at 320 and 390) | Published job, step 6: "Check everything, then save your changes.", no draft footnote, "Save changes" | `builder-live-review` |
| `live-review-track-800-800-*` | At 800 wide the track scrolls and shows a thin scrollbar (10px) a mouse can use | — |
| `focus-ring-first-step-390`, `focus-ring-last-step-390` | Reached by Tab: the focus ring (2px, offset 2px) wholly inside the track on step 1 and step 6 | — |
| `summary-staging-links-390` | Summary links: hiring modes focuses the first checkbox; each contact link its input; an unplaced staging point's "Pick the point on the map." its error text | — |

## Results at 3a26ba3

- No horizontal overflow and no console errors in any of the page captures (the rows above with a width and theme; the focus-ring and summary-link checks record their own results instead).
- The current step inside the track on load in every page capture.
- The current step's target 44.5px against a visible 26px.
- Focus on the summary after every failed Next.
- Every issue select fits "Not disclosed".
- The live review's line and footnote match "Save changes".
- The track scrollbar visible at 800px.
- The focus ring of the first and last step inside the track.
- Every summary link landing on its control or error text.

The live job's edits in the summary-link check were never saved: a live job doesn't autosave, and Save changes was not pressed. A paused job takes the same path as a published one (`isLiveEdit`, unit-tested); the fixtures hold no paused job, so it is not captured.
