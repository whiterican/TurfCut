/* Grants acceptance: what signed-in browsers can read through Supabase's API, after the setup and a re-run of m4-0-rls-lockdown.sql (tests/acceptance/run.sh). */
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";

let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };

(async () => {
  const p = db();
  // Table-level privileges for the API roles, anywhere in public.
  const tableGrants = await p.$queryRaw<{ table_name: string; grantee: string; privilege_type: string }[]>`
    SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')`;
  check("no table-wide privilege on any public table for anon or authenticated", tableGrants.length === 0, tableGrants);

  const cols = async (table: string) =>
    (await p.$queryRaw<{ column_name: string; privilege_type: string; grantee: string }[]>`
      SELECT column_name, privilege_type, grantee FROM information_schema.column_privileges
       WHERE table_schema = 'public' AND table_name = ${table} AND grantee IN ('anon', 'authenticated')`)
      .map((r) => `${r.grantee}:${r.privilege_type}:${r.column_name}`).sort();
  const msg = await cols("Message");
  check("Message: authenticated reads ids and times only", JSON.stringify(msg) === JSON.stringify(["authenticated:SELECT:conversationId", "authenticated:SELECT:createdAt", "authenticated:SELECT:id"]), msg);
  const rev = await cols("MessageRevision");
  check("MessageRevision: authenticated reads ids and times only", JSON.stringify(rev) === JSON.stringify(["authenticated:SELECT:conversationId", "authenticated:SELECT:createdAt", "authenticated:SELECT:id", "authenticated:SELECT:messageId"]), rev);
  const otherCols = await p.$queryRaw<{ table_name: string }[]>`
    SELECT DISTINCT table_name FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated') AND table_name NOT IN ('Message', 'MessageRevision')`;
  check("no other public table has column grants for the API roles", otherCols.length === 0, otherCols);

  // As a signed-in browser would: the text column is refused outright.
  const asAuthed = (sql: string) => p.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE authenticated`);
    return tx.$queryRawUnsafe(sql);
  }).then(() => "ok", (e: unknown) => String(e));
  const body = await asAuthed(`SELECT "body" FROM "public"."Message" LIMIT 1`);
  check("selecting message text as authenticated is refused", /permission denied/.test(body), body);
  const ids = await asAuthed(`SELECT "id", "conversationId", "createdAt" FROM "public"."Message" LIMIT 1`);
  check("selecting ids and times as authenticated is allowed (RLS then filters rows)", ids === "ok", ids);

  // The order that caused H2: m4-migration.sql's grant statements applied
  // after the lockdown. Run them exactly as written in the file, then re-check.
  const m4 = readFileSync("prisma/m4-migration.sql", "utf8").replace(/--[^\n]*/g, "");
  const stmts = [...m4.matchAll(/(?:REVOKE|GRANT)\s+SELECT[^;]*"public"\."(?:Message|MessageRevision)"[^;]*;/g)].map((m) => m[0]);
  check("m4-migration.sql's chat grant block was found", stmts.length >= 2, stmts);
  for (const sql of stmts) await p.$executeRawUnsafe(sql);
  check("after m4's grant block: Message still ids and times only", JSON.stringify(await cols("Message")) === JSON.stringify(msg), await cols("Message"));
  check("after m4's grant block: MessageRevision still ids and times only", JSON.stringify(await cols("MessageRevision")) === JSON.stringify(rev), await cols("MessageRevision"));
  check("after m4's grant block: still no table-wide grant", (await p.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')`)[0].n === BigInt(0));

  await p.$disconnect();
  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
