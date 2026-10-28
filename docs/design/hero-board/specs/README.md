# Twelve-screen implementation matrix

All specifications inherit [tokens/navigation](../TOKENS_AND_NAVIGATION.md), [data replacements](../DATA_REPLACEMENTS.md), and [visual acceptance](../VISUAL_ACCEPTANCE.md). Geometry not printed in the composite is a proposed pilot target. Each spec is a screen contract, not a claim that a screenshot or backend exists.

| # | Screen / spec | Existing route and main code | Current gap / disposition |
|---|---|---|---|
| 1 | [Home](01-home.md) | `/`; `src/app/page.tsx`, `HeroPage` | Replace generic text/steps hero with photograph and concept hierarchy |
| 2 | [Jobs](02-jobs.md) | `/jobs`; `JobFeedCard`, `loadFeed` | Thumbnail rows, Inter, search/filter geometry; media projection needed |
| 3 | [Job details](03-job-details.md) | `/jobs/[jobId]`; `RecordPage`, `WorkerPanel` | Photo header and compact facts; keep all real actions/states |
| 4 | [Schedule](04-schedule.md) | `/shifts`; `ShiftDayList` | Upcoming/Past, compact cards, real status and required actions |
| 5 | [Active Shift / Today](05-active-shift-today.md) | `/dashboard`, `/shifts/[shiftId]`; `pickHero`, `FieldPage` | Task hierarchy can change now; address-based stops remain blocked |
| 6 | [Stop Outcome](06-stop-outcome.md) | No authorized stop route/model | Future feature contract; no fake production Save |
| 7 | [Leads](07-leads.md) | No lead route/model | Future feature contract; no synthetic production residents |
| 8 | [Messages](08-messages.md) | `/messages`, thread routes | Compact rows/header; preserve message permissions, sync and composer |
| 9 | [Profile](09-profile.md) | `/profile`, profile subroutes | Identity/menu hierarchy; initials and real credential/status replacements |
| 10 | [Organizer Overview](10-organizer-overview.md) | `/desk`; `WorkspacePage`, `loadDesk` | Wide map/actions composition; source-backed summaries only |
| 11 | [Field Map](11-field-map.md) | `/field`, `/field/[date]`; worker `/shifts/turf` | Field currently a list board. Aggregate authorized map/list view; no GPS/progress inventions |
| 12 | [More](12-more.md) | Existing org More pattern; worker sheet proposed; `/settings` | Restore accessible account destinations without dead routes |

Additional existing routes are regression obligations even when absent from the composite: Feed, notifications, invitations, hiring/applicant/match/invite views, earnings/receipts/disputes, job builder/editing, campaign pages, credential/sharing/preferences/availability/setup, organization settings/members/roles, staff admin, authentication and onboarding. Inventory every `src/app/**/page.tsx` at implementation time; apply the approved primitives without removing functionality.
