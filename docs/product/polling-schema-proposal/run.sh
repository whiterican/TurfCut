#!/usr/bin/env bash
# Rebuilds a throwaway database from the repo's own setup and seed, W1's SQL, W2's SQL, then:
#   purge-conflict.sql  (a negative control: proves W1+W2 as written can't run the 30-day purge),
#   w1-amendments.sql and polls.sql (each twice, to prove they are safe to re-run),
# runs test.sql, then the two-session race check. Nothing here touches prisma/ or any real database.
#
# Usage: PGURL=postgresql://user:pass@host:port [W1_SQL=…] [W2_SQL=…] docs/product/polling-schema-proposal/run.sh
# PGURL points at the server (database "postgres"); the script drops and recreates turfcut_poll_proposal. It refuses a
# server that isn't local (localhost, 127.0.0.1 or a socket path) unless ALLOW_REMOTE=1.
# W1_SQL and W2_SQL (relative paths are taken from where you run this) default to prisma/w1-walkbooks.sql and
# prisma/w2-stop-outcomes.sql once W1/W2 have merged. Before that, from a checkout that has the branch:
#   for f in w1-walkbooks w2-stop-outcomes; do git show origin/claude/eager-albattani-v4wkxr:prisma/$f.sql > /tmp/$f.sql; done
#   W1_SQL=/tmp/w1-walkbooks.sql W2_SQL=/tmp/w2-stop-outcomes.sql PGURL=… docs/product/polling-schema-proposal/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
caller="$PWD"
cd "$here/../../.."
PGURL="${PGURL:-postgresql://postgres@localhost:5432}"
PGURL="${PGURL%/}"
if [ "${ALLOW_REMOTE:-}" != "1" ] && ! [[ "$PGURL" =~ ^postgres(ql)?://([^@/]*@)?(localhost|127\.0\.0\.1|\[::1\])([:/]|$) ]] && ! [[ "$PGURL" == *"host=/"* ]]; then
  echo "Refusing: PGURL isn't a local server. This script drops and recreates a database. Set ALLOW_REMOTE=1 if you mean it."
  exit 2
fi
W1_SQL="${W1_SQL:-prisma/w1-walkbooks.sql}"
W2_SQL="${W2_SQL:-prisma/w2-stop-outcomes.sql}"
for v in W1_SQL W2_SQL; do
  case "${!v}" in /*) ;; prisma/*) ;; *) printf -v "$v" '%s' "$caller/${!v}" ;; esac
  [ -f "${!v}" ] || { echo "${v%_SQL}'s SQL not found at ${!v} (see the usage note at the top of this script)"; exit 2; }
done
db=turfcut_poll_proposal
P="psql -v ON_ERROR_STOP=1 -q -X"
export PGOPTIONS="-c client_min_messages=warning"
$P "$PGURL/postgres" -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
$P "$PGURL/$db" -f tests/acceptance/supabase-shim.sql >/dev/null
$P "$PGURL/$db" -f prisma/supabase-manual-setup.sql >/dev/null
DATABASE_URL="$PGURL/$db" npx tsx prisma/seed.ts >/dev/null
$P "$PGURL/$db" -f "$W1_SQL" >/dev/null
$P "$PGURL/$db" -f "$W2_SQL" >/dev/null
conflict="$(psql -X -q "$PGURL/$db" -f "$here/purge-conflict.sql" 2>&1 || true)"
if echo "$conflict" | grep -q 'StopOutcome_stopId_fkey'; then
  echo "   purge control: reproduced (W1 + W2 as written can't delete a stop that has an outcome)"
else
  echo "   purge control: NOT reproduced. Has W1/W2 been fixed? If so delete purge-conflict.sql and this branch of run.sh."
fi
for f in "$here/w1-amendments.sql" "$here/w1-amendments.sql" "$here/polls.sql" "$here/polls.sql"; do $P "$PGURL/$db" -f "$f" >/dev/null; done
out="$(psql -v ON_ERROR_STOP=1 -X -q -A -t "$PGURL/$db" -f "$here/test.sql" 2>&1)" || { echo "test.sql stopped on an error:"; echo "$out"; exit 1; }
echo "$out" | grep -E '\|FAIL\|' || true
race="$("$here/race.sh" "$PGURL/$db" 2>&1)" || true
echo "$race" | grep -E '\|FAIL\|' || true
summary="$(echo "$out" | grep -E '^[0-9]+\|[0-9]+$' | tail -1)"
echo "   ${summary%%|*} checks pass, ${summary##*|} fail"
echo "   $(echo "$race" | grep -q '|PASS|' && echo 'race check passes' || echo 'race check FAILS')"
[ "${summary##*|}" = "0" ] && echo "$race" | grep -q '|PASS|'
