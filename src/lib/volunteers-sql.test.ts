import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The volunteers migration (prisma/v1-volunteers.sql) runs on the live project; a fresh database is built from
 * supabase-manual-setup.sql instead. The two must give the same guards, or a fresh database and the live one would
 * disagree about whether a volunteer job can carry pay.
 */
const migration = readFileSync("prisma/v1-volunteers.sql", "utf8");
const setup = readFileSync("prisma/supabase-manual-setup.sql", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const guards = (sql: string, from: string, to: string | null) => {
  const start = sql.indexOf(from);
  const end = to === null ? sql.length : sql.indexOf(to, start);
  if (start < 0 || end < 0) throw new Error(`section not found: ${from}`);
  return sql.slice(start, end).trim();
};
const FIRST_GUARD = 'ALTER TABLE "public"."Job" DROP CONSTRAINT IF EXISTS "Job_volunteer_no_rate";';

describe("volunteers migration", () => {
  it("the fresh setup holds the migration's guards word for word", () => {
    expect(guards(setup, FIRST_GUARD, null)).toBe(guards(migration, FIRST_GUARD, "COMMIT;"));
  });

  it("the fresh setup has the method and the worker's audience in its definitions", () => {
    expect(setup).toContain(`CREATE TYPE "public"."CompensationMethod" AS ENUM ('HOURLY', 'SHIFT_RATE', 'PER_UNIT', 'VOLUNTEER');`);
    expect(setup).toContain(`"volunteerAudience" "public"."ShareAudience" NOT NULL DEFAULT 'NOBODY',`);
    expect(migration).toContain(`ALTER TYPE "public"."CompensationMethod" ADD VALUE IF NOT EXISTS 'VOLUNTEER';`);
    expect(migration).toContain(`ADD COLUMN IF NOT EXISTS "volunteerAudience" "public"."ShareAudience" NOT NULL DEFAULT 'NOBODY';`);
    expect(schema).toMatch(/volunteerAudience\s+ShareAudience\s+@default\(NOBODY\)/);
  });

  it("never uses the new value as an enum in the transaction that adds it (Postgres refuses that)", () => {
    const body = migration.slice(migration.indexOf("BEGIN;"));
    const uses = body.split("\n").filter((l) => l.includes("'VOLUNTEER'") && !l.includes("ADD VALUE"));
    expect(uses.length).toBeGreaterThan(3);
    for (const line of uses) expect({ line, asText: /::text\s*(=|<>)\s*'VOLUNTEER'|method = 'VOLUNTEER'/.test(line) }).toEqual({ line, asText: true });
  });

  it("can be run again: every definition is dropped or replaced first", () => {
    for (const name of ["Job_volunteer_no_rate", "Job_volunteer_canvass"]) expect(migration).toContain(`DROP CONSTRAINT IF EXISTS "${name}"`);
    for (const name of ["Payout_not_for_volunteer", "Job_volunteer_fixed"]) expect(migration).toContain(`DROP TRIGGER IF EXISTS "${name}"`);
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(2);
    expect(migration).not.toMatch(/CREATE FUNCTION|CREATE TABLE(?! IF NOT EXISTS)/);
  });

  it("keeps its helper functions out of reach of the API roles", () => {
    for (const fn of ["payout_not_for_volunteer", "job_volunteer_fixed"]) expect(migration).toContain(`REVOKE ALL ON FUNCTION "turfcut_private"."${fn}"() FROM PUBLIC, anon, authenticated;`);
  });
});
