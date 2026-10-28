# Tokens and navigation — locked values versus proposed measurements

## Base tokens: exact, from the printed reference

| Proposed source token | Value | Role |
|---|---|---|
| `--brand-eggplant` | `#1C0F2E` | Dock, organization rail, brand shell |
| `--brand-forest` | `#157A46` | Primary action, confirmed/live accent |
| `--canvas` | `#FAF9F4` | Light page |
| `--surface` | `#FFFFFF` | Light work panels and rows |
| `--neutral-muted` | `#E7E6ED` | Muted fill; **not** a text color |
| `--border` | `#D7D2E0` | Light dividers and subtle outlines |
| `--text` | `#0F172A` | Light foreground |
| `--text-subtle` | `#64748B` | Light secondary foreground |
| `--status-warning` | `#F59E0B` | Warning accent/fill |
| `--status-error` | `#EF4444` | Error accent/fill |

Map existing names (`--bg`, `--fg`, `--shell-bg`, `--primary`, `--on-primary`, etc.) to these roles centrally. Existing `--muted` is a text role; do **not** assign `#E7E6ED` to it and make labels disappear. Keep immutable base colors separate from semantic dark/Sunlight overrides. Remove old decorative `--cut` lime uses. Focus, error text, disabled controls and map fills need named derived roles, not unexplained new brand colors.

## Typography

Inter throughout the specified UI; no Fraunces operational headings, Barlow Condensed dock, or Public Sans/Newsreader experiment. Keep the existing brand asset; replacing the font is not license to redraw the logo. Reference hero headline uses the exact words “Field work that matters.”; the printed Inter contract governs unless the founder separately approves a hero-only exception.

| Role | Size / line height | Weight |
|---|---|---|
| H1 | 28 / 36px | 700 |
| H2 | 20 / 28px | 600 |
| H3 | 16 / 24px | 600 |
| Body | 16 / 24px | 400 |
| Caption | 14 / 20px | 400 |
| Small | 12 / 16px | 400 |

Use relative CSS units for text scaling and tabular numerals for aligned values. Dense row titles may use the H3 role; pay is 14px semibold as a documented role extension. Do not globally set every heading to an oversized display scale. Load only needed font weights and verify the real font loaded before capturing evidence; a fallback-font render is not accepted as Inter proof.

## Geometry: concrete initial targets, not measurements extracted from the collage

The printed scale is **6, 10, 14, 20, 28px** for spacing/radius roles. The following targets make the first pilot testable; review them beside the reference before freezing. Document any changed value once rather than per screen.

| Element | Initial target |
|---|---|
| Mobile content gutters | 14px; hero media full bleed |
| Working header | 56px minimum, content-driven with enlarged text |
| Section gap | 20px; label-to-content 10px; tightly related facts 6px |
| Compact row padding/gap | 10px / 10px; no 40px inter-row gap |
| Job thumbnail | 76 × 92px at 390px; 10px radius; object-fit cover |
| Job row | About 112px minimum; grow for content/text size rather than clip facts |
| Normal card | 14px radius, 1px border, 14px padding |
| Buttons / search | 44px minimum target height; 10px radius; text label may wrap |
| Status pill | 6px radius, 6px vertical and 10px horizontal padding; content-driven |
| Segmented control | 44px minimum interactive segment, muted track, eggplant selected segment with light text; do not reuse dock selection styling |
| Routine list shadow | None; use spacing and divider |
| Elevated card shadow | Proposed `0 2px 8px rgba(28,15,46,.06)`; never every nested row |
| Dock | 20px radius; approximately 60px visible body; 12px side inset; 10px + safe-area bottom inset; 4px internal padding |
| Dock icon | 20px, consistent outline weight, active fill only where the icon supports it |
| Dock label | Inter 12/16px; complete word; no tiny condensed substitute |
| Dock layout at 390px | Available body width 366px; 358px inside padding. Reserve at least 60px for Messages and at least 44px per other target; distribute remaining space |
| Desktop organization rail | Proposed 220px; full height within real header/layout constraints; no duplicate top navigation |
| Desktop workspace | 28px outer padding; 20px column gap; right map/inspector panel about 300px; main content flexes |
| Mobile map | At least 320px tall when shown; accessible list below or a deliberate sheet, not a compressed desktop right column |

These are bounding targets, not fixed heights at 200% text. No phone bezel/status-bar replica in the web UI. Keep action and last-list-row clearance at least the measured dock height + bottom inset + safe area + 14px. Validate scroll and focus visibility instead of relying on a hardcoded bottom spacer.

## Contrast reconciliation: one real issue in #111

Ratios below are calculated from the sRGB hex values, using relative luminance and `(Llighter + .05) / (Ldarker + .05)`:

