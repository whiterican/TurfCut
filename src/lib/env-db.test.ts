import { describe, expect, it } from "vitest";
import { runtimeDatabaseUrl } from "./env";

const POOLER = "postgresql://postgres.abc:pw@aws-0-us-west-1.pooler.supabase.com:6543/postgres";
const DIRECT = "postgresql://postgres:pw@db.abc.supabase.co:5432/postgres";

describe("runtime database URL", () => {
  it("adds pgbouncer=true and one connection per instance to a pooler URL", () => {
    const { url, warning } = runtimeDatabaseUrl(POOLER, true);
    const u = new URL(url);
    expect(u.port).toBe("6543");
    expect(u.searchParams.get("pgbouncer")).toBe("true");
    expect(u.searchParams.get("connection_limit")).toBe("1");
    expect(u.password).toBe("pw");
    expect(warning).toBeNull();
  });

  it("keeps settings the URL already chose", () => {
    const u = new URL(runtimeDatabaseUrl(`${POOLER}?connection_limit=3&pgbouncer=true`, true).url);
    expect(u.searchParams.get("connection_limit")).toBe("3");
    expect(u.searchParams.getAll("pgbouncer")).toEqual(["true"]);
  });

  it("warns on serverless when the runtime URL is a direct connection, and changes nothing", () => {
    const r = runtimeDatabaseUrl(DIRECT, true);
    expect(r.url).toBe(DIRECT);
    expect(r.warning).toMatch(/pooler \(port 6543\)/);
  });

  it("is quiet off serverless (local Postgres, CI, acceptance)", () => {
    expect(runtimeDatabaseUrl("postgresql://postgres@localhost:5433/turfcut?host=/tmp", false)).toEqual({ url: "postgresql://postgres@localhost:5433/turfcut?host=/tmp", warning: null });
    expect(runtimeDatabaseUrl(DIRECT, false).warning).toBeNull();
  });
});

describe("pasted DATABASE_URL clean-up", () => {
  it("undoes spaces, line breaks, quotes, a DATABASE_URL= prefix and a phone's capital first letter", async () => {
    const { cleanDatabaseUrl } = await import("./env");
    for (const v of [` ${POOLER}\n`, `"${POOLER}"`, `'${POOLER}'`, "`" + POOLER + "`", `DATABASE_URL=${POOLER}`, POOLER.replace("postgresql", "Postgresql"), POOLER.replace("postgresql", "POSTGRESQL")])
      expect(cleanDatabaseUrl(v)).toBe(POOLER);
    expect(cleanDatabaseUrl("Postgres://u:p@h:6543/db")).toBe("postgres://u:p@h:6543/db");
  });

  it("gives Prisma the cleaned pooler URL, with the pooler settings added", () => {
    const { url, warning } = runtimeDatabaseUrl(` Postgresql://postgres.abc:pw@aws-0-us-west-1.pooler.supabase.com:6543/postgres `, true);
    expect(url.startsWith("postgresql://postgres.abc:pw@aws-0-us-west-1.pooler.supabase.com:6543/postgres?")).toBe(true);
    expect(warning).toBeNull();
  });

  it("says plainly when the value isn't a postgres URL at all", () => {
    const r = runtimeDatabaseUrl("https://txzx.supabase.co", true);
    expect(r.warning).toMatch(/must start with postgresql:\/\/ \(starts with "https:\/\/"/);
  });

  it("flags the pooler with a plain postgres user name (the pooler needs postgres.<project-ref>)", () => {
    const r = runtimeDatabaseUrl("postgresql://postgres:pw@aws-0-us-west-1.pooler.supabase.com:6543/postgres", true);
    expect(r.warning).toMatch(/postgres\.<project-ref>/);
  });

  it("describes the shape for logs and never includes the password", async () => {
    const { describeDatabaseUrl } = await import("./env");
    const d = describeDatabaseUrl(` ${DIRECT.replace("pw", "s3cretpw")}`);
    expect(d).toBe('had spaces or line breaks around it, starts with "postgresql://", user "postgres", host "db.abc.supabase.co", port 5432');
    expect(d).not.toContain("s3cret");
    expect(runtimeDatabaseUrl(DIRECT.replace("pw", "s3cretpw"), true).warning).not.toContain("s3cret");
  });

  it("shows nothing of a password with an unencoded / # or ? (it would otherwise land in the host or port)", async () => {
    const { describeDatabaseUrl } = await import("./env");
    for (const pw of ["1234/5678", "ab99#cd77", "qq9?zz7", "ab@SECRET1/x", "ab@SECRET2:9999/x", "ab@SECRET3#x", "ab@1234/x"]) {
      const d = describeDatabaseUrl(`postgresql://postgres.abc:${pw}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`);
      expect(d).toMatch(/must be percent-encoded/);
      for (const piece of pw.split(/[/#?@:]/).filter((p) => p.length > 1)) expect(d).not.toContain(piece);
    }
  });
});

describe("describing a pasted DATABASE_URL", () => {
  it("names what was tidied, and the scheme as pasted", async () => {
    const { describeDatabaseUrl } = await import("./env");
    expect(describeDatabaseUrl(`"${POOLER}"`)).toBe('was wrapped in quotes, starts with "postgresql://", user "postgres.abc", host "aws-0-us-west-1.pooler.supabase.com", port 6543');
    expect(describeDatabaseUrl(`export database_url=${POOLER.replace("postgresql", "Postgresql")}`)).toMatch(/^had a "DATABASE_URL=" prefix, had capital letters in postgresql:\/\/, starts with "Postgresql:\/\/"/);
  });

  it("doesn't throw on a malformed % in the user name", async () => {
    const { describeDatabaseUrl } = await import("./env");
    const bad = "postgresql://post%zzgres.abc:pw@aws-0-us-west-1.pooler.supabase.com:6543/postgres";
    expect(describeDatabaseUrl(bad)).toMatch(/user "post%zzgres.abc"/);
    expect(() => runtimeDatabaseUrl(bad, true)).not.toThrow();
  });

  it("never shows a lone name that may be the password, nor a query string", async () => {
    const { describeDatabaseUrl } = await import("./env");
    expect(describeDatabaseUrl("postgresql://HUNTER22@db.abc.supabase.co:5432/postgres")).not.toContain("HUNTER22");
    expect(describeDatabaseUrl("postgresql://u:p@h:5432/postgres?password=HUNTER22")).not.toContain("HUNTER22");
  });
});
