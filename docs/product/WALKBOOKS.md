# Walkbooks (W1 and W2)

The one-pager's "bring your own data, to the door" wedge: an organization imports
an authorized address file, cuts it into numbered walkbooks on a job, hands each
to a worker hired on that job, and the worker records what happened at each
door. W1 and W2 are built and reviewed; Caden approved W1 on Nov 17 2026.

## Run the SQL before deploying

In this order, on the live Supabase project (both are safe to run again, and
both are already folded into `prisma/supabase-manual-setup.sql` for fresh
databases):

1. `prisma/w1-walkbooks.sql`
2. `prisma/w2-stop-outcomes.sql`

Neither has been applied to production by an agent.

## What is stored, and what is not

- **Addresses only** (CLAUDE.md rule 4). `src/lib/walkbooks.ts` maps the
  file's headers to address parts and drops every other column by name before
  any row is read. Only the dropped columns' *names* are recorded on the
  import, so the organization can see what was left out. A second address line
  is kept only if it is shaped like a unit; "C/O Jane Doe" never lands.
- **Provenance**: each import records its source, purpose and license as the
  uploader stated them, and that they are authorized to use it. The file
  itself is not kept.
- **No geocoder**: a stop is on the map only when the file supplied its
  latitude and longitude.
- **Outcomes are a closed set.** `StopOutcomeAnswer.key` is checked in the
  database to be `talked_to`, `left_literature` or `signatures`. There is no
  free text and no recorded opinion of a resident. Adding a field is a
  reviewed change to the SQL file and the schema, not a string the app can
  invent.

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
- **Polling is not built.** It records residents' answers, which needs its own
  decision on who can read them and for how long. It stays planned until then.
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

## Where things are

| | |
|---|---|
| Import, cut, hand-over | `src/lib/walkbooks-data.ts`, `src/app/jobs/[jobId]/walkbooks/` |
| Recording and progress | `src/lib/stop-outcomes-data.ts`, `src/app/walkbooks/` |
| Console | `src/lib/stop-console.ts`, `src/lib/stop-console-data.ts`, `src/app/jobs/[jobId]/walkbooks/console/`, `src/components/stops/ConsoleParts.tsx` |
| Screens | `src/components/stops/`, `src/components/staff/Walkbook*.tsx`, `src/components/WalkbookStops.tsx` |
| Acceptance checks | `tests/acceptance/w1-walkbooks.ts`, `w2-stop-outcomes.ts`, `w3-console.ts` (`run.sh w1 w2 w3`) |

## Known limits

- The staff job page reads the newest outcome of every stop on the job in one
  query: about 1 s at 100,000 stops. Fine for the pilot; cache per-book
  progress before it grows.
- The worker's shift page lists book names and counts only. That page is saved
  for offline use, and a saved copy would keep addresses on the phone after a
  book is taken back; the stops live on `/walkbooks`, which is never saved.
