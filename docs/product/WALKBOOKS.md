# Walkbooks (W1 and W2)

The one-pager's "bring your own data, to the door" wedge: an organization imports
an authorized address file, cuts it into numbered walkbooks on a job, hands each
to a worker hired on that job, and the worker records what happened at each
door. W1 and W2 are built and reviewed; Caden approved W1 on Nov 17 2026.

## Run the SQL before deploying

In this order, on the live Supabase project (each is safe to run again, and
all are already folded into `prisma/supabase-manual-setup.sql` for fresh
databases):

1. `prisma/w1-walkbooks.sql`
2. `prisma/w2-stop-outcomes.sql`
3. `prisma/w5-polls.sql`

`w1-walkbooks.sql` already includes the keep-every-column and purge changes and
also upgrades a database that ran its first version. Add `CRON_SECRET` to the
project (the proof purge needs it too) so the daily purge can run.

Neither has been applied to production by an agent.

## What is stored, and what is not

Caden decided on Nov 17 2026 to store the source record ID and keep every
column of an imported file, with names and addresses deleted after 30 days. This
reverses the first version of W1 (addresses only).

- **Stored with each row**: the address; the source record ID (an Ecanvasser
  Contact ID or VanID, found by header name) so a return file can be matched; and
  every other column, header to value (`ImportedAddress.sourceData`, at most 60
  columns and 16 KB a row, values cut at 500 characters). These columns hold
  names, phone numbers, party and vote history: the most sensitive data in the
  system.
- **Never stored**, whatever the file says: government ID numbers, birth dates,
  and payment and password columns (`isNeverStored` in `src/lib/walkbooks.ts`).
  They are listed by name on the import, so the organization sees what was left
  out. Columns past the first 60, or cut to fit a row, are listed too.
- **Where they may be read**: only the importer that writes them, the purge that
  deletes them, and the staff export (the record ID only). `src/lib/walkbook-isolation.test.ts`
  fails if any other file names `sourceData` or `sourceRecordId`, if any
  worker-facing or matching/scoring code touches the import tables, or if a query
  selects an address whole. They are never sent to a worker's phone, and never
  used to match, score or rank anyone (rules 4 and 5). Nothing in the app shows
  `sourceData` to anyone: it is held for matching the firm's return file and goes
  when the address does.
- **Deletion**: 30 days after the import (`AddressImport.deleteAfter`), sooner if
  the organization deletes the file ("Delete names and addresses now"), or when
  every job the file was cut for has closed. `purgeImport` deletes the
  `ImportedAddress` rows only; `purgedAt` says when. The walkbooks, stops, outcomes
  and poll answers stay, keyed by walkbook and stop number
  (`WalkbookStop.addressId` is nullable, `ON DELETE SET NULL`); a stop without an
  address shows "Address deleted". A daily cron (`/api/cron/purge-imports`,
  `vercel.json`, `CRON_SECRET`) runs it. A deleted file can't be cut again: import
  it again. **Export the return file inside the 30 days**: the record IDs go with
  the addresses.
- **Provenance**: each import records its source, purpose, license, and the
  system it came from, as the uploader stated them, and that they are authorized.
  The file itself is not kept.
- **Arizona**: A.R.S. 16-168 limits voter-list data to political use and bars
  posting it online. A file with Arizona addresses needs an extra acknowledgement
  to import (`ackAZ`). Whether a web app counts under that statute is unresolved by
  its text (see `docs/compliance/VOTER_DATA_AND_POLLING_LEGAL_NOTES.md` once merged).
  Keep row content out of logs and error reports: skipped-row reasons and audit
  events carry row numbers and counts only.
- **No geocoder**: a stop is on the map only when the file supplied its
  latitude and longitude.
- **Outcomes are a closed set.** `StopOutcomeAnswer.key` is checked in the
  database to be `talked_to`, `left_literature` or `signatures`. There is no
  free text and no recorded opinion of a resident.

## Append-only (rule 3)

`WalkbookAssignment`, `StopOutcome` and `StopOutcomeAnswer` refuse UPDATE,
DELETE and TRUNCATE in the database. Who holds a book, and what happened at a
stop, are the newest rows; a correction is a new row. Writers take the
per-walkbook advisory lock (`walkbook:<id>`, keyed on the id the database
returns, in lower case) and stamp each row strictly after the one it
supersedes, so "newest wins" never ties.

## The colour code

`src/lib/stop-outcomes.ts`. Every colour has a word and a glyph too. The unit
test checks 4.5:1 for the text on each fill and 3:1 for each fill against the
light card and the night card, so a new colour has to pass.

## Work types

- Door canvassing (including literature drops): `talked_to` on a Done;
  `left_literature` on a Done or a Not home.
