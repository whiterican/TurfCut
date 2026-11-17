#!/usr/bin/env bash
# One concurrency check for polls.sql, with two real sessions (run.sh calls it after test.sql). Usage: race.sh <database-url>
# A draft poll has one valid question. Session A adds a CHOICE question with no options and holds its transaction open.
# Session B tries to lock the version meanwhile. The lock must not slip through: after A commits, the version must either
# still be a DRAFT (the lock was refused) or, if it locked, hold no CHOICE question with fewer than two options.
set -euo pipefail
U="${1:?usage: race.sh <database-url>}"
export PGOPTIONS="-c client_min_messages=warning"
read -r V P < <(psql -X -q -A -t -F ' ' "$U" <<'SQL'
SELECT gen_random_uuid() AS j9, gen_random_uuid() AS v9, gen_random_uuid() AS q1 \gset
SELECT "id" AS p FROM "Profile" ORDER BY "createdAt" LIMIT 1 \gset
CREATE TEMP TABLE jc AS SELECT * FROM "Job" ORDER BY "createdAt" LIMIT 1;
UPDATE jc SET "id" = :'j9', "title" = 'Race job';
INSERT INTO "Job" SELECT * FROM jc;
INSERT INTO "PollVersion"("id","jobId","version","title","conductedBy","disclosure","createdById") VALUES (:'v9', :'j9', 1, 't', 'x', 'y', :'p');
INSERT INTO "PollQuestion"("id","versionId","position","kind","text") VALUES (:'q1', :'v9', 1, 'CHOICE', 'a valid question');
INSERT INTO "PollOption"("id","questionId","position","label") VALUES (gen_random_uuid(), :'q1', 1, 'Yes'), (gen_random_uuid(), :'q1', 2, 'No');
\echo :v9 :p
SQL
)
# A: adds a CHOICE question with no options, holds the transaction for 3 seconds.
psql -X -q "$U" -c "BEGIN; INSERT INTO \"PollQuestion\"(\"id\",\"versionId\",\"position\",\"kind\",\"text\") VALUES (gen_random_uuid(), '$V', 2, 'CHOICE', 'racing: no options'); SELECT pg_sleep(3); COMMIT;" >/dev/null 2>&1 &
a=$!
sleep 1
# B: locks the version while A is in flight (it may be refused; that is the right answer).
psql -X -q "$U" -c "UPDATE \"PollVersion\" SET \"status\"='LOCKED', \"lockedAt\"=now(), \"researchAttestedById\"='$P', \"researchAttestedAt\"=now() WHERE \"id\"='$V'" >/dev/null 2>&1 || true
wait "$a" || true
r="$(psql -X -q -A -t -F '|' "$U" -c "SELECT (SELECT \"status\" FROM \"PollVersion\" WHERE \"id\"='$V'), (SELECT count(*) FROM \"PollQuestion\" q WHERE q.\"versionId\"='$V' AND q.\"kind\"='CHOICE' AND (SELECT count(*) FROM \"PollOption\" o WHERE o.\"questionId\"=q.\"id\") < 2)")"
status="${r%%|*}"; bad="${r##*|}"
if [ "$status" = "LOCKED" ] && [ "$bad" != "0" ]; then
  echo "race|FAIL|a lock slipped past a question added at the same moment: the version is LOCKED with $bad CHOICE question(s) under two options"
  exit 1
fi
echo "race|PASS|version is $status, $bad invalid question(s) in it"
