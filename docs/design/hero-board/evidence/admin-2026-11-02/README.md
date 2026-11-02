# Staff console front page (#116, 2026-11-02)

Every capture is from commit `2007a63`, with a clean tree (`manifest.json`). Captures are at DPR 2, full page, with the browser clock frozen at 2026-10-30T19:00:00Z, in America/Denver. None has horizontal overflow. The server's own clock was the real date (2026-11-02). Neither fixture date is near enough to that difference to change a row.

## Where each row comes from

There is no schema change and no new query. Each part of the page comes from a loader the queue pages already use.

| On the page | Source |
| --- | --- |
| Band: organizations to approve, organizations approved | `listOrganizationsForAdmin()`: the lengths of `awaiting` and `approved`, the same rows the list shows |
| Band: rule profiles jobs can't publish under | `jurisdictionsNeedingAttention(...)`: the blocked rows, the same ones the list shows |
| Band: campaigns to verify | `countAwaitingVerification()` (unchanged) |
| Organizations to approve, the first five | `listOrganizationsForAdmin().awaiting`, in the queue's own order (waiting longest first) |
| Jurisdiction rules that need attention | `listJurisdictionsForAdmin()`, current versions only. First come the versions with publish-gate `problems`. Then come usable versions whose `approvalExpiresAt` is within 30 days, soonest first. |
| Recent staff actions, staff since | `loadAdminOverview()` (unchanged) |

Each count in the band links to its queue. "Organizations approved" isn't a queue, so it isn't a link.

## Fixture

The fixture is synthetic and lives only in the local preview database. It adds:

- **Westside Ballot Volunteers (fixture):** awaiting approval, with owner Riley Chen. Its gate isn't started.
- **Two rule profiles**, each with the `jurisdiction.version_approved` staff action the real approval writes, recorded by the fixture staffer Morgan Ellis:
  - **CO, statewide v1:** approved, and its approval ends on 2026-11-12. It is usable, and it is listed because the end is within 30 days.
  - **Aurora, CO v1:** approved, but its approval ended on 2026-10-28. The publish gate refuses it.

`admin-empty-queues-1440-light` is the same page with the fixture organization approved and both profiles superseded. Both changes were reverted right after the capture.

## Compared with the approved mockup

`admin-mockup-vs-built-1440.png` shows the two side by side.

**Applied from the review:**
- **Staff shell:** Eggplant, with the persistent "Turfcut staff" label (decision 4). The `staff-band` stays visible on phones.
- **Band:** queue counts that link to their queues, including campaign verification.
- **Two lists:** organizations to approve, then jurisdiction rules. The hard stop is stated in words.
- **Recent staff actions** are kept.

**Deliberate differences from the mockup:**
- **Organizations are rows, not a table.** A five-row preview reads better as rows, and the full queue is one click away.
- **No "Jurisdictions" column.** An organization doesn't have a jurisdiction until it files a job, so there's no honest value to put there. The row shows what the loader has: the owner, the member count, and what the gate still lacks.
- **No "Review" button.** The whole row is the link to the organization's page, where the decision and its required reason already live.
- **Expiry is a date, not a "14 days" chip.** It reads "Approval ends Nov 12, 2026", which matches how the jurisdiction page states dates.
- **The jurisdiction list includes rule profiles that are blocked now,** not only those that will expire soon.

**Known limit (performance, not changed here):** `listOrganizationsForAdmin()` also loads every approved organization. The page uses them only for the approved count. A narrower loader would be a new query, so it waits for approval.
