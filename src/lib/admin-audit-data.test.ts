import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: () => ({}) }));
const { cursorString, filterQuery, HIDDEN_ENTITY_TYPES, LEDGER_MOMENTS, mergeTimeline, parseAuditFilter, parseCursor, presentDetails, recordHref } = await import("./admin-audit-data");

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const at = (s: string) => new Date(s);

describe("the audit timeline (M10.4)", () => {
  it("pins the five ledger moments, each an action some module actually records", () => {
    expect([...LEDGER_MOMENTS]).toEqual(["job.published", "shift.reviewed", "payout.approved", "payout.created", "pay.statement_closed"]);
    const dir = join(process.cwd(), "src/lib");
    const recorded = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "admin-audit-data.ts").map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    for (const moment of LEDGER_MOMENTS) expect(recorded, `${moment} is recorded somewhere`).toContain(`"${moment}"`);
  });

  it("drops a day that doesn't exist instead of rounding it into another", () => {
    expect(parseAuditFilter({ from: "2026-02-30" }).from).toBeNull();
    expect(parseAuditFilter({ to: "2026-13-45" }).to).toBeNull();
    expect(parseAuditFilter({ from: "2024-02-29" }).from).toEqual(at("2024-02-29T00:00:00Z"));
    // Postgres has no year 0: a crafted date or cursor that early is dropped.
    expect(parseAuditFilter({ from: "0000-01-01" }).from).toBeNull();
    expect(parseCursor(`0000-01-01T00:00:00.000Z_${A}`)).toBeNull();
  });

  it("shows details only for the kinds of event that are the organization's or the record's own, withholds a worker's own and anything new, and drops the consent version from an engagement", () => {
    expect(presentDetails("audit", "org.muted", "Worker", { orgId: A })).toEqual({ metadata: null, withheld: true });
    expect(presentDetails("audit", "sharing.saved", "Worker", null)).toEqual({ metadata: null, withheld: false });
    expect(presentDetails("audit", "credential.added", "WorkerCredential", { kind: "NOTARY" })).toEqual({ metadata: null, withheld: true });
    expect(presentDetails("audit", "credential_proof.added", "CredentialProof", { credentialId: A, side: "front", shared: true })).toEqual({ metadata: null, withheld: true });
    expect(presentDetails("audit", "experience.added", "ExperienceRecord", { verificationLevel: "SELF" })).toEqual({ metadata: null, withheld: true });
    expect(presentDetails("audit", "profile.blocked", "Profile", { blockedId: A })).toEqual({ metadata: null, withheld: true });
    expect(presentDetails("audit", "something.new", "Thing", { x: 1 })).toEqual({ metadata: null, withheld: true });
    expect(presentDetails("audit", "engagement.applied", "Engagement", { jobId: A, workerId: B, status: "APPLIED", consentVersion: 3 })).toEqual({ metadata: { jobId: A, workerId: B, status: "APPLIED" }, withheld: false });
    expect(presentDetails("audit", "shift.cancelled", "Shift", { by: "ORG", reason: "Sam called in sick, again" })).toEqual({ metadata: { by: "ORG" }, withheld: false });
    expect(presentDetails("audit", "org_role.updated", "OrgRole", { before: { pay: "full" }, after: {} })).toEqual({ metadata: { before: { pay: "full" }, after: {} }, withheld: false });
    expect(presentDetails("audit", "job.published", "Job", { by: "x" })).toEqual({ metadata: { by: "x" }, withheld: false });
    expect(presentDetails("audit", "payout.approved", "Payout", { payoutIds: [A] })).toEqual({ metadata: { payoutIds: [A] }, withheld: false });
    expect(presentDetails("staff", "member.removed_for_org", "Profile", { role: "OWNER" })).toEqual({ metadata: { role: "OWNER" }, withheld: false });
  });

  it("keeps chat and block events out of the timeline altogether", () => {
    expect([...HIDDEN_ENTITY_TYPES]).toEqual(["Conversation", "Message", "MessageReport", "ProfileBlock"]);
  });

  it("reads the query string as a filter, dropping what doesn't parse instead of refusing", () => {
    expect(parseAuditFilter({ kind: " job. ", actor: A, type: "Job", id: ["x1", "x2"], from: "2026-10-01", to: "2026-10-20", ledger: "1" })).toEqual({
      kind: "job.", actorId: A, entityType: "Job", entityId: "x1", from: at("2026-10-01T00:00:00Z"), to: at("2026-10-20T23:59:59.999Z"), ledger: true,
    });
    expect(parseAuditFilter({ actor: "not-a-uuid", from: "yesterday", ledger: "yes" })).toEqual({ kind: null, actorId: null, entityType: null, entityId: null, from: null, to: null, ledger: false });
    expect(parseAuditFilter({ kind: "x".repeat(200) }).kind).toHaveLength(80);
  });

  it("round-trips a cursor and ignores a malformed one", () => {
    const c = { createdAt: at("2026-10-20T15:00:00.123Z"), id: A };
    expect(parseCursor(cursorString(c))).toEqual(c);
    expect(parseCursor("2026-10-20_abc")).toBeNull();
    expect(parseCursor(undefined)).toBeNull();
  });

  it("writes a filter back as a query string, with the cursor for the next page", () => {
    const f = parseAuditFilter({ kind: "member", type: "Profile", ledger: "1", from: "2026-10-01" });
    expect(filterQuery(f)).toBe("?kind=member&type=Profile&from=2026-10-01&ledger=1");
    expect(filterQuery(f, { createdAt: at("2026-10-20T15:00:00.000Z"), id: A })).toContain(`after=2026-10-20T15%3A00%3A00.000Z_${A}`);
    expect(filterQuery(parseAuditFilter({}))).toBe("");
  });

  it("links a record to its console page when it has one", () => {
    expect(recordHref("Organization", A)).toBe(`/admin/organizations/${A}`);
    expect(recordHref("JurisdictionProfile", A)).toBe(`/admin/jurisdictions/${A}`);
    expect(recordHref("Profile", A)).toBe(`/admin/people/${A}`);
    expect(recordHref("Job", A)).toBeNull();
    expect(recordHref("Organization", "not-a-uuid")).toBeNull();
  });

  it("merges the sources newest first, ids ascending within a moment, and hands back a cursor only while more exist", () => {
    const a = [{ id: B, createdAt: at("2026-10-20T12:00:00Z") }, { id: A, createdAt: at("2026-10-20T10:00:00Z") }, { id: A, createdAt: at("2026-10-20T09:00:00Z") }];
    const b = [{ id: A, createdAt: at("2026-10-20T12:00:00Z") }, { id: B, createdAt: at("2026-10-20T11:00:00Z") }];
    const page = mergeTimeline([...a, ...b], 3);
    expect(page.rows.map((r) => `${r.createdAt.toISOString().slice(11, 13)}${r.id[0]}`)).toEqual(["12a", "12b", "11b"]);
    expect(page.next).toEqual({ createdAt: at("2026-10-20T11:00:00Z"), id: B });
    expect(mergeTimeline([...a, ...b], 10).next).toBeNull();
    expect(mergeTimeline([], 10)).toEqual({ rows: [], next: null });
  });
});
