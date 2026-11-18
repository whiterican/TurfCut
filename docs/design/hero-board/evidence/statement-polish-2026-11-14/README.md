# Statement alignment polish — Claude review handoff

Base: `b6c33b67cdd0c99490a3efaf89e2d87738beb097`.

## Implemented

Each job group's ledger currently derives column widths from its own contents. A short worker name and formula in one group can put Pay and Fee at different horizontal positions from the next group. `StatementView.module.css` supplies one six-column grid when the **table container**, not the viewport, is at least 60rem wide. The subtotal continues to span the first three columns. Worker names may wrap instead of invading the date. The same layout applies to corrections.

Column proportions (as shipped, after Claude's review): Worker 17%, Date/job 18%, Basis 20%, Pay 15%, Fee 13%, Current state 17%. Codex first proposed 17/22/22/13/11/15; measured at a 60rem container, that let −$1,234,567.89 run 10px past Pay and −$12,345.67 7px past Fee, while the date column had room to spare. These are implementation values, not founder-specified tokens. Below the threshold, the existing automatic table sizing and phone stacks remain. Print retains automatic sizing. Palette, fonts, spacing, borders, statuses, grouping, ledger calculations and navigation are unchanged.

## Verification status

Codex's environment could not launch Chromium. Claude then measured the real `StatementView` in Chromium (Playwright, dev server, the same synthetic-fixture approach), at containers of 959, 960, 961, 966, 1006, 1066 and 1266px, light and dark:

- every job group's column edges are identical once the layout is fixed (60rem and up);
- no cell's visible text runs past its content box, with seven-figure, negative and bracketed amounts (up to `($9,999,999.99)` in Pay and `($999,999.99)` in Fee), 40-character unbroken names, a 60-character job title, receipt and correction references, and "Withdrawn after this statement closed";
- print keeps automatic sizing, and the 390px phone stack has no page overflow.

A correction's Basis now keeps only the reference itself unbroken (`corrects` may wrap before it): the whole phrase was 8px wider than the column at 60rem.

Not captured: the authenticated statement route, 200% zoom, Sunlight, and screenshots for the record. No visual approval is claimed; that is Astra's (or Caden's). The fixture uses the actual StatementView with synthetic data, not an authenticated statement route. Typecheck, lint and unit-suite results are recorded in the PR. No live database or production data was accessed.

## Reproduce the component capture locally

1. From the repository root, copy `fixture.tsx` from this directory to temporary `src/app/zz-polish-fixture/page.tsx` (create the directory).
2. Run the development server bound to localhost, port 3041. Use a local environment with no production credentials.
3. Run `node docs/design/hero-board/evidence/statement-polish-2026-11-14/capture.mjs`. Set `PLAYWRIGHT_MODULE` to an installed Playwright module if it is outside this repo; `CHROMIUM_PATH` optionally selects a browser; `BASE` optionally changes the server URL. No project dependency addition is needed.
4. Remove the temporary route before lint/typecheck/tests or committing. The route-skeleton test correctly rejects temporary pages without loading states.

The script measures 390, 640, 768, 1024 and 1440 widths in light/dark, captures phone/desktop component images, and checks print table layout. Its `before` mode is a CSS **simulation** of automatic sizing, not a true base-commit screenshot; take genuine base/head captures for signoff. Record full source SHA, theme, viewport, browser and fixture/route in a manifest beside real captures.

## Claude review / enhancement acceptance criteria

- On roomy containers, Pay/Fee right edges and subtotals align across two or more job groups; compare bounds within 1 CSS pixel.
- At 959/960/961px container widths, confirm the switch does not clip dates, numbers, reference IDs or status chips. Check the organization rail as well as a full-width fixture.
- Exercise long/unbroken worker names, long job names, long basis copy, correction references, negative corrections, bracketed uncounted amounts and large amounts (including millions). If these collide, refine the column allocation or threshold; do not truncate money or silently hide content.
- Verify single-job, multi-job, corrections and empty statements. Closed statements and withdrawn-after-close wording must remain truthful and fully visible.
- Verify 320/390px stacks, 640–735px compact tables, tablet portrait/landscape, 200% browser zoom, Sunlight and print. Do not force fixed widths onto compact or print layouts without evidence.
- Attach real authenticated route captures at 390 and 1440 in light/dark, plus any failing boundary, before approving. Confirm caption/header relationships remain intact in the accessibility tree.

## Remaining polish, without changing the appearance

These are targeted verification tasks, not confirmed defects or a request to redesign:

| Area | Inspect | Improve only if demonstrated |
| --- | --- | --- |
| Tabs | Compare height, icon size, baseline and padding within each tab family; long labels at 320px and 200% zoom. | Reuse existing family tokens/classes. Keep segmented treatments, purple light/mint dark selection, Open jobs and Invitations. Different navigation families need not be identical. |
| Background transitions | Header → page, drawer → status area, immersive chat entry/exit in light/dark/Sunlight. Test installed iOS on device. | Correct only the mismatched layer. Preserve glass and safe-area handling. Never restore view-transition-name on phone-top glass/profile pills; that caused iOS boxes. |
| Header hit areas | Measure actual interactive bounds of compact 40px controls, especially Sunlight, with adjacent controls present. | Reach 44px where feasible without overlapping neighboring targets or changing the visible icon/orb. Avoid blanket pseudo-element expansion. |
| Job sticky footer | Check 320/390, phone landscape, 1024, 1279 and 1280 widths; keyboard, dock and home indicator. | Preserve #176's 1280 breakpoint and scroll clearance. Fix only a reproducible occlusion or duplicate control. |
| Design comments | Compare comments claiming decisions are proposed/pending with approved merged PRs and founder decisions. | Update stale wording with the approving PR. Do not turn unverified preferences into locked requirements. |

Please review this narrow code change first, enhance it where the measurements show a problem, and take remaining polish as separately scoped follow-ups. Do not add decorative cards, invented metrics, extra shadows or a new component style. Merging and deployment remain with Caden.
