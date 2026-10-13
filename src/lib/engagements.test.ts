import { describe, expect, it } from "vitest";
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
  it("freezes the scorecard and only the authorized fit view, with consent version and time", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const fit = employerFitView(null, { orgHasRelationship: true });
    const snap = buildSnapshot({ kind: "application", scorecard: computeScorecard([], { now }), fit, consentVersion: 3, now });
    expect(snap).toMatchObject({ kind: "application", capturedAt: "2026-10-01T12:00:00.000Z", consentVersion: 3, fit });
    expect(snap.scorecard.showRate).toEqual({ value: null, numerator: 0, denominator: 0 });
    // A frozen copy: JSON round-trips without loss.
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });
});

describe("relationship for shared fit answers", () => {
  it("counts only engagements the worker started or accepted", () => {
    // An org's invitation must never unlock answers shared with
    // "organizations you apply to, claim a spot with or accept an invitation from".
    expect(RELATIONSHIP_STATUSES).not.toContain("INVITED");
    expect(RELATIONSHIP_STATUSES).not.toContain("CANCELLED");
    expect([...RELATIONSHIP_STATUSES].sort()).toEqual(["ACTIVE", "APPLIED", "CLAIMED", "COMPLETED"]);
  });
});
