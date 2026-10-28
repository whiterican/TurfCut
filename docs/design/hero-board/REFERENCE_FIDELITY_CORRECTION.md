> **CURRENT HANDOFF — SUPERSEDES THIS FILE'S VISUAL DIRECTIONS (28 October 2026)**
>
> The founder's latest twelve-screen concept and issue [#111](https://github.com/whiterican/TurfCut/issues/111) supersede conflicting older tab counts, fonts, colors and “concept only” visual directions below. Read [the current reference and corrective plan](https://github.com/whiterican/TurfCut/blob/docs/hero-board-audit-2026-10-28/docs/design/hero-board/README.md) in [draft PR #112](https://github.com/whiterican/TurfCut/pull/112). **The actual founder reference image is now committed in that package**; this file's old image-transfer limitations are historical. Preserve compatible data honesty, authorization and workflow requirements. The older rejected 64 renders remain rejected. This file is retained as history, not a competing design target.

---

# VISUAL CORRECTION — THE PREVIOUS HERO-BOARD MOCKUPS ARE REJECTED
**Founder feedback, 2026-10-28:** "I looked at the handoff and the mockups still look nothing like the references at all." The founder supplied the dark-forest/cream photographic concept board containing five mobile routes plus three desktop operational workspaces. **Treat this as a change to the authoritative visual target.**

## Status and decision
- **REJECT visual acceptance of the 64 previously delivered hero-board screenshots and their corresponding HTML.** They were generated, rendered, and dimension-tested, but are not visually faithful. A screenshot passing overflow checks is not a successful design.
- **Preserve only** the accurate codebase audit, true job/shift states, role-based navigation, data honesty, type-token verification, responsive/safe-area testing, legal/consent boundaries and engineering guardrails from the earlier handoff.
- **Do not implement the old visual package** or report C1 READY on that basis. Restart C1 *visual fidelity* against the founder's reference, not a composite assembled from generic cards.
- **No production code changes, migrations or merges authorized.** This is a docs-only corrective instruction.

## Visual target: what the founder's image actually shows

1. **Public/home:** An immersive full-height photographic field-worker/neighborhood composition, near-black/forest scrim, editorial serif "Field work that matters.", understated green CTA, small real job preview at bottom. **Not** a beige "Good morning" dashboard or oversized purple hero card. Differentiate the public marketing home from the authenticated worker Today route; they are distinct products/surfaces.
2. **Worker Jobs:** Clean near-white screen, modest header with location/search, compact horizontal category chips, a **stack of photo-led horizontal job rows**, each with strong title and pay, subdued date/location/org metadata, a small save icon. Four useful rows can be visible before the dock. **Not** generic text list cards, gradients in place of photos, or a large discovery intro.
3. **Job details:** Photographic header, crisp white information sheet under it, job title with true gross pay, meaningful time/location/headcount/requirements sections, one dominant forest-green action. Distinct Apply / Applied / Hired states. No '+ bonuses' unless authored in approved job terms.
4. **Schedule:** Near-black-green framing header, bright paper cards, tabbed upcoming/past/availability, dense upcoming shift cards, status text, clear contextual actions, a "Required actions" list. Do not invent mandatory onboarding checklist items.
5. **Profile:** Dark header, warm-white main profile area, structured credentials and privacy settings. **Remove the reference's invented 28 jobs, 4.9 rating and 120 hours**—not substitute a made-up scorecard. Real math-backed periods only if authorized/source-backed.
6. **Org desktop:** Dense, actual desktop application. Near-black/forest **left navigation rail** at ~16–22% of viewport (depending on monitor), white/cream canvas, restrained top controls, readable tables and context. Strong discipline on rows, columns and operational truth; never huge pill-shaped vanity tiles.
7. **Org Desk:** Reference shows KPI tiles, but the numbers 124/86/12,340/$4,280 are fake fixture data. Replace with real, scoped `/desk` action queues and truthful quantities, or remove; keep the visual *density* not imaginary measurements.
8. **Workers/Hiring:** Reference workers table includes fabricated star-rating column. There is **no real workers list in production nav corresponding to that concept**; apply the visual vocabulary to actual `/hiring` pipeline and engagement views with existing statuses. Delete the Rating column entirely.
9. **Field/map:** Maintain actual turf geometry/maps and manager review, not invented live worker GPS pins or hidden workforce tracking. White map workspace + near-black rail. Worker position tracking is not inferred from map dots.
10. **Dock:** Founder decision KEEP, but SHRINK. The board only shows four tabs, whereas actual worker app has SIX: Today · Feed · Work · Shifts · Messages · Profile. Implement the reference's **dark near-black floating slab** with compact icon + label columns, not a white dock. Width target 348–356 CSS px at 390 viewport, 58–62px overall including frame, 48px or larger true hit regions; safe-area bottom, scroll tuck, focus and unread badge preserved. Org owner's phone uses Desk · Hiring · Field · Messages · More with role-grant filtering. Never remove worker routes merely to match the incorrect four-tab reference.
11. **Brand conflict resolution:** Earlier founder-approved deep eggplant identity and forest-green action tokens still matter. Match layout, photographic treatment, white/cream surfaces, density, and dark navigation **first**; then compare a forest-black vs eggplant-black navigation variant for explicit founder approval rather than quietly overwriting brand semantics.
12. **Typography:** Current Barlow UI/Barlow Condensed labels/DM Mono metrics are production. Public Sans UI + restrained Newsreader editorial (not app-wide serif) is a proposed A/B; typography alone won't repair a composition mismatch. Use 14–16px practical body, 11–13px secondary metadata, compact headings and purposeful whitespace—not generic huge greetings with tall cards.

