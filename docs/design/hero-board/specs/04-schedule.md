# 04 — My Schedule

**Route/source:** `/shifts`, `src/app/shifts/page.tsx`, `ShiftDayList`, real shift/status helpers.

**Order:** **My Schedule** header → **Upcoming / Past** segmented control → day groups (**Today**, **Tomorrow**, then localized weekday/date) → compact shift cards with narrow semantic accent → real required actions. Availability remains reachable through More/Profile; do not add a third segment solely because an older board had one.

**Geometry:** shared 14px gutters, 20px between days, 10px between label/card; title H3, time/location caption. White card, 14px radius, 2px semantic left accent, small right status pill, quiet **View Details** and valid **Get Directions** or **Message** actions. No 40px padding between every region. Desktop retains readable rows in a wider schedule workspace, not a huge empty centered card.

**Data:** group by the viewer's date with intentional server fallback and deterministic timezone fixtures. Keep actual statuses from `shiftStatusLabel`: Scheduled, On shift, No check-out received, Awaiting review, Approved as applicable. Do not rename all future shifts Confirmed or hide a missing check-out behind Pending. Directions require real staging/location; chat requires a real authorized conversation or permitted start action. Required actions derive from real credential/eligibility/setup requirements only.

**States/copy:** Upcoming empty: **No shifts scheduled.** / **Find Jobs**. Past empty: **No past shifts yet.** No mandatory task means no “Required Actions” filler section. Include multi-day, cross-midnight, canceled, overdue and loading/error fixtures.

**Acceptance:** tab selection changes the displayed real list and survives Back/refresh by a defined query/state contract; no duplicate tabs with competing selection; schedule belongs to Work; map child route belongs to Map. Current timezone grouping and truthful status logic survive restyling.
