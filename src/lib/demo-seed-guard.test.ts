import { describe, expect, it } from "vitest";
import {
  DEMO_ONLY_NOTES,
  DEMO_STATEWIDE_EXPIRY_DAYS,
  DEMO_STATEWIDE_RENEW_WITHIN_DAYS,
  LIVE_SUPABASE_PROJECT_REFS,
  STATEWIDE_CO_ID,
  demoDatabaseGuard,
  demoOnlyRules,
  demoJobCityAndJurisdiction,
  demoStatewideExpiry,
  planStatewideProfile,
  projectRefFromDatabaseUrl,
  projectRefFromSupabaseUrl,
  shouldRenewDemoStatewide,
} from "./demo-seed-guard";

const now = new Date("2026-11-14T18:00:00Z");

describe("project refs", () => {
  it("reads the ref from a Supabase URL, or the host for a local one", () => {
    expect(projectRefFromSupabaseUrl("https://abcd1234.supabase.co")).toBe("abcd1234");
    expect(projectRefFromSupabaseUrl("https://abcd1234.supabase.in")).toBe("abcd1234");
    expect(projectRefFromSupabaseUrl("http://127.0.0.1:54321")).toBe("127.0.0.1:54321");
    expect(projectRefFromSupabaseUrl("http://localhost")).toBe("localhost");
    expect(projectRefFromSupabaseUrl("not a url")).toBeNull();
    expect(projectRefFromSupabaseUrl(undefined)).toBeNull();
  });

  it("reads the same ref from a direct or pooler DATABASE_URL, or the host for a local one", () => {
    expect(projectRefFromDatabaseUrl("postgresql://postgres:secret@db.abcd1234.supabase.co:5432/postgres")).toBe("abcd1234");
    expect(projectRefFromDatabaseUrl("postgresql://postgres.abcd1234@aws-0-us-east-1.pooler.supabase.com:6543/postgres")).toBe(
      "abcd1234"
    );
    expect(projectRefFromDatabaseUrl("postgresql://postgres.abc@aws-0-us-east-1.pooler.supabase.com:6543/postgres")).toBe("abc");
    // A hyphenated suffix is a different user, not a prefix of the ref.
    expect(projectRefFromDatabaseUrl("postgresql://postgres.abc-x@aws-0-us-east-1.pooler.supabase.com:6543/postgres")).toBeNull();
    expect(projectRefFromDatabaseUrl("postgresql://postgres@127.0.0.1:5432/turfcut_acc_demo")).toBe("127.0.0.1:5432");
    expect(projectRefFromDatabaseUrl("postgresql://postgres@localhost/turfcut_acc_demo")).toBe("localhost");
    // Node's URL parser rejects a host-less postgres URL; that form is not a match.
    expect(projectRefFromDatabaseUrl("postgresql://postgres@/turfcut_acc_demo?host=/tmp")).toBeNull();
    expect(projectRefFromDatabaseUrl("postgresql://postgres@localhost:5432/turfcut_acc_demo?host=/tmp")).toBe("localhost:5432");
    expect(projectRefFromDatabaseUrl(undefined)).toBeNull();
    expect(projectRefFromDatabaseUrl("not a url")).toBeNull();
  });
});

const matching = {
  TURFCUT_DEMO: "1",
  TURFCUT_DEMO_PROJECT_REF: "abcd1234",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd1234.supabase.co",
  DATABASE_URL: "postgresql://postgres:secret@db.abcd1234.supabase.co:5432/postgres",
};

const reasonOf = (env: Parameters<typeof demoDatabaseGuard>[0]) => {
  const r = demoDatabaseGuard(env);
  if (r.ok) throw new Error("expected a refusal");
  return r.reason;
};

