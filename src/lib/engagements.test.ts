import { describe, expect, it } from "vitest";
import { shareScorecard, ALL_SHARED } from "./shared-scorecard";
import { buildSnapshot, cleanNote, eventFor, offerExpiresAt, RELATIONSHIP_STATUSES, transition, workerStage, type TransitionContext } from "./engagements";
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

  it("an org answers an application with an offer; only the worker's accept starts the job (C3)", () => {
    // "accept" by the org (the pre-C3 API) now sends an offer.
    expect(transition("APPLIED", "accept", "org", open)).toEqual({ ok: true, status: "OFFERED" });
    expect(transition("APPLIED", "offer", "org", open)).toEqual({ ok: true, status: "OFFERED" });
    expect(transition("OFFERED", "accept", "worker", open)).toEqual({ ok: true, status: "ACTIVE" });
    expect(transition("INVITED", "accept", "worker", open)).toEqual({ ok: true, status: "ACTIVE" });
    expect(transition("APPLIED", "accept", "worker", open).ok).toBe(false);
    expect(transition("INVITED", "accept", "org", open).ok).toBe(false);
    expect(transition("OFFERED", "accept", "org", open).ok).toBe(false);
    expect(transition("ACTIVE", "accept", "org", open).ok).toBe(false);
    expect(transition("APPLIED", "offer", "worker", open).ok).toBe(false);
  });

  it("an expired offer can't be accepted; a full job can't take an offer or its accept", () => {
    expect(transition("OFFERED", "accept", "worker", { ...open, offerExpired: true })).toMatchObject({ ok: false, reason: expect.stringMatching(/expired/) });
    const full = { ...open, headcount: 1, acceptedCount: 1 };
    expect(transition("APPLIED", "offer", "org", full).ok).toBe(false);
    expect(transition("OFFERED", "accept", "worker", full).ok).toBe(false);
    expect(offerExpiresAt(new Date("2026-10-09T10:00:00Z")).toISOString()).toBe("2026-10-11T10:00:00.000Z");
  });

  it("a lapsed offer can be sent again; a live one can't be doubled", () => {
    expect(transition("OFFERED", "offer", "org", { ...open, offerExpired: true })).toEqual({ ok: true, status: "OFFERED" });
    expect(transition("OFFERED", "offer", "org", open)).toMatchObject({ ok: false, reason: expect.stringMatching(/already waiting/) });
    expect(transition("OFFERED", "offer", "worker", { ...open, offerExpired: true }).ok).toBe(false);
    expect(transition("OFFERED", "offer", "org", { ...open, offerExpired: true, jobStatus: "CLOSED" }).ok).toBe(false);
    expect(eventFor("offer", "org", "OFFERED", "OFFERED")).toBe("OFFERED");
  });

  it("a live offer holds a seat against new offers, claims and invitations, but not against itself", () => {
    const held = { ...open, headcount: 2, acceptedCount: 1, liveOffers: 1 };
    expect(transition("APPLIED", "offer", "org", held)).toMatchObject({ ok: false, reason: expect.stringMatching(/offer out/) });
    expect(transition(null, "claim", "worker", held)).toMatchObject({ ok: false, reason: expect.stringMatching(/offer out/) });
    expect(transition("INVITED", "accept", "worker", held)).toMatchObject({ ok: false, reason: expect.stringMatching(/offer out/) });
    // liveOffers counts the other offers, so the worker holding one can accept it.
    expect(transition("OFFERED", "accept", "worker", held)).toEqual({ ok: true, status: "ACTIVE" });
    // Applying and inviting take no seat.
    expect(transition(null, "apply", "worker", held).ok).toBe(true);
    expect(transition(null, "invite", "org", held).ok).toBe(true);
    // No headcount: nothing is held.
    expect(transition("APPLIED", "offer", "org", { ...held, headcount: null }).ok).toBe(true);
  });

  it("offers and accepts on paused and closed jobs", () => {
    const paused = { ...open, jobStatus: "PAUSED" as const };
    const closed = { ...open, jobStatus: "CLOSED" as const };
    expect(transition("APPLIED", "offer", "org", paused).ok).toBe(true);
    expect(transition("OFFERED", "accept", "worker", paused).ok).toBe(true);
    expect(transition("APPLIED", "review", "org", paused).ok).toBe(true);
    expect(transition("APPLIED", "offer", "org", closed).ok).toBe(false);
    expect(transition("OFFERED", "accept", "worker", closed).ok).toBe(false);
    expect(transition("INVITED", "accept", "worker", closed).ok).toBe(false);
    expect(transition("APPLIED", "review", "org", closed).ok).toBe(false);
    // Close-outs still work, so nothing is left hanging on a closed job.
    expect(transition("APPLIED", "decline", "org", closed).ok).toBe(true);
    expect(transition("OFFERED", "decline", "org", closed).ok).toBe(true);
    expect(transition("INVITED", "withdraw", "org", closed).ok).toBe(true);
    expect(transition("OFFERED", "decline", "worker", closed).ok).toBe(true);
  });

  it("an org pointed at an invitation is told to withdraw it", () => {
    expect(transition("INVITED", "decline", "org", open)).toEqual({ ok: false, reason: "Withdraw the invitation instead." });
  });

  it("a note keeps its line breaks and folds the rest", () => {
    expect(cleanNote("  Thanks   for\tapplying \r\n\r\n\r\n\n  See you  ")).toBe("Thanks for applying\n\nSee you");
    expect(cleanNote("   \n  ")).toBeNull();
    expect(cleanNote(undefined)).toBeNull();
  });

  it("in review is a step on an application, once, and only by the org", () => {
    expect(transition("APPLIED", "review", "org", open)).toEqual({ ok: true, status: "APPLIED" });
    expect(transition("APPLIED", "review", "org", { ...open, inReview: true }).ok).toBe(false);
    expect(transition("APPLIED", "review", "worker", open).ok).toBe(false);
    expect(transition("INVITED", "review", "org", open).ok).toBe(false);
  });

  it("declining and withdrawing: who can, and from where", () => {
    expect(transition("APPLIED", "decline", "org", open)).toEqual({ ok: true, status: "DECLINED" });
    expect(transition("OFFERED", "decline", "org", open)).toEqual({ ok: true, status: "DECLINED" });
    expect(transition("INVITED", "decline", "worker", open)).toEqual({ ok: true, status: "DECLINED" });
    expect(transition("OFFERED", "decline", "worker", open)).toEqual({ ok: true, status: "DECLINED" });
    expect(transition("APPLIED", "decline", "worker", open).ok).toBe(false);
    expect(transition("ACTIVE", "decline", "org", open).ok).toBe(false);
    expect(transition("APPLIED", "withdraw", "worker", open)).toEqual({ ok: true, status: "WITHDRAWN" });
    expect(transition("OFFERED", "withdraw", "worker", open)).toEqual({ ok: true, status: "WITHDRAWN" });
    expect(transition("INVITED", "withdraw", "org", open)).toEqual({ ok: true, status: "WITHDRAWN" });
    expect(transition("ACTIVE", "withdraw", "worker", open).ok).toBe(false);
    expect(transition("APPLIED", "withdraw", "org", open).ok).toBe(false);
    for (const end of ["DECLINED", "WITHDRAWN"] as const) {
      for (const a of ["accept", "offer", "review", "decline", "withdraw"] as const) {
        for (const who of ["org", "worker"] as const) expect(transition(end, a, who, open).ok).toBe(false);
      }
    }
    expect(transition(null, "offer", "org", open).ok).toBe(false);
  });

  it("each step records the event the worker and org see", () => {
    expect(eventFor("accept", "org", "APPLIED", "OFFERED")).toBe("OFFERED");
    expect(eventFor("accept", "worker", "OFFERED", "ACTIVE")).toBe("OFFER_ACCEPTED");
    expect(eventFor("accept", "worker", "INVITED", "ACTIVE")).toBe("INVITE_ACCEPTED");
    expect(eventFor("decline", "org", "APPLIED", "DECLINED")).toBe("NOT_SELECTED");
    expect(eventFor("decline", "worker", "OFFERED", "DECLINED")).toBe("OFFER_DECLINED");
    expect(eventFor("decline", "worker", "INVITED", "DECLINED")).toBe("INVITE_DECLINED");
    expect(eventFor("withdraw", "org", "INVITED", "WITHDRAWN")).toBe("INVITE_WITHDRAWN");
    expect(eventFor("withdraw", "worker", "APPLIED", "WITHDRAWN")).toBe("WITHDRAWN");
  });

  it("the worker's stage reads from status and history", () => {
    expect(workerStage("APPLIED", [{ type: "APPLIED" }])).toBe("Applied");
    expect(workerStage("APPLIED", [{ type: "APPLIED" }, { type: "IN_REVIEW" }])).toBe("In review");
    expect(workerStage("OFFERED", [], true)).toBe("Offer expired");
    expect(workerStage("DECLINED", [{ type: "NOT_SELECTED" }])).toBe("Not selected");
    expect(workerStage("DECLINED", [{ type: "OFFER_DECLINED" }])).toBe("Declined");
    expect(workerStage("WITHDRAWN", [{ type: "INVITE_WITHDRAWN" }])).toBe("Invitation withdrawn");
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
    expect(RELATIONSHIP_STATUSES).not.toContain("WITHDRAWN");
    expect(RELATIONSHIP_STATUSES).not.toContain("DECLINED");
    expect([...RELATIONSHIP_STATUSES].sort()).toEqual(["ACTIVE", "APPLIED", "CLAIMED", "COMPLETED", "OFFERED"]);
  });
});
