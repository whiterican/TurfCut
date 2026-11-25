# Volunteers: plan and schema proposal

Status: **proposal, waiting on Caden's approval of the schema changes.** Nothing is built.

Asked for by Caden, Nov 25 2026: "a volunteer system so people can volunteer to knock doors outside of paid gigs".

## Decided by Caden (Nov 25)

1. **Paid and volunteer for the same organization: no.** A person cannot do both.
2. **Who sees volunteer history: the worker chooses.** Private unless they decide to show it.
3. **Volunteer work counts on the verified record:** yes, shown apart from paid work.
4. **Who can volunteer:** existing worker accounts. No lighter sign-up in the first version.

## The idea

A volunteer opportunity is a job with no pay. The organization posts it, people sign up, and from there it is a
normal job: shifts, check-in, turf, the Field map, reviewed and verified doors. Pay never applies.

First version: **door canvassing only**. Petition circulation by volunteers has its own state rules and is not
offered. Jobs in the private sector cannot be volunteer jobs (that sector is not live today either).

## Schema changes to approve

Two changes, no new tables.

1. **`CompensationMethod` gains `VOLUNTEER`.**
   A job with this method has no pay rate. It rides the existing rule that a job's pay method must be one its
   jurisdiction's rule profile lists (`rules.compensationAllowed`): no profile lists `VOLUNTEER` today, so a
   volunteer job cannot publish anywhere until Turfcut staff add it to a profile on counsel's word. That is working
   agreement 6 (jurisdiction hard stop) with nothing new to build.

2. **`WorkerSharing` gains `volunteerAudience ShareAudience`, default `NOBODY`.**
   The worker's own setting for who may see their volunteer history, beside the existing audiences. Like the others
   it is a new version each time it changes (append-only, working agreement 3).

Database rules that go with them (SQL in `prisma/v1-volunteers.sql`, run on the live project by Caden's word before
the code deploys, and safe to run twice):

- A volunteer job must have no pay rate; a paid job is unchanged.
- No payout row can be written for a shift on a volunteer job, whatever the code does.
- Volunteer jobs are door canvassing in the political or nonprofit sector only.

## Rules in the app

- **Paid or volunteer, never both, per organization.** A worker who has any paid engagement with an organization
  (applied, invited, offered, hired or worked, at any time) cannot sign up to volunteer for it. A worker who has
  volunteered for an organization can still be hired by it for pay; from then on they cannot volunteer for it, and
  their open volunteer sign-ups with it end (a new event each, nothing rewritten). This is the strict reading of
  decision 1. Whether the law needs "at any time" or only "at the same time" is a question for counsel; loosening
  it later is a one-line rule change.
- **Never a political signal.** Volunteer history is not used by matching, ranking or any fit signal, with or
  without the sharing setting (working agreement 4). The setting only decides who may *see* it.
- **Seen by default by two parties only:** the worker, and the organization they volunteered for (it scheduled and
  reviewed that work).
- **No pay anywhere.** No pay rate on the job, no pay line on a reviewed shift, nothing in Pay, statements,
  earnings or disputes. A reviewed volunteer shift still gets its validation, so the doors are verified.
- **Always labelled.** "Volunteer" on the job card, the job page, the shift, the Field board and the worker's
  record, so unpaid work is never read as a paid gig, and the other way round.
- **No universal score** (working agreement 5): volunteer totals are shown as their own counts, never blended into
  a rate or rank.

## Slices

Each is its own reviewed PR, in this order.

1. **Schema and rules.** The two changes above, `prisma/v1-volunteers.sql`, the publish rule (no rate; method
   must be listed by the profile), the admin rule-profile form lists the new method, acceptance suite.
2. **Posting and finding.** The job builder offers "Volunteer (unpaid)"; cards, the feed, the job page and embeds
   say "Volunteer"; a feed filter.
3. **Signing up.** "Volunteer" in place of apply/claim wording; the paid-or-volunteer rule on every way an
   engagement starts (apply, claim, invite, offer, accept); what the organization sees in Applicants.
4. **The day and review.** Shift page and Field board labels; review writes the validation and no payout; Pay,
   statements and earnings leave volunteer shifts out.
5. **Record and sharing.** The worker's record shows volunteer work apart from paid work; the Sharing page gains
   the volunteer setting; shared views honour it; matching ignores it.

## Not in the first version

- Sign-up without a worker account, or a public volunteer link.
- Volunteer petition circulation.
- Hour certificates, expense reimbursement, or anything of value given to volunteers. (Reimbursement would touch
  the pay ledger and campaign-finance reporting; it needs its own decision.)
- Notifications specific to volunteering.

## For counsel

- Whether a campaign's paid worker may volunteer for the same campaign at another time, and if so under what
  separation (the app blocks it entirely until told otherwise).
- Per state: whether volunteer door canvassing needs anything the rule profile should record (registration,
  badges, disclaimers), before `VOLUNTEER` is added to that state's profile.