describe("the demo database must be named on purpose", () => {
  it("allows the run only when TURFCUT_DEMO=1 and the confirmed ref matches both URLs", () => {
    expect(demoDatabaseGuard(matching)).toEqual({ ok: true, ref: "abcd1234" });
    expect(
      demoDatabaseGuard({
        ...matching,
        TURFCUT_DEMO_PROJECT_REF: " ABCD1234 ",
        DATABASE_URL: "postgresql://postgres.abcd1234@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      })
    ).toEqual({ ok: true, ref: "abcd1234" });
  });

  it("refuses when the flag is off, a value is missing, or either URL points at a different project", () => {
    expect(demoDatabaseGuard({ ...matching, TURFCUT_DEMO: undefined }).ok).toBe(false);
    expect(demoDatabaseGuard({ ...matching, TURFCUT_DEMO: "true" }).ok).toBe(false);
    expect(reasonOf({ ...matching, TURFCUT_DEMO_PROJECT_REF: undefined })).toMatch(/TURFCUT_DEMO_PROJECT_REF/);
    expect(reasonOf({ ...matching, NEXT_PUBLIC_SUPABASE_URL: undefined })).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(reasonOf({ ...matching, DATABASE_URL: undefined })).toMatch(/DATABASE_URL/);
    expect(reasonOf({ ...matching, TURFCUT_DEMO_PROJECT_REF: "live5678" })).toMatch(/doesn't match NEXT_PUBLIC_SUPABASE_URL/);
    expect(reasonOf({ ...matching, DATABASE_URL: "postgresql://postgres@db.live5678.supabase.co:5432/postgres" })).toMatch(
      /doesn't match DATABASE_URL/
    );
  });

  it("refuses a substring of the real ref, and never echoes the expected value", () => {
    const r = demoDatabaseGuard({ ...matching, TURFCUT_DEMO_PROJECT_REF: "abcd" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected a refusal");
    expect(r.reason).not.toMatch(/abcd1234/);
    expect(reasonOf({ ...matching, TURFCUT_DEMO_PROJECT_REF: undefined })).not.toMatch(/abcd1234/);
  });

  it("treats a local database and a local supabase URL with the same host as a match", () => {
    expect(
      demoDatabaseGuard({
        TURFCUT_DEMO: "1",
        TURFCUT_DEMO_PROJECT_REF: "127.0.0.1:5432",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:5432",
        DATABASE_URL: "postgresql://postgres@127.0.0.1:5432/turfcut_acc_demo",
      })
    ).toEqual({ ok: true, ref: "127.0.0.1:5432" });
  });

  it("always refuses the live Turfcut project, even when the ref is confirmed", () => {
    const live = {
      TURFCUT_DEMO: "1",
      TURFCUT_DEMO_PROJECT_REF: "txzxtvsfzxfhgfiurufq",
      NEXT_PUBLIC_SUPABASE_URL: "https://txzxtvsfzxfhgfiurufq.supabase.co",
      DATABASE_URL: "postgresql://postgres:secret@db.txzxtvsfzxfhgfiurufq.supabase.co:5432/postgres",
    };
    expect(LIVE_SUPABASE_PROJECT_REFS).toContain("txzxtvsfzxfhgfiurufq");
    expect(reasonOf(live)).toMatch(/live Turfcut project/);
    expect(reasonOf({ ...live, TURFCUT_DEMO_PROJECT_REF: undefined })).toMatch(/live Turfcut project/);
    expect(reasonOf(live)).not.toMatch(/txzxtvsfzxfhgfiurufq/);
    expect(demoDatabaseGuard(live).ok).toBe(false);
  });
});

describe("planning the statewide CO profile", () => {
  const usable = { id: "existing-current", isCurrent: true, usable: true };

  it("creates a DEMO ONLY profile that expires in about 14 days, only on a guarded demo database", () => {
    const plan = planStatewideProfile({ guarded: true, existing: [], now });
    expect(plan).toEqual({
      kind: "create",
      id: STATEWIDE_CO_ID,
      approvalExpiresAt: demoStatewideExpiry(now),
      notes: DEMO_ONLY_NOTES,
    });
    if (plan.kind !== "create") throw new Error("expected create");
    expect(plan.notes).toMatch(/DEMO ONLY/);
    const days = (plan.approvalExpiresAt.getTime() - now.getTime()) / 86_400_000;
    expect(days).toBe(DEMO_STATEWIDE_EXPIRY_DAYS);
    expect(planStatewideProfile({ guarded: false, existing: [], now })).toEqual({ kind: "denver-only" });
  });

  it("reuses a usable current statewide profile, even outside a guarded demo", () => {
    expect(planStatewideProfile({ guarded: true, existing: [usable], now })).toEqual({ kind: "use-existing", id: usable.id });
    expect(planStatewideProfile({ guarded: false, existing: [usable], now })).toEqual({ kind: "use-existing", id: usable.id });
  });

  it("never creates a duplicate when a statewide row already exists (null locality is not unique)", () => {
    const leftover = { id: "old-v1", isCurrent: false, usable: false };
    expect(planStatewideProfile({ guarded: true, existing: [leftover], now })).toMatchObject({ kind: "refuse" });
    expect(planStatewideProfile({ guarded: false, existing: [leftover], now })).toEqual({ kind: "denver-only" });
    const unusable = { id: "current-but-expired", isCurrent: true, usable: false };
    expect(planStatewideProfile({ guarded: true, existing: [unusable], now })).toMatchObject({ kind: "refuse" });
    expect(planStatewideProfile({ guarded: false, existing: [unusable], now })).toEqual({ kind: "denver-only" });
  });
});

describe("demo job city and jurisdiction", () => {
  const denverId = "00000000-0000-0000-0000-000000000021";
  const create = planStatewideProfile({ guarded: true, existing: [], now });

  it("keeps a Denver job on the Denver profile", () => {
    expect(demoJobCityAndJurisdiction("Denver", create, denverId)).toEqual({ city: "Denver", jurisdictionId: denverId });
  });

  it("files a non-Denver job under the statewide profile when one is in use or being created", () => {
    expect(demoJobCityAndJurisdiction("Aurora", create, denverId)).toEqual({ city: "Aurora", jurisdictionId: STATEWIDE_CO_ID });
    expect(demoJobCityAndJurisdiction("Aurora", { kind: "use-existing", id: "sw" }, denverId)).toEqual({
      city: "Aurora",
      jurisdictionId: "sw",
    });
  });

  it("moves a non-Denver job to Denver when the seed must not create a statewide profile", () => {
    expect(demoJobCityAndJurisdiction("Aurora", { kind: "denver-only" }, denverId)).toEqual({
      city: "Denver",
      jurisdictionId: denverId,
    });
    expect(demoJobCityAndJurisdiction("Aurora", { kind: "refuse", reason: "no" }, denverId)).toEqual({
      city: "Denver",
      jurisdictionId: denverId,
    });
  });
});

describe("renewing a DEMO ONLY statewide profile", () => {
  const demo = {
    state: "CO",
    locality: null,
    approvalExpiresAt: new Date(now.getTime() + 2 * 86_400_000),
    rules: { notes: DEMO_ONLY_NOTES },
  };

  it("renews when the DEMO ONLY profile has expired or is within the renew window", () => {
    expect(shouldRenewDemoStatewide(demo, now)).toBe(true);
    expect(shouldRenewDemoStatewide({ ...demo, approvalExpiresAt: new Date(now.getTime() - 86_400_000) }, now)).toBe(true);
    expect(
      shouldRenewDemoStatewide(
        { ...demo, approvalExpiresAt: new Date(now.getTime() + DEMO_STATEWIDE_RENEW_WITHIN_DAYS * 86_400_000) },
        now
      )
    ).toBe(true);
  });

  it("leaves a fresh DEMO ONLY profile, a never-expiring one, or a counsel profile alone", () => {
    expect(
      shouldRenewDemoStatewide(
        { ...demo, approvalExpiresAt: new Date(now.getTime() + DEMO_STATEWIDE_EXPIRY_DAYS * 86_400_000) },
        now
      )
    ).toBe(false);
    expect(shouldRenewDemoStatewide({ ...demo, approvalExpiresAt: null }, now)).toBe(false);
    expect(shouldRenewDemoStatewide({ ...demo, rules: { notes: "Counsel-approved CO rules" } }, now)).toBe(false);
    expect(shouldRenewDemoStatewide({ ...demo, locality: "Denver" }, now)).toBe(false);
    expect(shouldRenewDemoStatewide(null, now)).toBe(false);
    expect(demoOnlyRules({ notes: DEMO_ONLY_NOTES })).toBe(true);
    expect(demoOnlyRules({ notes: "Seed rules — replace with counsel-approved text before pilot." })).toBe(false);
  });
});
