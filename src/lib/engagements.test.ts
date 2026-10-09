import { describe, expect, it } from "vitest";
import { shareScorecard, ALL_SHARED } from "./shared-scorecard";
import { buildSnapshot, RELATIONSHIP_STATUSES, transition, type TransitionContext } from "./engagements";
import { computeScorecard } from "./scorecard";
import { employerFitView } from "./political-fit";

const open: TransitionContext = { jobStatus: "PUBLISHED", hiringModes: ["application", "invite", "instant_claim"], headcount: 2, acceptedCount: 0 };

describe("engagement transitions", () => {
  it("workers apply and claim; orgs invite", () => {
    expect(transition(null, "apply", "worker", open)).toEqual({ ok: true, status: "APPLIED" });
    expect(transition(null, "claim", "worker", open)).toEqual({ ok: true, status: "CLAIMED" });
    expect(transition(null, "invite", "org", open)).toEqual({ ok: true, status: "INVITED" });
    expect(transition(null, "apply", "org", open).ok).toBe(false);
    expect(transition(null, "invite", "worker", open).ok).toBe(false);
  });

  it("orgs accept applications; workers accept invitations — not the other way round", () => {
    expect(transition("APPLIED", "accept", "org", open)).toEqual({ ok: true, status: "ACTIVE" });
    expect(transition("INVITED", "accept", "worker", open)).toEqual({ ok: true, status: "ACTIVE" });
    expect(transition("APPLIED", "accept", "worker", open).ok).toBe(false);
    expect(transition("INVITED", "accept", "org", open).ok).toBe(false);
    expect(transition("ACTIVE", "accept", "org", open).ok).toBe(false);
  });

  it("respects the job's hiring modes and status", () => {
    const appOnly = { ...open, hiringModes: ["application" as const] };
    expect(transition(null, "claim", "worker", appOnly).ok).toBe(false);
    expect(transition(null, "invite", "org", appOnly).ok).toBe(false);
    expect(transition(null, "apply", "worker", { ...open, jobStatus: "DRAFT" }).ok).toBe(false);
    expect(transition("APPLIED", "accept", "org", { ...open, jobStatus: "CLOSED" }).ok).toBe(false);
  });

  it("enforces headcount on claim and accept", () => {
    const full = { ...open, acceptedCount: 2 };
    expect(transition(null, "claim", "worker", full)).toEqual({ ok: false, reason: "Every spot on this job is taken." });
    expect(transition("APPLIED", "accept", "org", full).ok).toBe(false);
    expect(transition("INVITED", "accept", "worker", full).ok).toBe(false);
    expect(transition(null, "apply", "worker", full).ok).toBe(true); // applying doesn't take a seat
  });

  it("won't create a second engagement, and points invited workers to the invitation", () => {
    expect(transition("INVITED", "apply", "worker", open)).toEqual({
      ok: false,
      reason: "You've already been invited to this job — accept the invitation instead.",
    });
    expect(transition("APPLIED", "invite", "org", open).ok).toBe(false);
  });
});

describe("hiring snapshot", () => {
  it("freezes the shared scorecard and only the authorized fit view, with consent and sharing versions and time", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const fit = employerFitView(null, { orgHasRelationship: true });
    const snap = buildSnapshot({ kind: "application", scorecard: shareScorecard(computeScorecard([], { now }), ALL_SHARED), sharingVersion: null, fit, consentVersion: 3, now });
    expect(snap).toMatchObject({ kind: "application", capturedAt: "2026-10-01T12:00:00.000Z", consentVersion: 3, fit });
    expect(snap.scorecard.showRate).toEqual({ value: null, numerator: 0, denominator: 0 });
    expect(snap.scorecard.shared).toEqual({ output: true, quality: true, reliability: true, history: true });
    // A frozen copy: JSON round-trips without loss.
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });
});

describe("hiring snapshot with sharing narrowed", () => {
  it("stores nothing the worker didn't share with the organization", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const fit = employerFitView(null, { orgHasRelationship: true });
    const parts = { ...ALL_SHARED, reliability: false, history: false };
    const m = { value: 0.9, numerator: 9, denominator: 10, formula: "f", evidence: "9 of 10; 1 verified shift on Sep 28, CO" };
    const seg = computeScorecard([], { now });
    const full = {
      ...seg,
      segments: [{
        workType: "PETITION" as const, period: "lifetime" as const, state: null, statesWorked: ["CO"], dateRange: null, dateLabel: "Sep 28, 2026",
        campaignsCount: 1, initiativesCount: 0, shiftsCount: 1, activeHours: 3.5, doorsAttempted: 0, contacts: 0, signaturesSubmitted: 10,
        signaturesReviewed: 10, signaturesAccepted: 9, signaturesRejected: 1,
        averages: { doorsPerActiveHour: m, doorsPerCompletedShift: m, contactRate: m, signaturesPerActiveHour: m, acceptanceRate: m },
        verificationBreakdown: { verifiedShifts: 1, pendingReviewShifts: 0, rejectedShifts: 0, incompleteShifts: 0 }, correctionsApplied: 0, correctionsIgnored: 0,
      }],
    };
    const snap = buildSnapshot({ kind: "application", scorecard: shareScorecard(full, parts), sharingVersion: 4, fit, consentVersion: null, now });
    expect(snap.scorecard.segments).toHaveLength(1);
    expect(snap.scorecard.segments[0].averages.acceptanceRate).toEqual({ value: 0.9, numerator: null, denominator: null });
    expect(JSON.stringify(snap)).not.toMatch(/CO|Sep 28|3\.5|"numerator":\d/);
    expect(snap.scorecard.showRate).toBeNull();
    expect(snap.scorecard.sharingVersion).toBe(4);
    expect(snap.scorecard.shared).toMatchObject({ reliability: false, history: false, output: true });
    expect(snap.scorecard.segments.every((g) => g.shiftsCount === null && g.activeHours === null)).toBe(true);
  });
});

describe("relationship for shared fit answers", () => {
  it("counts only engagements the worker started or accepted", () => {
    // An org's invitation must never unlock answers shared with
    // "organizations you apply to or accept an invitation from".
    expect(RELATIONSHIP_STATUSES).not.toContain("INVITED");
    expect(RELATIONSHIP_STATUSES).not.toContain("CANCELLED");
    expect([...RELATIONSHIP_STATUSES].sort()).toEqual(["ACTIVE", "APPLIED", "CLAIMED", "COMPLETED"]);
  });
});
