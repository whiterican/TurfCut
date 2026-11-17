# Door-to-door polling: schema proposal (not approved, not applied)

**Status: proposal only.** Nothing here is a migration, and nothing is applied anywhere. The tables need Caden's approval
(CLAUDE.md rule 8) before any of it moves to `prisma/`, and any live SQL needs his separate OK. This folder is under
`docs/` on purpose: the tests read every `.sql` file in `prisma/`.

The plan and the review live on [issue #202](https://github.com/whiterican/TurfCut/issues/202): the review and PR order,
the schema with the reasoning behind each choice, and a UI guide. The board is
[#128](https://github.com/whiterican/TurfCut/issues/128). **Use the files in this folder, not the SQL pasted in the
first schema comment on #202** (a review found two defects in it; see "Fixed in review").

## Decisions this reflects (Caden, Nov 17, 2026)
- **Store the source record ID** (Ecanvasser Contact ID / VanID) with each imported address.
- **Keep every column of an imported file**, not address columns only.
- **Poll answers have no expiry.** (They are append-only, and after the purge they are keyed to a stop number only.)
- **Names and addresses are still deleted after 30 days** (or sooner: job closed, license limit). That deletion now covers
  the record ID and every stored column too, because they live on the same row.

## Files
| File | What it is |
|---|---|
| `polls.sql` | The poll tables: 5 tables, lock and append-only triggers, composite keys, RLS. Safe to run again. Keyed to W2's real `StopOutcome`. |
| `polls.prisma` | The same models. Validated with `prisma validate` against W1's and W2's real models (branch `claude/eager-albattani-v4wkxr`, head `648e7ea4`; the two SQL files are unchanged since `0f6b348f`). |
| `w1-amendments.sql` | **Changes W1 would need**, written as ALTERs only so they can be tested on W1's real SQL. W1's SQL isn't applied yet, so the W1 session would fold them into `w1-walkbooks.sql`. See below. |
| `purge-conflict.sql` | A negative control: proves W1 + W2 **as written** can't run the 30-day purge. |
| `test.sql` | 85 checks. |
| `race.sh` | A two-session check that a lock can't slip past an edit in flight. |
| `run.sh` | Builds a throwaway database and runs everything. Refuses a non-local server unless `ALLOW_REMOTE=1`. |

## The purge conflict, and the fix
`w2-stop-outcomes.sql` keys `StopOutcome.stopId` to `WalkbookStop` with `ON DELETE RESTRICT`, and stop outcomes are
append-only. So a book's stops can never be deleted once any stop has an outcome, and `ImportedAddress` rows can't be
deleted while a stop still points at them (`WalkbookStop.addressId` is `RESTRICT` too). **The 30-day purge as designed,
deleting the rows, can't run.** `purge-conflict.sql` reproduces the stop deletion failing on W1's and W2's real SQL.

(Overwriting the rows in place does work on W1 + W2 as written: `ImportedAddress` isn't append-only, and a review
overwrote the street, city, state, ZIP, point, record ID and stored columns with placeholders without tripping a CHECK. It
needs no schema change, but it leaves placeholder rows and makes `AddressImport.rowCount` meaningless. Deleting is cleaner;
overwriting is the fallback if W1's SQL is applied before the fix lands.)

The fix is small, because `WalkbookStop` holds no personal data (the address is on `ImportedAddress`): make
`WalkbookStop.addressId` nullable with `ON DELETE SET NULL`, and purge by deleting `ImportedAddress` rows only. The stop,
its outcomes and every poll row stay, keyed by book and stop number. Screens that list a stop must cope with a stop that
has no address after the purge. **If the fix is folded into W1, its code changes too** (found on branch head `648e7ea4`; the
first three I checked myself, the rest are a reviewer's grep that I haven't re-checked): `prisma/schema.prisma` (`addressId
String` and `onDelete: Restrict` at lines 1697-1698 become `String?` and `SetNull`, which makes `WalkbookStop.address`
nullable), `src/lib/walkbooks.ts` (`walkOrder` calls `splitHouseNumber(s.line1)` on every stop, which breaks on a stop whose
address is gone), `src/lib/walkbooks-data.ts` (`notOnJob`, line 99, inner-joins `ImportedAddress`, so a purged stop silently
stops counting as "already on this job" and re-cutting the same address makes a new stop; plus `STOP_SELECT` and the spreads
of `s.address`, and the importer's write path where the new columns go), and the components that render stops
(`WalkbookStops.tsx`, `stops/StopLine.tsx`, `stops/RecordableStop.tsx`). Also added: `AddressImport.deleteAfter` (default 30 days), `purgedAt`, `sourceSystem`, and
`ImportedAddress.sourceRecordId` and `sourceData` (every other column of the row, at most 16 KB).

**What "keep every column" means for W1** (details on #202): it reverses W1's "columns are dropped in the browser before
anything is sent" promise, so the parser, the writer, the UI copy and `droppedColumns` all change. The stored columns
(names, phone numbers, party, vote history) must never reach a worker's phone or any matching, scoring or ranking code:
keep explicit field selects, and add an isolation test in the style of `job-marks-isolation.test.ts`. The record ID is
deleted with the address, so a return CSV has to be exported inside the 30 days. I haven't verified the legal side (many
states limit voter-list use; counsel should confirm before a real voter file is imported).

## Run it
Needs a local Postgres (16 was used) and W1's and W2's SQL (`prisma/w1-walkbooks.sql`, `prisma/w2-stop-outcomes.sql`, still
on the branch until they merge; see the usage note at the top of `run.sh`).

```bash
PGURL=postgresql://postgres@localhost:5432 docs/product/polling-schema-proposal/run.sh
```
Once W1/W2 contain the purge fix, `run.sh` prints "purge control: NOT reproduced"; delete `purge-conflict.sql` then.

## What was verified, and what wasn't
Verified on Postgres 16.15 against W1's and W2's real SQL: the amendments and the poll SQL each apply twice cleanly; all 85
checks pass on a clean rebuild; the race check passes (an edit that arrives while a lock is in flight waits, then is refused
and writes nothing). I also broke things on purpose and confirmed the right checks go red: without the purge fix, the three
purge checks fail; without the outcome and same-stop rules, six poll checks fail; with the job check loosened to the
engagement only, the new stop-in-another-job check fails.

**Fixed in review.** A separate review found two defects in the first version of `polls.sql` (the one pasted on #202), both
reproduced and fixed, each with a test that fails without the fix: a response could supersede itself (its door then vanishes
from every count, and an append-only row can't be repaired), and a version could be created already locked, or lock empty
or with a CHOICE question that has no options.

Not verified: Prisma client queries; the repo's own acceptance harness (this is a standalone script); the other race
direction (a lock arriving during an edit); the `Job_activity_live` change described on #202; any app code. Not enforced
by the database, by design: that a COMPLETE response answers every `required` question (the app does that, and the
acceptance suite should test it).

## Design choices on top of W2 that are mine, not W2's
A COMPLETE poll needs a `DONE` stop outcome; a PARTIAL poll needs `COME_BACK` or `REFUSED` (`poll_response_scope`). A
correction must be on the same stop as the response it supersedes. The door must be on the poll's job **both** through the
outcome's engagement and through its stop's walkbook, because W2's SQL doesn't tie the two together. W2's owner or Caden may
want different rules; each is one branch of that trigger and one pair of checks.

**One current response per stop is a results rule, not a database rule.** A stop can be visited twice (a PARTIAL poll at a
`COME_BACK`, then a COMPLETE at `DONE`), so two responses on one stop are allowed. Results use, per stop, the response that
nothing supersedes, **a COMPLETE one before a PARTIAL one, then the one on the newest stop outcome** (W2's own meaning of
"newest"), not the one inserted last. Tested on three cases: a correction of an older PARTIAL visit doesn't beat a newer
COMPLETE; a poll that reaches the server late for the oldest visit doesn't beat a newer visit; a superseded response is never
current. A poll attaches to the outcome row it is given, not only the stop's newest one.

**A limit that is W2's, not this proposal's:** `StopOutcome.createdAt` is the server's insert time, and W2 stores no device time.
So an outcome recorded offline that reaches the server late looks newest to W2's own "newest row is the state" rule, and to the
results rule here. If that matters, W2 needs a device-time column.

## If this becomes the polling acceptance suite
`test.sql` is written to be turned into `tests/acceptance/<name>.ts` in the style of `w1-walkbooks.ts` once the schema is
approved and moved to `prisma/`. Until then it only proves the design.