## Why earlier handoff failed — measurable comparison

| Category | Founder reference | Earlier handoff | Required correction |
|---|---|---|---|
| Main Work screen | Four compact photograph-led rows in first screen | Large pale discovery heading, huge filters card, gradients replacing photos | Condense and show actual row density and real photo crops |
| Authenticated page background | White/near-white working canvas | Whole view beige | Restrict warm paper to selective framing; working canvas remains white |
| Home/public hero | Worker/neighborhood photograph overlaid with type | Generic empty Today greeting / full purple block | Separate public hero visual from authenticated Today data |
| Mobile navigation | Small dark slab | Very light beige slab | Dark slab + six actual worker destinations; never reduce touch area |
| Desktop org | Black/forest rail + real tables | Inconsistent desktop shell / generic cards | Full permission-scoped rail, near-white content, compact tables |
| Data truth | Concept board contains illustrative/fake rating/KPI/location | Previous handoff removed those but replaced them with unrelated design | Delete fake values **without replacing reference's layout character** |
| Brand typography | Editorial home contrast; compact functional text elsewhere | Big sans banners and repeated labels | Practical density; test fonts in actual browser |

## Corrected pilot, completed locally (NOT a claim of full redesign completion)

The assistant created an independently rendered static **Work** first-pass proof at:
- `work-reference-v2-390-light.png`: 390×844 CSS px @2×, visible rows, dark six-tab dock.
- `work-reference-v2-1440-light.png`: 1440×900 CSS px @2×, compact rows + useful secondary detail.
- `work-reference-v2-320-light.png`: 320×760 CSS px @2×, width QA.
- `hiring-reference-v2-1440-light.png`: 1440×900 CSS px @2×, forest rail, white operational table **without** Rating column.
- Their original HTML sources are in the founder's ChatGPT session under `TurfCut_Reference_Correction/`, **NOT** yet in this GitHub branch.
- Playwright observed no horizontal overflow at 320/390/1440. Work prototype has six dock targets, each 48px tall. This is **an initial reference correction, not pixel-perfect and not yet accepted by founder**.

**IMPORTANT:** These are synthetic design fixtures; example jobs, rates and counts are not actual backend data. The photo thumbnails were cropped from the founder's submitted concept screen solely for this visual comparison. Do not reuse concept artwork as production photography without proper rights/approvals.

## Mandatory delivery reset to Claude

1. Find and inspect original founder concept board / the founder-provided screenshot plus individual concept crops (01 Landing, 02 Work, 03 Job detail, 04 Schedule, 05 Profile, 06 Desk, 07 Workers, 08 Field). If those bytes are not accessible to your environment, say so; do NOT invent an "approximation" and call it matched.
2. Prepare **three first visual proofs**: **public photographic landing**, **mobile worker Jobs / job details**, **1440px organization Hiring/Field**. Include the authentic six-tab dark compact worker dock and role-scoped org rail.
3. Compare images side-by-side with explicit spacing, hierarchy, photo ratio, color role, density, font and nav differences. Get founder feedback **BEFORE** replicating across remaining routes or dark variants.
4. Then make one individual 390px/1440px light/dark image + one concise annotated spec + one static HTML/CSS sample per screen, based on ACTUAL layout geometry and real data states. Avoid a contact sheet as the primary artifact.
5. C1 must distinguish **visual acceptance**, **data honesty acceptance**, and **responsive accessibility acceptance**. Passing QA cannot compensate for the founder saying the design does not match.
6. Keep F00–F11 flagship redesign as active priority; RS1 roofing/solar/stop lead additions remain separately gated, not built into these reference screenshots as if live.

## Source of truth and read order
**FIRST this file → then the founder's actual original images → then `src/lib/nav.ts`, `src/components/AppNav.tsx`, `src/app/globals.css` → then original handoff for functional constraints ONLY.**

Do not treat the old image ZIP as the visual target. Its status is **SUPERSEDED / REJECTED**.
