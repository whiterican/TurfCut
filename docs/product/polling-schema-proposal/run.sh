#!/usr/bin/env bash
# Rebuilds a throwaway database (the repo's own setup, the seed, W1's SQL, a W2 stub, then polls.sql twice to prove it
# is safe to re-run) and runs test.sql against it. Nothing here touches prisma/ or any real database.
#
# Usage: PGURL=postgresql://user:pass@host:port [W1_SQL=path/to/w1-walkbooks.sql] docs/product/polling-schema-proposal/run.sh
# PGURL points at the server (database "postgres"); the script drops and creates turfcut_poll_proposal.
# It drops and recreates a database, so it refuses a server that isn't local (localhost, 127.0.0.1 or a socket path) unless
# ALLOW_REMOTE=1. W1_SQL (relative paths are taken from where you run this) defaults to prisma/w1-walkbooks.sql once W1
# has merged. Before that, from a checkout that has the branch:
#   git show origin/claude/eager-albattani-v4wkxr:prisma/w1-walkbooks.sql > /tmp/w1-walkbooks.sql
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
case "$W1_SQL" in /*) ;; prisma/*) ;; *) W1_SQL="$caller/$W1_SQL" ;; esac
[ -f "$W1_SQL" ] || { echo "W1's SQL not found at $W1_SQL (see the usage note at the top of this script)"; exit 2; }
db=turfcut_poll_proposal
P="psql -v ON_ERROR_STOP=1 -q -X"
export PGOPTIONS="-c client_min_messages=warning"
$P "$PGURL/postgres" -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
$P "$PGURL/$db" -f tests/acceptance/supabase-shim.sql >/dev/null
$P "$PGURL/$db" -f prisma/supabase-manual-setup.sql >/dev/null
DATABASE_URL="$PGURL/$db" npx tsx prisma/seed.ts >/dev/null
for f in "$W1_SQL" "$here/w2-stub.sql" "$here/polls.sql" "$here/polls.sql"; do $P "$PGURL/$db" -f "$f" >/dev/null; done
out="$(psql -v ON_ERROR_STOP=1 -X -q -A -t "$PGURL/$db" -f "$here/test.sql" 2>&1)" || { echo "test.sql stopped on an error:"; echo "$out"; exit 1; }
echo "$out" | grep -E '\|FAIL\|' || true
race="$("$here/race.sh" "$PGURL/$db" 2>&1)" || true
echo "$race" | grep -E '\|FAIL\|' || true
summary="$(echo "$out" | grep -E '^[0-9]+\|[0-9]+$' | tail -1)"
echo "   ${summary%%|*} checks pass, ${summary##*|} fail"
echo "   $(echo "$race" | grep -q '|PASS|' && echo 'race check passes' || echo 'race check FAILS')"
[ "${summary##*|}" = "0" ] && echo "$race" | grep -q '|PASS|' 
