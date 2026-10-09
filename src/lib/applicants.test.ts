import { describe, expect, it } from "vitest";
import { applicantCells, availableColumns, defaultColumns, freeDays, heldCredentials, keepApplicant, parseColumns, parseFilters, type ApplicantFacts, type ApplicantJob } from "./applicants";
import { EMPTY_AVAILABILITY, type Availability } from "./availability";
import { shareScorecard, ALL_SHARED } from "./shared-scorecard";
import { computeScorecard } from "./scorecard";
import type { OrgCredentialView } from "./credentials";

const petition: ApplicantJob = {
  type: "PETITION",
  // Mon Oct 12 – Sun Oct 18, 2026
  startsAt: new Date("2026-10-12T00:00:00Z"),
  endsAt: new Date("2026-10-18T00:00:00Z"),
  requirements: { badge: false, registration: true, affidavit: false, training: null, script: null },
  state: "CO",
};
const canvass: ApplicantJob = { ...petition, type: "CANVASS", requirements: { ...petition.requirements, registration: true } };
const weekends: Availability = { weekly: { sat: [{ from: "09:00", to: "15:00" }], sun: [{ from: "00:00", to: "24:00" }] }, exceptions: [{ date: "2026-10-17", ranges: [] }, { date: "2026-10-14", ranges: [{ from: "18:00", to: "21:00" }] }], note: null };
const empty = shareScorecard(computeScorecard([]), ALL_SHARED);
const none = shareScorecard(computeScorecard([]), { output: false, quality: false, reliability: false, history: false, availability: false, credentials: false });
const facts = (over: Partial<ApplicantFacts> = {}): ApplicantFacts => ({
  engagementId: "e1", name: "Alex Rivera", closed: false, status: "APPLIED", stage: "Applied",
  appliedAt: new Date("2026-10-02T15:00:00Z"), scorecard: empty, availability: weekends, credentials: [], ...over,
});
const reg = (over: Partial<OrgCredentialView> = {}): OrgCredentialView => ({ kind: "CIRCULATOR_REGISTRATION", label: null, state: "CO", verification: "PLATFORM", expiresOn: new Date("2027-06-30T00:00:00Z"), ...over });

describe("applicant columns", () => {
  it("offer only the job's work-type metrics, and dates/credentials only when the job has them", () => {
    expect(availableColumns(petition)).toContain("signaturesPerActiveHour");
    expect(availableColumns(petition)).not.toContain("doorsPerActiveHour");
    // Circulator rules are petition-only (#43): a canvass job has no credentials column.
    expect(availableColumns(canvass)).not.toContain("credentials");
    expect(availableColumns({ ...petition, startsAt: null })).not.toContain("free");
    expect(defaultColumns(petition)).toEqual(["applied", "free", "credentials", "signaturesPerActiveHour", "showRate", "stage"]);
  });
  it("keep only known columns for this job, in a fixed order; fall back to the defaults", () => {
    expect(parseColumns("stage,applied,doorsPerActiveHour,politics", petition)).toEqual(["applied", "stage"]);
    expect(parseColumns("", petition)).toEqual(defaultColumns(petition));
    expect(parseColumns("nonsense", canvass)).toEqual(defaultColumns(canvass));
  });
  it("never offer anything political", () => {
    for (const j of [petition, canvass]) for (const c of availableColumns(j)) expect(c).not.toMatch(/fit|party|issue|ident|polit|boundar/i);
  });
});

describe("free on the job's dates", () => {
  it("counts days free at some time, a dated exception winning over the usual week", () => {
    // Sat 17 is marked unavailable; Wed 14 is an extra evening; Sun 18 usual.
    expect(freeDays(weekends, petition.startsAt!, petition.endsAt!)).toEqual({ free: 2, total: 7, capped: false });
    expect(freeDays(EMPTY_AVAILABILITY, petition.startsAt!, petition.endsAt!).free).toBe(0);
  });
  it("caps a season-long job", () => {
    const f = freeDays(weekends, new Date("2026-01-01T00:00:00Z"), new Date("2026-12-31T00:00:00Z"));
    expect(f.total).toBe(62);
    expect(f.capped).toBe(true);
  });
});

