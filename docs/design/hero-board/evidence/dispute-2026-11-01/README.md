# Dispute thread slice (#116, 2026-11-01)

All captures are from commit `3585af1` with a clean tree (`manifest.json`).
- **Worker page:** 390px, light and dark, full page.
- **Organization page:** 1440px, light.

DPR 2, clock frozen at 2026-10-30T19:00:00Z (a Friday), America/Denver. No horizontal overflow.

## Fixture
Synthetic, local preview database only. Four disputes Alex Rivera opened on the Oct 30 shift with Front Range Circulators, dated so the business-day clock lands in each state:

| Dispute | Opened | State at the frozen clock |
| --- | --- | --- |
| `…d0001` | Thu Oct 29 | before the first reply (first reply due Tue Nov 3) |
| `…d0002` | Tue Oct 27 | the organization replied Wed Oct 28 (next: resolve by Tue Nov 10) |
| `…d0003` | Thu Oct 22 | overdue (first reply was due Tue Oct 27; none sent) |
| `…d0004` | Tue Oct 20 | resolved Fri Oct 23, "Pay kept as it was", with the response |

## Against the review (#116)
- **One status badge.** The next deadline sits quieter beside it and comes from `clock.next`, so it moves to "resolve this" once the first reply is in. It turns red only when overdue and is gone once resolved.
- **Organization side:**
  - Both deadlines appear as labelled facts. The first reply reads "Due …" until a reply arrives, then "Met …".
  - Neither deadline shows once the dispute is resolved.
  - The business-day rule is stated under them.
- **Messages:** one list, in order, with author and time. The author is shown as name and role, or "You" for the viewer's own messages.
- **Reply box:** shown only when `canWrite`. A supervisor reads but cannot write, and a thread nobody can write in says "No messages." when empty.

`dispute-mockup-vs-built-390.png` compares the built page with the approved mockup at the same width. The built page adds the job, shift and organization facts that the mockup's header carried as one line.
