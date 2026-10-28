# Forbidden content — substitute only real sourced data
| Synthetic board element that must never ship as real | Replacement (or DROP) | Where |
|---|---|---|
| A worker's star rating such as 4.9 | **DROP.** Verified scorecard uses only actual evidence with numerator, denominator, review state and disclosure choice. | Worker profile, employer workers list |
| Unverified "28 jobs" or "120 hours" | **DROP**, unless explicitly computed from the appropriate verified work events and period with basis visible. | Profile |
| Workers table "Rating" | **DROP** column, do not substitute arbitrary rank. | Hiring/worker management |
| "124 shifts filled", "86 active", "12,340 doors", "$4,280 total spent" | **DROP** synthetic totals; use live/current Desk query aggregates with timestamp and scope if supported, else concise action table. | Org Desk |
| Map worker location dots / fake tracking heatmap | Show only **assigned turf polygons or authorized stop/territory markers**; worker movements are not tracked here. | Field |
| "$25/hr + bonuses" when bonuses unknown | Show only actual approved gross rate and compensation basis, or leave unspecified. | Work cards, Job details |
| "Leads" or "Map" among worker dock destinations | **DROP**; worker nav is Today, Feed, Work, Shifts, Messages, Profile. Field stop and lead work belongs inside existing Shift/Job. | Worker dock |
| "More" on worker dock | **DROP**; More is for org roles with permission-filtered additional areas. | Worker dock |
| Solar, roofing, phonebank, owner-provided leads as shipped | **Mark PLANNED**, do not hide as an available production activity. | Job categories |
| "Recorded / verified / paid" before server confirmation | Show correct **locally saved / memory only / sending / server recorded / supervisor-reviewed / payable / paid** states. | All shift and earnings pages |

The imagery and data in the user-supplied collage and subsequently generated concept boards are **illustrative**. They may inform composition but are not product screenshots, not real worker locations, not real customers, and not proof of commercial adoption. Dark/Light/Sunlight token rules and the approved brand identity take precedence over any fictional board content.
