import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Signed-in browsers may read chat rows' ids and times (for Realtime), never
 * their text. A table-wide SELECT grant on Message or MessageRevision in any
 * migration would undo that for anyone running the files in order (it did,
 * in m4-migration.sql, until the column-limited grant replaced it).
 */
describe("migration grants", () => {
  const dir = join(process.cwd(), "prisma");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  it("no migration grants table-wide read on chat tables to the API roles", () => {
    const tableWide = /GRANT\s+(SELECT|ALL)(\s+PRIVILEGES)?\s+ON\s+(TABLE\s+)?[^;]*"(Message|MessageRevision)"[^;]*TO\s+[^;]*(authenticated|anon)/gi;
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8").replace(/--[^\n]*/g, "");
      expect({ file: f, hits: sql.match(tableWide) ?? [] }).toEqual({ file: f, hits: [] });
    }
  });
  it("every chat grant names the id and time columns only", () => {
    const allowed = new Set(['"id"', '"conversationId"', '"createdAt"', '"messageId"']);
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8").replace(/--[^\n]*/g, "");
      for (const m of sql.matchAll(/GRANT\s+SELECT\s*\(([^)]*)\)\s+ON\s+"public"\."(Message|MessageRevision)"/gi)) {
        for (const col of m[1].split(",").map((c) => c.trim())) expect({ file: f, col, ok: allowed.has(col) }).toEqual({ file: f, col, ok: true });
      }
    }
  });
});
