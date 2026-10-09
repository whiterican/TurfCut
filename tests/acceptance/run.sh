#!/usr/bin/env bash
# Acceptance checks against a real Postgres: each script gets a fresh database
# built from prisma/supabase-manual-setup.sql plus the seed, then exercises the
# data layer end to end (locks, append-only rules, pay, sync, closure).
#
# Usage: PGURL=postgresql://user:pass@host:port tests/acceptance/run.sh [m5|m6|m7|c1|c2|rl|sec ...]
# Needs bash 4+ (macOS: brew install bash).
# PGURL points at the server (database "postgres"); the script creates
# turfcut_acc_<name> databases and drops them first if they exist. PGQUERY
# adds connection options to every URL, e.g. PGQUERY="?host=/tmp" for a
# Unix socket. The databases are left in place after the run for inspection.
#
# A setup failure (psql, seed) stops the run; a FAIL inside a script is
# reported and the remaining scripts still run, then the exit code is 1.
set -euo pipefail
cd "$(dirname "$0")/../.."
PGURL="${PGURL:-postgresql://postgres@localhost:5432}"
PGURL="${PGURL%/}"
PGQUERY="${PGQUERY:-}"
P="psql -v ON_ERROR_STOP=1 -q -X"
export PGOPTIONS="-c client_min_messages=warning"
checks=("$@"); [ ${#checks[@]} -eq 0 ] && checks=(m5 m6 m7 c1 c2 rl sec)
declare -A FILE=([m5]=m5-payouts.ts [m6]=m6-offline.ts [m7]=m7-corrections-closure.ts [c1]=c1-roles.ts [c2]=c2-consent.ts [rl]=rate-limit.ts [sec]=grants.ts)
# Extra SQL run after the setup for a check (sec: re-running the lockdown,
# as it is designed to be, must leave message grants column-limited).
declare -A AFTER=([sec]=prisma/m4-0-rls-lockdown.sql)
for c in "${checks[@]}"; do [[ -v FILE[$c] ]] || { echo "unknown check: $c (m5, m6, m7, c1, c2, rl, sec)"; exit 2; }; done
fail=0
for c in "${checks[@]}"; do
  db="turfcut_acc_$c"
  $P "$PGURL/postgres$PGQUERY" -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
  $P "$PGURL/$db$PGQUERY" -f tests/acceptance/supabase-shim.sql >/dev/null
  $P "$PGURL/$db$PGQUERY" -f prisma/supabase-manual-setup.sql >/dev/null
  if [[ -v AFTER[$c] ]]; then $P "$PGURL/$db$PGQUERY" -f "${AFTER[$c]}" >/dev/null; fi
  export DATABASE_URL="$PGURL/$db$PGQUERY"
  npx tsx prisma/seed.ts >/dev/null
  echo "== $c"
  out="$(mktemp)"
  # Each script prints PASS/FAIL per check and exits non-zero on any FAIL.
  if npx tsx --tsconfig tsconfig.json "tests/acceptance/${FILE[$c]}" >"$out" 2>&1; then
    echo "   $(grep -c '^PASS' "$out") checks pass"
  else
    fail=1
    grep -v '^PASS' "$out" | grep -v 'auth user could not be deleted\|^    at \|Missing environment' || true
  fi
  rm -f "$out"
done
exit $fail
