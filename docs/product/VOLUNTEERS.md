# Volunteers: plan and schema proposal

Status: **approved by Caden, Nov 25 2026; being built slice by slice.** Volunteering cannot be switched on anywhere
until the last slice: see "Switching it on".

Asked for by Caden, Nov 25 2026: "a volunteer system so people can volunteer to knock doors outside of paid gigs".

## Decided by Caden (Nov 25)

1. **Paid and volunteer for the same organization: no.** A person cannot do both.
2. **Who sees volunteer history: the worker chooses.** Private unless they decide to show it.
3. **Volunteer work counts on the verified record:** yes, shown apart from paid work.
4. **Who can volunteer:** existing worker accounts. No lighter sign-up in the first version.
5. **Hired later (asked the same day):** someone who has volunteered for an organization may later be hired by it
   for pay. From then on they cannot volunteer for it, and their open volunteer sign-ups with it end.

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
- No payout row can be written for volunteer work, whatever the code does: a pay line is refused if the
  engagement, the shift or the approval it names belongs to a volunteer job.
- Volunteer jobs are door canvassing in the political or nonprofit sector only.
- **Added while building slice 1, for Caden's nod:** once anyone has ever applied to a job, been invited
  to it or been hired on it (including people who later withdrew or were declined), it cannot change between paid
  and volunteer. Otherwise a paid job with a crew could be turned into an unpaid one under
  them, or a volunteer job could start paying people who signed up to volunteer. The organization closes the job
  and posts a new one. The app says so on the form; the database refuses it whatever the code does.

The file was rehearsed by hand on a local database that predates it (existing jobs, payouts and sharing rows): it
ran clean twice, left every paid job untouched, and every existing sharing row came out as `NOBODY`. That run is
not in the repo's tests, which only re-run the file on a database that already has everything.

**Order matters.** The code reads the new sharing column, so the SQL has to be on the live database before any
deployment serves this code. Preview deployments use the live database too: until the SQL is run, this branch's
preview fails on Sharing, Matches and shared scorecards. Running the SQL first is safe for the code live today.

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

1. **Schema and rules.** The two changes above, `prisma/v1-volunteers.sql`, the publish rule (no rate; canvass
   only; method must be listed by the profile), a reviewed volunteer shift writes its validation and no pay line,
   acceptance suite `vol`.
2. **Posting and finding.** The job builder offers "Volunteer (unpaid)"; cards, the feed, the job page and embeds
   say "Volunteer"; a feed filter.
3. **Signing up.** "Volunteer" in place of apply/claim wording; the paid-or-volunteer rule on every way an
   engagement starts (apply, claim, invite, offer, accept); what the organization sees in Applicants.
4. **The day and review.** Shift page and Field board labels; review writes the validation and no payout; Pay,
   statements and earnings leave volunteer shifts out.
5. **Record and sharing.** The worker's record shows volunteer work apart from paid work; the Sharing page gains
   the volunteer setting; shared views honour it; matching ignores it. **Then the switch:** the staff rule-profile
   form gains the "Volunteer (unpaid)" box.

## Switching it on

Two locks, both closed until the last slice.

1. **A switch in the code** (`VOLUNTEERING_LIVE` in `src/lib/jobs.ts`, `false`). While it is off, the form refuses
   a volunteer job, a stored one cannot publish, and staff cannot list `VOLUNTEER` on a rule profile, whatever a
   request carries. It is a constant, not a setting, so production cannot be switched on by a stray environment
   variable; tests and local work turn it on with `TURFCUT_VOLUNTEERS=1`, which production ignores. The last slice
   sets it to `true`.
2. **The rule profile.** With the switch on, a volunteer job still publishes only where the profile lists
   `VOLUNTEER`, and the only way to list it is the box on the staff rule-profile form, also added by the last
   slice.

Until every slice is merged the app has gaps a live volunteer job would fall into (listed below), so nothing
half-built can be switched on. After that, volunteering is on in a place when Turfcut staff tick the box for that
place's profile on counsel's word, and nowhere else.

### Gaps the later slices close (why the switch stays off)

- Slice 2: the job builder has no volunteer option, and would turn a volunteer draft into an hourly one on save.
- Slice 3: nothing yet stops a person being paid by and volunteering for the same organization; a volunteer
  engagement would count as a working relationship for the "organizations I've worked with" sharing audience.
- Slice 4: the shift page still shows a pay step; a worker's earnings would list a volunteer shift at $0; a pay
  dispute could be opened on one; a volunteer review has no "final" state (that comes from pay lines today); job
  cards answer "is this payable" as if every job paid.
- Slice 5: the scorecard, shared scorecards, Matches and Applicants would show volunteer work to people the worker
  has not chosen. The sharing form does not carry the volunteer setting yet (saving it keeps the stored value, and
  no row means nobody); adding it means a new version of the consent text.

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
