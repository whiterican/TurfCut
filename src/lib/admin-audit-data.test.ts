import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: () => ({}) }));
const { cursorString, filterQuery, LEDGER_MOMENTS, mergeTimeline, parseAuditFilter, parseCursor, recordHref } = await import("./admin-audit-data");

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const at = (s: string) => new Date(s);

describe("the audit timeline (M10.4)", () => {
  it("pins the five ledger moments", () => {
    expect([...LEDGER_MOMENTS]).toEqual(["job.published", "shift.reviewed", "approve", "payout.created", "pay.statement_closed"]);
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

  it("merges two sources newest first, ids ascending within a moment, and hands back a cursor only while more exist", () => {
    const a = [{ id: B, createdAt: at("2026-10-20T12:00:00Z") }, { id: A, createdAt: at("2026-10-20T10:00:00Z") }, { id: A, createdAt: at("2026-10-20T09:00:00Z") }];
    const b = [{ id: A, createdAt: at("2026-10-20T12:00:00Z") }, { id: B, createdAt: at("2026-10-20T11:00:00Z") }];
    const page = mergeTimeline(a, b, 3);
    expect(page.rows.map((r) => `${r.createdAt.toISOString().slice(11, 13)}${r.id[0]}`)).toEqual(["12a", "12b", "11b"]);
    expect(page.next).toEqual({ createdAt: at("2026-10-20T11:00:00Z"), id: B });
    expect(mergeTimeline(a, b, 10).next).toBeNull();
    expect(mergeTimeline([], [], 10)).toEqual({ rows: [], next: null });
  });
});
