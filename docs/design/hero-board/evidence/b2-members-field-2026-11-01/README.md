# B2 — Members and Field state evidence (2026-11-01)

These captures answer the #113 review's evidence asks:
- **Members:** several rows, a long name and email, waiting and expired invitations, and a delegated role.
- **Field:** a two-job fixture plus the empty, error and permission states.

Source: every capture is from commit `8eaa278` with a clean tree (`manifest.json` → `source.clean: true`).
Captures are at DPR 2, with the clock frozen at 2026-10-30T19:00:00Z in America/Denver, and every one has zero horizontal overflow.

Fixtures are synthetic and exist only in the local preview database, never live Supabase. Emails use made-up organization domains.

## Members (`members/`)

The organization is Front Range Circulators. It has five members:

| Member | Role |
| --- | --- |
| Dana Ortiz | Owner |
| Priya Raman | Recruiter |
| Marisol Esperanza de la Cruz-Whitfield (long name, 88-character email) | Custom role "Field lead": field and members full, desk and jobs read, messages full |
| Theo Nguyen | Finance |
| Jordan Lee | Custom role "Door captain": field read, messages full |

It has three invitations:
- A Supervisor invite, waiting.
- A Door captain invite to an 84-character address, waiting.
- An Owner invite that expired on 2026-10-22.

| Capture | Signed in as | What it shows |
| --- | --- | --- |
| `members-populated-*` | Owner | Every row is actionable. The 390 captures are full page; `-list-1440` is scrolled to the member list. |
| `members-delegate-delegated-*` | Field lead (delegated) | Resend/Revoke only on the Door captain invite. Every other row says why it isn't theirs to change. They can change only the Door captain (`withinReach`). Their own row offers "Leave organization". |

The 390 captures are full page, so the floating dock appears at its viewport position partway down. That is how a full-page capture draws a fixed element; the page itself has no such gap.

**Permission denied:** a Door captain has no members area. On `/org/settings/members`, `requireArea` sends them to `/dashboard` and on to the first page their role reaches, which is `/field` (see `field-captain-read-only-*`). The preview harness can't follow that last, unprefixed hop, so there is no separate capture of it. The redirect happens with no explanation. That gap is listed for the follow-up PR, not changed here.

## Field (`field/`)

Org 001 now has two jobs in the field window:
- **Denver Ballot Initiative (Civic Center):** its one shift has ended, with 22 signatures and 40 doors.
- **Cheesman Park Library Hours, door canvass:** one shift is checked in now through a real `CHECK_IN` work event, and one is scheduled tomorrow.

| Capture | Who | State |
| --- | --- | --- |
| `field-two-two-jobs-*` | Owner | Both turfs on the map and as cards. "1 of 2 shifts checked in now" on Cheesman Park. |
| `field-job-one-job-*` | Owner | `?job=` filtered to the Cheesman Park job. Figures, map and cards are scoped before any cap. |
| `field-empty-empty-*` | Owner of an organization with no shifts in the window | Zero figures and "No assigned turf to show." |
| `field-captain-read-only-*` | Door captain (field read) | A two-item rail (Field, Messages). Review queue is readable at `read` level. |
| `field-error-error-*` | Owner, database stopped | The last-resort `global-error` page. It is deliberately self-contained (inline styles, no app CSS) because the root layout itself fails. Restyling it is listed for the follow-up PR. |

**Fixed while gathering this evidence:** a turf card covering shifts on two days read "Running Oct 30, 11:30 AM – 2:00 PM", even though it ends on Oct 31 (`fb1b60d`).
The same happened to any overnight shift, which can last up to 14 hours.
Every start–end range now dates its end when the end falls on another day (`8eaa278`), with `sameDay` tests including a DST change.
