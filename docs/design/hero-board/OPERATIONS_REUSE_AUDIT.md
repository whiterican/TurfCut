# Read-only operations reuse audit — implementation guardrails for future RS1 V1
Based on master `fec571252dbec0c5e69629e1ae71870c6e36f983`; **this is only a planning map, not an implementation PR.**

| V1 capability | Reuse exact current code | Only genuinely missing extension |
|---|---|---|
| Job → hiring | `prisma/schema.prisma:Job, Engagement, EngagementEvent`; `engagements.ts` statuses CLAIMED/ACTIVE confirmed; `jobs/[jobId]/page.tsx` | Commercial Door-to-Door Sales taxonomy and independent legal/pay gates NOT currently live. Existing JobType only PETITION, CANVASS. |
| Job/shift → turf | `Job.geography`, `Shift.turfArea` and `ShiftSlot.turfArea` JSON polygons; `TurfMap.tsx`, `TurfWorkbench.tsx`; `/shifts/turf` | Numbered persistent address Stops and Walkbook import/assignment, source rights, no assumed occupants. Existing polygon and worker-created pins are not a walkbook. |
| Shift → outcomes | `Shift`, `WorkEvent` append-only; `field-day.ts`, `field-day-data.ts`, `FieldDayLive.tsx` | Per-stop outcomes with stopId, worker/shift, recorded time, authorization, idempotent repeated visits and controlled corrections; a door count is not a per-house visit proof. |
| Offline | `offline-queue.ts` localStorage plus memory-only status; `offline-sync.ts:readQueued`, `/api/shifts/[shiftId]/sync`, `syncWorkerActions`; 24h age limit | New action grammar and new server atomic event→lead logic after actual persistence; role/revocation checks; no duplicate leads from retries. |
| Lead & follow-up | Current field outcomes and `Desk` work review | Small job-scoped Lead/FollowUp record with source stop outcome, audit trail, dated actions and Do-not-knock suppression; NOT a full CRM. |
| Job chat | `Conversation`, `ConversationJob`, `ConversationParticipant`; `chat-data.ts` / `chat.ts`; direct per-engagement and job group chats | Contextual link in existing job/shift; do not start a second chat system. Test changed job memberships. |
| Shift verification / pay | Existing `Validation`, `Payout`, `PayoutEvent`, verifiedWork/pay logic | Nothing in V1 that automatically approves pay or converts self-reported sale into earned money. Review any new commercial rate/unit with counsel. |
| Auth, consent, data walls | `access.ts` role/grant access, job/shift guards, sharing and political preference handling | Per property/lead/job object-level rights; organization source-purpose/license isolation; forbid political voter lists as commercial sales leads even by account-role spoofing. |

## Required acceptance examples
1. Organization approves job for commercial activity only after its sector-specific legal review. Assign 20 synthetic authorized stop records to two confirmed workers; a third applicant in APPLIED status is denied.
2. Worker logs stop outcomes offline in **the existing shift** (Not home, Answered — not interested, Interested, Callback, Sale—self-reported, Do not knock) and sees durable-phone vs memory-only vs sending vs server-recorded/rejected.
3. On successful server sync, no duplicate outcome or lead is created by resend/restart. Do not knock suppresses future follow-up.
4. Worker/manager see the already authorized job conversation from the current job and shift; unauthorized users see no contact or property data.
5. Current signature custody, pay, reconciliation, disputes, messaging safety, hiring, political sharing, worker preferences, scheduled jobs and existing field counts remain identical.
6. No fabricated worker rating/bonus/KPI/GPS/household-demographic inference.

## Gating
Use #110 lean scope, #101 program, #78 flagship redesign. First deliver a precise reuse map, migration proposal **without running it**, mobile/desktop design, state table, and C1/C2/C3 review; founder approves after that. No production code or schema modifications permitted from this document.
