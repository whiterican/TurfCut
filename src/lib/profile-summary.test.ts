import { describe, expect, it } from "vitest";
import { profileScorecardSummary } from "./profile-summary";
import { computeScorecard, type ScorecardShift } from "./scorecard";
import { ALL_SHARED, shareScorecard } from "./shared-scorecard";
import { SEED_SHIFT_EVENTS } from "../../prisma/seed-fixture";

const start = new Date("2026-11-01T09:00:00Z");
function shift(id: string, workType: "PETITION" | "CANVASS"): ScorecardShift {
  return { id, engagementId: id, engagementStatus: "ACTIVE", workType, state: "CO", status: "COMPLETED",
    startsAt: start, endsAt: new Date(start.getTime() + 8 * 3600000), scheduledAt: new Date("2026-10-30"),
    events: SEED_SHIFT_EVENTS.map(e => ({ ...e, id: `${id}-${e.id}`, createdAt: new Date(start.getTime() + e.offsetMs) })),
    validations: [{ workEventId: null, status: "APPROVED", createdAt: new Date("2026-11-02") }] };
}
const now = new Date("2026-11-03");
describe("consent-safe work summaries", () => {
  it("uses empty words when shared history has no verified work, retaining a shared show rate", () => {
    const scorecard = shareScorecard(computeScorecard([], { now }), ALL_SHARED);
    expect(profileScorecardSummary(scorecard)).toBe("No verified shifts yet");
    scorecard.showRate = { value: 0, formula: "worked / scheduled", numerator: 0, denominator: 1, evidence: "0 of 1 scheduled shifts worked" };
    expect(profileScorecardSummary(scorecard)).toBe("No verified shifts yet · 0% show rate");
  });
  it("keeps mixed work types distinct without dropping doors or aggregating shifts/hours", () => {
    const scorecard = shareScorecard(computeScorecard([shift("p", "PETITION"), shift("c", "CANVASS")], { now }), ALL_SHARED);
    const summary = profileScorecardSummary(scorecard);
    expect(summary).toContain("Petition circulation: 1 verified shift · 20 accepted signatures · 3.5 verified hours");
    expect(summary).toContain("Door-to-door canvass: 1 verified shift · 40 doors attempted · 3.5 verified hours");
    expect(summary).not.toContain("2 verified shifts");
    expect(summary).not.toContain("7 verified hours");
    expect(summary).toContain("100% show rate");
  });
  it("does not reveal work types, totals or empty history when only a rate is shared", () => {
    const scorecard = shareScorecard(computeScorecard([shift("p", "PETITION"), shift("c", "CANVASS")], { now }), { ...ALL_SHARED, history: false });
    expect(profileScorecardSummary(scorecard)).toBe("100% show rate");
  });
});
