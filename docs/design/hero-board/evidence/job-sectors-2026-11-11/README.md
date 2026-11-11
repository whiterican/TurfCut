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

Existing jobs were labelled from their type: petitions as petition circulation, canvasses as door-to-door canvassing, all political and in the field. Nothing else about them changed.

## The hard stop

Only the two live activities can be stored. A check in the database refuses every other combination: 142 of the 144 possible ones. So:

- a sales job cannot be stored at all yet, not as sales and not as canvassing in the private sector;
- a planned activity can never be passed off as a live one;
- each new activity becomes storable only in the slice that builds it end to end, which loosens the check in its own reviewed migration.

`src/lib/job-taxonomy.ts` holds the same rule for the app, with a sentence for each refusal. A unit test compares that table with the database check, and an acceptance script tries all 144 combinations against a real database.

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

## Checked

- 1,092 unit tests pass (8 new).
- The whole acceptance suite passes on fresh databases, including a new script (`p3`, 7 checks) that tries all 144 combinations.
- No screen changed, so there are no screenshots.
