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
| `test.sql` | 65 checks: the lock and what a version needs to lock, cross-job / cross-version / wrong-option refusals, append-only, corrections, the 30-day purge with poll rows present, RLS. |
| `run.sh` | Builds a throwaway database and runs the checks. Refuses a non-local server unless `ALLOW_REMOTE=1`. |

## Run it
Needs a local Postgres (16 was used) and W1's SQL (`prisma/w1-walkbooks.sql`, still on branch
`claude/eager-albattani-v4wkxr` until W1 merges; see the usage note in `run.sh`).

```bash
PGURL=postgresql://postgres@localhost:5432 docs/product/polling-schema-proposal/run.sh
```

## What was verified, and what wasn't
Verified on Postgres 16.15 against W1's real SQL (branch head `a6b547ef`): the SQL applies twice cleanly; all 65 checks
pass on a clean rebuild; an edit that arrives while a lock is in flight waits, is refused and writes nothing (tested
with two real sessions).

An independent review of this folder found two defects in the first version of `polls.sql` (the one pasted on #202), both
reproduced and fixed here, each with a test that fails without the fix: a response could supersede itself, which drops its
door from every count and can't be repaired (the table is append-only); and a version could be created already locked, or
lock empty or with a CHOICE question that has no options, which is permanent once locked. **Use these files, not the SQL
pasted in the #202 comment.**

Not enforced by the database, by design: that a COMPLETE response answers every `required` question (the app does that,
and the acceptance suite should test it). Not verified: Prisma client queries, the repo's own acceptance harness (this is a standalone script), the other race
direction (a lock arriving during an edit), the `Job_activity_live` change described on #202, and anything against the
real W2.

## What changes when W2 is designed
Four places depend on W2's real shape, and are marked placeholders: `PollResponse.stopOutcomeId` (and the table it
points at), the cross-job trigger `poll_response_scope` (it joins `StopOutcome → Shift → Engagement`), the rule that a
correction is a new W2 outcome row, and a check that a correction supersedes a response from the **same door**. Today a
correction only has to be on the same poll version, so it could supersede a response from another door or another
person; the same-door check needs W2's correction link, so it isn't written yet. W2 must name a stop by `(walkbookId, stopNumber)` with a key to `Walkbook` only,
never to `WalkbookStop`, so the 30-day address purge can run.

## If this becomes the polling acceptance suite
`test.sql` is written to be turned into `tests/acceptance/<name>.ts` in the style of `w1-walkbooks.ts` once the schema
is approved and moved to `prisma/`. Until then it only proves the design.
