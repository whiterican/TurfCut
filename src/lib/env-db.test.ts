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
