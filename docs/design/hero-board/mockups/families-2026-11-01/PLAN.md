# Remaining #114 families: plan and mockups for review (2026-11-01)

These are mockups for review before building, not implementation. Each PNG is rendered from the HTML in `src/` on the design tokens' values (Inter, Cream page, white surfaces, Border, Text/Subtle, Forest action, Eggplant dock and rail). Every frame is labelled "MOCKUP · synthetic data".

The data follows the local fixture where one exists ($87.50 approved for Alex Rivera, $13.13 platform fee, statement S-2026-10). Every field shown is one the named loader already returns, so nothing needs a schema change.

Already built on this branch (`redesign/families`), so no mockups are needed for them:
- **Earnings and Hiring:** compact summary bands (`afff069`).
- **Pipeline, Applicants and Matches:** tables stack into named rows on a phone (`b6e3ef8`, `928b8f7`).

## 1. Worker receipt — `receipt-390.png`
Route `/earnings/receipts/[transferId]`, data from `loadReceipt`.

- **Layout:** a document-style record (#114). The heading gives the receipt number, the organization and the date. Under it, one status pill in the receipt's real state (`sending`, `sent`, `failed` or `reversed`, never merged), with the destination account's last four characters.
- **Key facts** as aligned rows: amount sent, started, confirmed by Stripe, Stripe reference.
- **What it paid:** one row per payout line, with job, shift date and formula, then a total.
- **Below:** the gross-pay note (the fee is never deducted), the existing Print button, and the existing dispute link.
- **States to capture when built:** sending, sent, failed, reversed (kept, marked reversed), a corrected amount (an adjustment line from a dispute), a long job name, and an unavailable receipt.

## 2. Dispute thread (worker side) — `dispute-390.png`
Route `/earnings/disputes/[disputeId]`, data from `loadDisputeThread`.

- **Header:** the record, then status and the first-response deadline from `DisputeClock` as restrained chips.
- **Facts:** what the worker said, when it opened, and when it must be resolved by.
- **Messages:** in time order, each with its author and role (the `ROLE_WORDS` labels).
- **Reply:** shown only when `canWrite`. A supervisor reads but sees no box.
- **Not shown:** attachments, because the thread doesn't have them.
- **Organization side** (`/pay/disputes/[disputeId]`): same layout, with Resolve beside the reply when `canResolve`.
- **States to capture when built:** open, replied, resolved (with the outcome and response), forbidden actor, failed reply, and long evidence text.

## 3. Organization statement — `statement-1440.png` (current: `current/statement-1440-now.png`)
Route `/pay/statements/[period]`, data from `loadStatement`.

- **Band:** the same compact band as Pay. Recorded pay, platform fee, sent, corrections and disputes stay separate figures; there is no new financial summary.
- **Lines:** one table with date, worker, job, basis, pay, fee and state, then a subtotal. On a phone it uses the stacked rows above.
- **Below the table:** payments sent, and corrections and disputes.
- **Status:** a closed or open pill beside Download CSV, which is the existing route.
- **States to capture when built:** an empty month, populated, long line descriptions, a correction or reversal recorded after closing, an inaccessible period, and a failed export.

## 4. Staff admin queues — `admin-1440.png`
Route `/admin`, guarded by `requireStaff`.

- **Staff shell:** the rail is in Text (`#0f172a`) rather than Eggplant and says "Not an organization view", so staff scope is never mistaken for an organization's. Text is already a locked colour; nothing new is added.
- **Band:** the queue counts.
- **Lists:** organizations to approve, then jurisdiction rules near expiry. The jurisdiction hard stop is stated in words.
- **Decisions:** each one keeps its required reason and audit entry, as today.
- **No person score anywhere.**
- **States to capture when built:** empty queue, pending, approved or rejected, an expired jurisdiction, required-reason validation, denied staff, and a long audit event.

## Questions for review
1. **Receipt:** is the document layout (facts as rows, lines, then a total) right for a worker? Or should the amount lead larger, as on Earnings?
2. **Dispute:** are the deadline chips ("First reply due Nov 4") the right weight for a worker? Should the organization side show both deadlines?
3. **Statement:** should each line carry its state ("Approved, not sent", "Sent", "Reversed") in the table, or should state live only in the band and the payments section?
4. **Admin:** is a Text-coloured staff rail distinct enough, or would you rather keep Eggplant and add a "Staff" label?
5. **Order:** I plan receipt, dispute, statement, admin, then the campaign and public pages, one reviewed slice each. Should anything move?
