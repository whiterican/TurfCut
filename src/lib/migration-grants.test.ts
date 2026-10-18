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
  it("campaign tables: column grants only, never who wrote or deleted a post, never revisions (S1)", () => {
    const allowed: Record<string, Set<string>> = {
      CampaignProfile: new Set(['"id"', '"handle"', '"displayName"', '"bio"', '"avatarKey"', '"headerKey"', '"publishedAt"', '"createdAt"', '"updatedAt"']),
      CampaignPost: new Set(['"id"', '"profileId"', '"body"', '"jobId"', '"pinnedAt"', '"createdAt"', '"editedAt"']),
      // S4: never who wrote a fact or a resource, never a removed one's deletedAt.
      TalkingPointFact: new Set(['"id"', '"postId"', '"body"', '"sourceUrl"', '"position"', '"createdAt"', '"updatedAt"']),
      CampaignResource: new Set(['"id"', '"profileId"', '"kind"', '"audience"', '"title"', '"body"', '"position"', '"createdAt"', '"updatedAt"']),
    };
    const tableWide = /GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)(\s+PRIVILEGES)?\s+ON\s+(TABLE\s+)?[^;(]*"(CampaignProfile|CampaignPost|CampaignPostRevision|TalkingPointFact|CampaignResource)"[^;]*TO\s+[^;]*(authenticated|anon)/gi;
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8").replace(/--[^\n]*/g, "");
      expect({ file: f, hits: sql.match(tableWide) ?? [] }).toEqual({ file: f, hits: [] });
      expect({ file: f, revisionGrant: /GRANT[^;]*"CampaignPostRevision"[^;]*TO/i.test(sql) }).toEqual({ file: f, revisionGrant: false });
      // Any grant naming these tables (qualified or not, with TABLE or not) is a column-limited SELECT.
      for (const m of sql.matchAll(/GRANT\s+(\w+)\s*(\(([^)]*)\))?\s+ON\s+(TABLE\s+)?("public"\.)?"(CampaignProfile|CampaignPost|TalkingPointFact|CampaignResource)"/gi)) {
        expect({ file: f, table: m[6], privilege: m[1].toUpperCase(), columnLimited: !!m[2] }).toEqual({ file: f, table: m[6], privilege: "SELECT", columnLimited: true });
        for (const col of (m[3] ?? "").split(",").map((c) => c.trim())) expect({ file: f, table: m[6], col, ok: allowed[m[6]].has(col) }).toEqual({ file: f, table: m[6], col, ok: true });
      }
      expect({ file: f, schemaWide: /GRANT[^;]*ON\s+ALL\s+TABLES\s+IN\s+SCHEMA[^;]*TO[^;]*(anon|authenticated)/i.test(sql) }).toEqual({ file: f, schemaWide: false });
    }
  });
  it("follows and likes stay server-only: no grant, no policy, in any migration (S2)", () => {
    // Who follows a campaign and who liked a post is the worker's business: nothing is ever readable through the Data API.
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8").replace(/--[^\n]*/g, "");
      expect({ file: f, grants: sql.match(/GRANT[^;]*"(CampaignFollow|PostLike)"[^;]*/gi) ?? [] }).toEqual({ file: f, grants: [] });
      expect({ file: f, policies: sql.match(/CREATE\s+POLICY[^;]*"(CampaignFollow|PostLike)"[^;]*/gi) ?? [] }).toEqual({ file: f, policies: [] });
    }
    // And the files that create them take the API roles' default privileges back and turn RLS on (Supabase grants on new tables by default).
    for (const f of ["s2-social.sql", "supabase-manual-setup.sql"]) {
      const sql = readFileSync(join(dir, f), "utf8").replace(/--[^\n]*/g, "");
      for (const t of ["CampaignFollow", "PostLike"]) {
        expect({ file: f, table: t, rls: new RegExp(`ALTER\\s+TABLE\\s+"public"\\."${t}"\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i").test(sql) }).toEqual({ file: f, table: t, rls: true });
        expect({ file: f, table: t, revoked: new RegExp(`REVOKE\\s+ALL\\s+ON[^;]*"${t}"[^;]*FROM[^;]*anon[^;]*authenticated`, "i").test(sql) }).toEqual({ file: f, table: t, revoked: true });
      }
    }
  });
  it("shift slots stay server-only (M8.2)", () => {
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8").replace(/--[^\n]*/g, "");
      expect({ file: f, grants: sql.match(/GRANT[^;]*"ShiftSlot"[^;]*/gi) ?? [] }).toEqual({ file: f, grants: [] });
      expect({ file: f, policies: sql.match(/CREATE\s+POLICY[^;]*"ShiftSlot"[^;]*/gi) ?? [] }).toEqual({ file: f, policies: [] });
    }
    for (const f of ["m8-slots.sql", "supabase-manual-setup.sql"]) {
      const sql = readFileSync(join(dir, f), "utf8").replace(/--[^\n]*/g, "");
      expect({ file: f, rls: /ALTER\s+TABLE\s+"public"\."ShiftSlot"\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql) }).toEqual({ file: f, rls: true });
      expect({ file: f, revoked: /REVOKE\s+ALL\s+ON\s+"public"\."ShiftSlot"\s+FROM\s+anon,\s*authenticated/i.test(sql) }).toEqual({ file: f, revoked: true });
    }
  });
});
