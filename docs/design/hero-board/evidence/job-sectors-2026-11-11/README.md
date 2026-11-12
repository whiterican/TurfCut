# Sector, activity and place of work on jobs (Nov 11 2026)

Caden, Nov 10: start the private-sector side (door-to-door sales, cold calls), and approved the data-model change: "separate sector and work-activity fields on jobs so a sales job is never stored as canvassing".

This is the foundation slice. It changes what a job **records**; it does not yet let anyone post a sales job. Nothing on screen changes.

## What a job now says about itself

| Field | Values | Meaning |
| :--- | :--- | :--- |
| `sector` | Political, Nonprofit, Private | Who the work is for. Stated by the organization, never inferred. |
| `activity` | The founder's eight activities | What the work is. |
| `workMode` | In the field, Remote, On site | Where it happens. |
| `type` (unchanged) | Petition, Canvass | How the work is counted: signatures or doors. |

Existing jobs are labelled from their type: petitions as petition circulation, canvasses as door-to-door canvassing, all political and in the field. Nothing else about them changes: no change record, notification or audit entry is written, and their last-edited time stays as it was.

That label is assigned by the migration, not stated by each organization: every job so far is political field work because that is all the platform has offered. **Caden, before this is applied to the live database:** if any live organization's canvassing job is really nonprofit outreach, say so. The migration marks them all political.

## The hard stop

Only the two live activities can be stored. A check in the database refuses every other combination: 142 of the 144 possible ones. So:

- a sales job cannot be stored at all yet, not as sales and not as canvassing in the private sector;
- a planned activity can never be passed off as a live one;
- each new activity becomes storable only in the slice that builds it end to end, which loosens the check in its own reviewed migration.

`src/lib/job-taxonomy.ts` states the same rule in the app's terms, with a sentence for each refusal. Nothing on screen calls it yet, because nothing on screen offers a choice: the app writes the two live combinations itself. Today it is what the tests hold the database to. A unit test requires the check's text to be exactly what that table produces, and an acceptance script tries all 144 combinations against a real database and compares each with the table.

**One definition.** The check and its trigger function are defined in `p3-sectors.sql` (and its copy in the setup file) and nowhere else; a test refuses a second definition. The slice that makes sales live edits that file. If it redefined the check in a file of its own, re-running this one would silently undo it.

## Why sales is not switched on in this slice

Three things have to exist first, each its own slice:

1. **Counting.** Everything from the field day to scorecards assumes work is signatures or doors. Sales needs its own outcomes (door result, lead, appointment, sale), and a worker's sales record must stay separate from their canvassing record: no universal score, activity-specific history (rule 5).
2. **Rules.** A job cannot publish without an approved jurisdiction rule profile (rule 6). Commercial door-to-door and phone sales have their own rules: solicitation licences, no-soliciting lists, Do-Not-Call, call-recording consent, contractor or employee classification, commission disclosure. Those profiles need counsel's approval; Claude cannot approve them.
3. **Pay.** Commission is its own later milestone. Until then pay stays verified time or accepted units.

## Data model (rule 8: approved by Caden)

`prisma/p3-sectors.sql`, folded into `prisma/supabase-manual-setup.sql`:

- Three enums: `Sector`, `WorkActivity`, `WorkMode`.
- `Job.sector` (default Political), `Job.activity` (required), `Job.workMode` (default In the field).
- A trigger fills `activity` from `type` when a row arrives without one, and moves it when the type changes.
- The check `Job_activity_live`, and an index on sector and activity.

Safe to run twice and in one transaction. Not yet applied to live Supabase; applied just before merge.

## Review (rule 9)

A separate Claude reviewer built a database shaped like master's, with jobs of both types in every status, and applied the migration to it once, twice, in one transaction and as one statement. It found the migration safe, with no change record, audit entry or notification written, and these gaps, fixed in the second commit:

| Finding | Fix |
| :--- | :--- |
| The setup file's copy of the check was pinned by nothing | A test requires the setup file to carry the migration word for word |
| The unit test's comparison could be fooled by an edited check | It now compares the check's whole text |
| Re-running this file would silently undo a later slice that redefined the check elsewhere | One definition, enforced by a test and written into the file's header |
| The app's rule was described as wired into the app; it is not yet | Said plainly here and in the code |
| The migration held its lock with no limit on waiting | It gives up after 5 seconds instead of queueing every read of jobs |
| `prisma db push` would drop the column's NOT NULL | Warned against in the schema |

Left for the slice that adds the first new activity: the trigger moves an activity with its type, which is right while each type means one activity and wrong once it does not; and the two column defaults should go once a second sector is live.

## Checked

- 1,094 unit tests pass (10 new).
- The whole acceptance suite passes on fresh databases, including a new script (`p3`, 7 checks) that tries all 144 combinations and counts a refusal only when the hard stop itself refused.
- **The labelling of existing rows** is not exercised by the acceptance suite (it builds the tables before any job exists). It was run by hand, by the reviewer, on a master-shaped database: 9 jobs, 5 petitions and 4 canvasses, all labelled correctly.
- No screen changed, so there are no screenshots.