- Petition circulation: `signatures` (0 to 50) on a Done.
- **Polling** is a tool on canvass jobs (W5, below), not a job type. Door-to-door
  polling as a job category stays planned.
- Offline taps are not built. A replayed tap is ordered by when the server
  receives it; offline support needs a client timestamp (see the W2 review).

## The console (W3)

`/jobs/[jobId]/walkbooks/console`, for people with access to the field area.
Read-only: it never changes a stop. A job-level table of every stop (50 a
page) with filters by outcome, walkbook and who holds the book (including
"nobody"), a map of the filtered stops, and an inspector that opens any stop's
whole history, newest first. The outcome chips count the whole job; filters
narrow the table and map only.

- **Workers table**: "holds now" (books handed to them) and "recorded" (stops
  whose newest outcome they recorded) are shown apart, because a book carries
  its state to its next holder: a hand-on moves the book, never the credit.
  There is no total, percentage or ranking of people (rule 5).
- **Export** (`.../console/export`): the filtered stops as CSV, for full
  access to the field area only. Addresses, outcomes, the three closed fields,
  the time and the holder's name; no ids or notes. Cells that look like a
  formula are neutralised (same guard as the finance export). Capped at
  20,000 rows (a bigger job is exported book by book), ten an hour per
  organization, and every attempt, refusals included, is an audit event with
  the filters and row count but never the contents.

## Polling at the door (W5)

Caden's decisions (Nov 17 2026): answers can be read and edited after
recording; staff with full access to the field area and the recording worker
can read them; org-defined choice questions only, no free text; kept until
the organization deletes the job's data. Schema approved.

- **Questions** (`PollQuestion`, `PollChoice`): set up by job editors on a
  canvass job, up to 10, each with 2 to 8 fixed choices. Append-only: changing
  a question adds a new one that supersedes it; the old wording and its answers
  stay as "earlier wording". "Declined" is built in.
- **Answers** (`PollAnswer`): a choice or "declined", per stop and question,
  recorded on a stop whose newest outcome is Done. **An edit is a new row**
  (rule 3): the newest row is the answer now; every earlier answer, who gave it
  and when, stays. There is no text column, so no note about a person can be
  stored; the database also refuses a choice of another question.
- **Who reads and edits:**
  - Staff with *full* access to the field area read, edit, see per-question
    results and export answers. Reading them (a stop's history, the results) and
    exporting leaves an audit row, never the contents. Recruiters, finance and
    view-only roles never see them.
  - A worker reads and edits only answers *their own engagement recorded*, on a
    book they hold, for a door they recorded as Done themselves. An answer
    someone else recorded is refused alike whether they guess or overwrite: staff
    change it. After a take-back or hand-on the old holder loses access.
- **Results** are counts per question in the poll's own order. Nothing is
  combined across questions, split by worker, ranked or scored (rules 4 and 5).
- **Export**: one column per current question ("Poll 1: ..."), answers in words,
  full field access only. With poll columns the file carries no worker name and
  no time, so it can't be pivoted into a per-worker breakdown of what residents
  said (rule 5). Answers given to *earlier wording* of a changed question are not
  exported (they stay visible in the console history).
- **Not enforced by the database** (the app does): that an answer's stop and its
  question belong to the same job. A composite key would need approval.
- Retention is "until the organization deletes the job's data": there is no
  automatic purge, and append-only means removal would need its own decision.

## Where things are

| | |
|---|---|
| Import, cut, hand-over | `src/lib/walkbooks-data.ts`, `src/app/jobs/[jobId]/walkbooks/` |
| Recording and progress | `src/lib/stop-outcomes-data.ts`, `src/app/walkbooks/` |
| Console | `src/lib/stop-console.ts`, `src/lib/stop-console-data.ts`, `src/app/jobs/[jobId]/walkbooks/console/`, `src/components/stops/ConsoleParts.tsx` |
| Polling | `src/lib/poll.ts`, `src/lib/poll-data.ts`, `src/components/staff/PollSetup.tsx`, `src/components/stops/{PollFields,WorkerPollForm,StaffPollForm,PollConsole}.tsx`, `prisma/w5-polls.sql` |
| Screens | `src/components/stops/`, `src/components/staff/Walkbook*.tsx`, `src/components/WalkbookStops.tsx` |
| Acceptance checks | `tests/acceptance/w1-walkbooks.ts`, `w2-stop-outcomes.ts`, `w3-console.ts`, `w5-polls.ts` (`run.sh w1 w2 w3 w5`) |

## Known limits

- The staff job page reads the newest outcome of every stop on the job in one
  query: about 1 s at 100,000 stops. Fine for the pilot; cache per-book
  progress before it grows.
- The worker's shift page lists book names and counts only. That page is saved
  for offline use, and a saved copy would keep addresses on the phone after a
  book is taken back; the stops live on `/walkbooks`, which is never saved.