| Pair | Ratio | Decision |
|---|---|---|
| White on Forest | 5.379:1 | Normal-text AA; not AAA. Use the exact Forest token; update old AAA-only primary assertions deliberately |
| Forest on Eggplant | 3.374:1 | Suitable for a non-text active icon, insufficient for a normal-size nav label |
| Subtle on Cream | 4.514:1 | Passes AA narrowly; no opacity reduction |
| Error on White | 3.763:1 | Do not use this base accent for small error text; define a darker error-text extension |
| Warning on White | 2.148:1 | Use as an accent/fill, with an appropriate dark foreground; never as small body text |
| Proposed dock foreground `#5ED39B` on Eggplant | 9.737:1 | Green active icon+label alternative, **pending founder visual review**, not a new Forest token |

Prepare a close-up comparing the literal Forest label and the proposed lighter green foreground. Recommend `--dock-active-fg: #5ED39B` for the active icon and label so their treatment stays unified and readable. Keep primary buttons `#157A46`. This is a specific accessibility exception to #111's literal active-label wording, not permission for lime decoration or a lavender selection tile. Do not call it approved until the exception is reviewed. Inactive labels/icons can use Cream; focus uses a high-contrast ring independent of active styling.

Dark mode: base brand values stay unchanged; use documented semantic surface/text/border extensions, with the **same eggplant dock**. The composite supplies no full dark screen set, so show proposed dark renders explicitly. Do not invent a second approved eggplant or silently use the old cream-primary-card convention. Sunlight retains existing opaque/high-contrast behavior, stronger edges and legible control states; document intentional visual departures for that mode.

## Worker destination ownership

The current target order is **Home · Jobs · Work · Map · Leads · Messages · More**. The older five/six-tab arrangements are not the target. Actual visibility still depends on the real viewer and implemented feature. Use one navigation model for labels, ownership and rendering; no separate hardcoded arrays per page.

| Target label | Existing URL / implementation | Ownership / required action |
|---|---|---|
| Home | `/dashboard` for a worker; `/` is public discovery | Today states remain here. Public visitors do not receive links into an unauthorized worker shell |
| Jobs | `/jobs`, `/jobs/[jobId]`, invitations as applicable | Discovery and job details; preserve worker/organization variants and guards |
| Work | `/shifts`, `/shifts/[shiftId]` | Schedule and active/previous shift. No duplicate Find work/My Schedule switch needed once these destinations are distinct |
| Map | `/shifts/turf` | Existing authorized worker turf; must win over the broader `/shifts` ownership match |
| Leads | No implemented route at audited SHA | Full target includes it; production entry stays absent until feature authorization and backing implementation. No `href="#"`, dead button, or fake resident records |
| Messages | `/messages` and threads | Preserve unread counts and message permissions |
| More | Proposed worker sheet, reusing the accessible menu pattern | Existing Profile, Feed, Earnings, Payment history, Availability, Credentials, Display/settings routes; keep all existing destinations reachable |

Absent Leads creates an explicit six-destination **interim** dock (Home/Jobs/Work/Map/Messages/More), not a return to the earlier six-tab design. Record this as a feature exception; do not claim complete seven-tab delivery. New `/more` page versus a reusable sheet can be resolved at the milestone checkpoint; the sheet is the minimum-change recommendation and has no new persistence.

More's child routes include `/profile` and descendants, `/feed`, `/earnings` and descendants, and `/settings`; do not lose staff console access through Settings. More needs selected-section treatment on a child page, and expanded state when open. A button gets `aria-expanded`/`aria-controls`; a real destination link gets appropriate `aria-current`. Do not put `aria-current="page"` on every ancestor.

Use path-segment boundaries and the most specific match, not first array match: `/shifts/turf` → Map; `/shifts/abc` → Work; `/jobs/abc` → Jobs; `/jobsearch` → no Jobs match; `/profile/sharing` → More. More route ownership must not hijack organization/staff navigation. Keep deep links and browser Back behavior.

### Narrow phones and enlarged text

At 320px, `7 × 44 + 24 + 8 = 340px`, before allocating extra width to Messages. The pictured seven-tab geometry cannot meet these targets at that width unchanged. Proposed exception: below the measured fitting width, keep Home/Jobs/Work/Map/Messages/More visible and place Leads first in More **when it exists**. For further text enlargement, move the least immediate optional destinations into More, retaining complete labels and 44px targets. Present 320px/200% text screenshots and obtain a decision on this documented overflow behavior; never silently clip labels or shrink targets.

### Organization and staff navigation

Reuse `orgNav`, `PHONE_PICKS`, `accessFor` and server `requireArea` guards. The image's Overview maps to Desk; Jobs to Jobs; Workers' hiring function to Hiring; Map to Field; Compliance to Credentials. “Workers” must not promise an unimplemented global people directory. No Leads/Reports route or organization switcher is fabricated. A profile has one organization in the current model; display its name/approval without a false switcher chevron. Keep existing Pay, Campaigns, Members and staff controls where grants allow even when the illustration omits them. Rail selection may use a subtle documented eggplant-family extension; it must not revive lavender phone tiles.
