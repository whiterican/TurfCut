> **CURRENT HANDOFF — SUPERSEDES THIS FILE'S VISUAL DIRECTIONS (28 October 2026)**
>
> The founder's latest twelve-screen concept and issue [#111](https://github.com/whiterican/TurfCut/issues/111) supersede conflicting older tab counts, fonts, colors and “concept only” visual directions below. Read [the current reference and corrective plan](https://github.com/whiterican/TurfCut/blob/docs/hero-board-audit-2026-10-28/docs/design/hero-board/README.md) in [draft PR #112](https://github.com/whiterican/TurfCut/pull/112). **The actual founder reference image is now committed in that package**; this file's old image-transfer limitations are historical. Preserve compatible data honesty, authorization and workflow requirements. The older rejected 64 renders remain rejected. This file is retained as history, not a competing design target.

---

# Claude acceptance criteria — TurfCut hero-board static references

## Real-data fidelity
1. All six worker tabs survive in each mobile image and in actual nav. Worker navigation cannot be replaced with generic Home/Jobs/Messages/Profile.
2. Organization mobile dock is role-dependent, with More if necessary; desktop has a full left rail. No duplicate desktop navigation bars.
3. Numeric scorecards show underlying verified measurements and scope, not a generic 4.9 rating; do not invent worker histories, ratings, payouts, conversion figures or employer bonus amounts.
4. Current production JobType includes only PETITION and CANVASS. Roofing, solar and stop-level leads are *planned*, not live. Existing turf geometry/aggregate DOOR_KNOCK counts do not prove a specific address visit. Never invent worker GPS pins.
5. Preserve the app's existing hiring, permissions, shifts, offline queue truth, supervisor work review, payment state and messaging. Future lead/stop enhancements require separate approval.

## Pixel/interaction review
- Render `390×844`, `1440×900` light and dark for every included screen at 2×. Render real application with Playwright at same widths before measuring differences.
- Apply the token sheet and inspect layout/typographic/spacing discrepancies; don't paste static reference HTML into Next/Tailwind.
- Keep floating dock, shrink decorative footprint; never shrink touch targets below 44px. Test small 320px viewport, 200% text, keyboard, reduced motion and safe area.
- Typography A/B: current Barlow vs Public Sans UI and Newsreader public hero. Static reference uses Cabin/EB Garamond offline layout substitutes; no conclusive font choice yet.
- Accessibility: status must never rely on colors only; false/unsent/queued/saved/verified/paid distinctions must be explicit.
- No commercial, roof, solar, contract, demographic or map inference beyond verified project status and privacy permissions.

## Open constraints and limitations
- Full-length real authenticated application screenshots were not part of this package; collect them before below-fold QA.
- Screens in separate ZIP are static synthetic fixtures. They are not stored on this docs-only GitHub branch as of this handoff.
- Founder approval and independent C1/C2/C3 review gates remain prerequisites to product implementation; keep flagship redesign prioritized over RS1.
