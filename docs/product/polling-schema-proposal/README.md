# Door-to-door polling: schema proposal (not approved, not applied)

**Status: proposal only.** Nothing here is a migration, and nothing is applied anywhere. The tables need Caden's approval
(CLAUDE.md rule 8) before any of it moves to `prisma/`, and any live SQL needs his separate OK. This folder is under
`docs/` on purpose: the tests read every `.sql` file in `prisma/`.

The plan and the review live on [issue #202](https://github.com/whiterican/TurfCut/issues/202): the review and PR order,
this schema with the reasoning behind each choice, and a UI guide. The board is
[#128](https://github.com/whiterican/TurfCut/issues/128).

| File | What it is |
|---|---|
| `polls.sql` | The proposed migration (5 tables, lock and append-only triggers, composite keys, RLS). Safe to run again. |
| `polls.prisma` | The same models for `schema.prisma`, with a placeholder `StopOutcome`. Validated with `prisma validate` on W1's schema plus these models. |
| `w2-stub.sql` | **Test only.** A stand-in for W2's stop outcome, which doesn't exist yet. Not part of the proposal. |
| `test.sql` | 54 checks: the lock, cross-job / cross-version / wrong-option refusals, append-only, corrections, the 30-day purge with poll rows present, RLS. |
| `run.sh` | Builds a throwaway database and runs the checks. |

## Run it
Needs a local Postgres (16 was used) and W1's SQL (`prisma/w1-walkbooks.sql`, still on branch
`claude/eager-albattani-v4wkxr` until W1 merges; see the usage note in `run.sh`).

```bash
PGURL=postgresql://postgres@localhost:5432 docs/product/polling-schema-proposal/run.sh
```

## What was verified, and what wasn't
Verified on Postgres 16.15 against W1's real SQL (branch head `a6b547ef`): the SQL applies twice cleanly; all 54 checks
pass on a clean rebuild; an edit that arrives while a lock is in flight waits, is refused and writes nothing (tested
with two real sessions).

Not verified: Prisma client queries, the repo's own acceptance harness (this is a standalone script), the other race
direction (a lock arriving during an edit), the `Job_activity_live` change described on #202, and anything against the
real W2.

## What changes when W2 is designed
Three places depend on W2's real shape, and are marked placeholders: `PollResponse.stopOutcomeId` (and the table it
points at), the cross-job trigger `poll_response_scope` (it joins `StopOutcome → Shift → Engagement`), and the rule that
a correction is a new W2 outcome row. W2 must name a stop by `(walkbookId, stopNumber)` with a key to `Walkbook` only,
never to `WalkbookStop`, so the 30-day address purge can run.

## If this becomes the polling acceptance suite
`test.sql` is written to be turned into `tests/acceptance/<name>.ts` in the style of `w1-walkbooks.ts` once the schema
is approved and moved to `prisma/`. Until then it only proves the design.