describe("required credentials", () => {
  const today = "2026-10-09";
  it("picks the best one held: verified, then self-reported, then expired, then none", () => {
    expect(heldCredentials([reg()], petition, today)[0]).toMatchObject({ rank: 3, text: "CO registration: verified · exp 2027" });
    expect(heldCredentials([reg({ verification: "SELF_REPORTED" }), reg({ expiresOn: new Date("2025-01-01T00:00:00Z") })], petition, today)[0]).toMatchObject({ rank: 2, text: "CO registration: self-reported · exp 2027" });
    expect(heldCredentials([reg({ expiresOn: new Date("2025-01-01T00:00:00Z") })], petition, today)[0]).toMatchObject({ rank: 1, text: "CO registration: expired" });
    expect(heldCredentials([], petition, today)[0]).toMatchObject({ rank: 0, text: "CO registration: none added" });
  });
  it("a registration counts only for the job's state", () => {
    expect(heldCredentials([reg({ state: "AZ" })], petition, today)[0].rank).toBe(0);
  });
});

describe("applicant rows", () => {
  const today = "2026-10-09";
  it("withheld values read 'not shared', carry no sort value and are flagged withheld", () => {
    const cells = applicantCells(facts({ scorecard: none, availability: "withheld", credentials: "withheld" }), petition, ["free", "credentials", "signaturesPerActiveHour", "showRate", "shifts"], today, "/x");
    for (const k of ["free", "credentials", "signaturesPerActiveHour", "showRate", "shifts"]) expect(cells[k]).toEqual({ text: "not shared", sort: null, withheld: true });
  });
  it("shared but empty reads 'No data yet', never zero or 'not shared'", () => {
    const cells = applicantCells(facts(), petition, ["signaturesPerActiveHour", "showRate", "shifts"], today, "/x");
    expect(cells.signaturesPerActiveHour).toEqual({ text: "No data yet", sort: null });
    expect(cells.showRate).toEqual({ text: "No data yet", sort: null });
    expect(cells.shifts).toEqual({ text: "0", sort: 0 });
  });
  it("links the name to the applicant page and marks closed accounts", () => {
    expect(applicantCells(facts({ closed: true }), petition, [], today, "/hiring/j/people/e1").who).toMatchObject({ href: "/hiring/j/people/e1", text: "Alex Rivera (account closed)" });
  });
});

describe("applicant filters", () => {
  const today = "2026-10-09";
  it("parse safely", () => {
    expect(parseFilters(new URLSearchParams("stage=all&free=1&creds=1&since=2026-10-01"))).toEqual({ stage: "all", free: true, credentials: true, since: "2026-10-01" });
    expect(parseFilters(new URLSearchParams("since=yesterday"))).toEqual({ stage: "open", free: false, credentials: false, since: null });
  });
  it("narrow what was shared, and never drop someone for not sharing", () => {
    const f = { stage: "open" as const, free: true, credentials: true, since: null };
    expect(keepApplicant(facts({ availability: EMPTY_AVAILABILITY, credentials: [reg()] }), petition, f, today)).toBe(false); // shared: no free days
    expect(keepApplicant(facts({ credentials: [] }), petition, f, today)).toBe(false); // shared: no registration
    expect(keepApplicant(facts({ credentials: [reg()] }), petition, f, today)).toBe(true);
    expect(keepApplicant(facts({ availability: "withheld", credentials: "withheld" }), petition, f, today)).toBe(true);
  });
  it("stage and date", () => {
    const f = { stage: "open" as const, free: false, credentials: false, since: "2026-10-03" };
    expect(keepApplicant(facts(), petition, f, today)).toBe(false);
    expect(keepApplicant(facts({ appliedAt: new Date("2026-10-03T01:00:00Z") }), petition, f, today)).toBe(true);
    expect(keepApplicant(facts({ status: "DECLINED", appliedAt: new Date("2026-10-05T00:00:00Z") }), petition, f, today)).toBe(false);
    expect(keepApplicant(facts({ status: "DECLINED", appliedAt: new Date("2026-10-05T00:00:00Z") }), petition, { ...f, stage: "all" }, today)).toBe(true);
  });
});
