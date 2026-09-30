import { describe, expect, it } from "vitest";
import {
  employerFitView,
  FLOW_STEPS,
  fromRow,
  NOT_SHARED_BASIS,
  samePreferences,
  validatePreferences,
  type FitPreferences,
} from "./political-fit";

const full: FitPreferences = {
  visibilityMode: "APPLIED_TO",
  identityLabels: ["pro-labor", "moderate"],
  partyRelationship: { registered: "unaffiliated", leans: "varies" },
  issuePositions: { minimum_wage: "support", tax_increases: "neutral" },
  campaignBoundaries: {
    willNotWorkFor: ["libertarian"],
    willNotWorkOn: [{ issue: "labor_unions", side: "oppose" }],
  },
};

describe("flow order", () => {
  it("runs visibility → identity → party → issues → boundaries → review", () => {
    expect(FLOW_STEPS).toEqual(["visibility", "identity", "party", "issues", "boundaries", "review"]);
  });
});

describe("validatePreferences — explicit choices only", () => {
  it("accepts a complete, listed set of answers", () => {
    const r = validatePreferences(full);
    expect(r.ok && r.value).toEqual(full);
  });

  it("requires an explicit visibility mode — there is no default", () => {
    const r = validatePreferences({ ...full, visibilityMode: undefined });
    expect(!r.ok && r.errors.visibilityMode).toBeTruthy();
  });

  it("stores skipped questions as null (not answered), never a guess", () => {
    const r = validatePreferences({ visibilityMode: "MATCHING_ONLY" });
    expect(r.ok && r.value).toEqual({
      visibilityMode: "MATCHING_ONLY",
      identityLabels: null,
      partyRelationship: null,
      issuePositions: null,
      campaignBoundaries: null,
    });
  });

  it("treats empty selections as not answered", () => {
    const r = validatePreferences({
      visibilityMode: "PRIVATE",
      identityLabels: [],
      partyRelationship: { registered: null, leans: null },
      issuePositions: {},
      campaignBoundaries: { willNotWorkFor: [], willNotWorkOn: [] },
    });
    expect(r.ok && r.value.identityLabels).toBeNull();
    expect(r.ok && r.value.partyRelationship).toBeNull();
    expect(r.ok && r.value.issuePositions).toBeNull();
    expect(r.ok && r.value.campaignBoundaries).toBeNull();
  });

  it("rejects values outside the offered options instead of coercing them", () => {
    for (const bad of [
      { ...full, identityLabels: ["far-left radical"] },
      { ...full, partyRelationship: { registered: "whig", leans: null } },
      { ...full, issuePositions: { minimum_wage: "strongly support" } },
      { ...full, issuePositions: { made_up_issue: "support" } },
      { ...full, campaignBoundaries: { willNotWorkFor: [], willNotWorkOn: [{ issue: "gun_rights", side: "neutral" }] } },
      { ...full, ideologyScore: 0.7 },
    ]) {
      expect(validatePreferences(bad).ok).toBe(false);
    }
  });
});

describe("samePreferences", () => {
  it("ignores ordering so re-consenting identical answers is a no-op", () => {
    const shuffled: FitPreferences = {
      ...full,
      identityLabels: ["moderate", "pro-labor"],
      issuePositions: { tax_increases: "neutral", minimum_wage: "support" },
    };
    expect(samePreferences(full, shuffled)).toBe(true);
    expect(samePreferences(full, { ...full, visibilityMode: "MATCHING_ONLY" })).toBe(false);
  });
});

describe("employerFitView — authorized overlap only", () => {
  const notShared = {
    fields: {
      identity: { shared: false },
      party: { shared: false },
      issues: { shared: false },
      boundaries: { shared: false },
    },
    basis: NOT_SHARED_BASIS,
  };

  it("shows nothing for MATCHING_ONLY, even to an org the worker applied to", () => {
    const view = employerFitView({ ...full, visibilityMode: "MATCHING_ONLY" }, { orgHasRelationship: true });
    expect(view).toEqual(notShared);
  });

  it("makes every not-shared case indistinguishable, so withholding is never a signal", () => {
    const cases = [
      employerFitView(null, { orgHasRelationship: true }),
      employerFitView({ ...full, visibilityMode: "PRIVATE" }, { orgHasRelationship: true }),
      employerFitView({ ...full, visibilityMode: "MATCHING_ONLY" }, { orgHasRelationship: false }),
      employerFitView({ ...full, visibilityMode: "APPROVED_RECRUITERS" }, { orgHasRelationship: true }),
      employerFitView({ ...full, visibilityMode: "APPLIED_TO" }, { orgHasRelationship: false }),
      employerFitView(
        { visibilityMode: "APPLIED_TO", identityLabels: null, partyRelationship: null, issuePositions: null, campaignBoundaries: null },
        { orgHasRelationship: true }
      ),
    ];
    for (const c of cases) expect(c).toEqual(notShared);
  });

  it("never exposes the visibility mode", () => {
    const view = employerFitView(full, { orgHasRelationship: true });
    expect(JSON.stringify(view)).not.toMatch(/APPLIED_TO|MATCHING_ONLY|PRIVATE|visibility/i);
  });

  it("shows APPLIED_TO answers to an org the worker has a relationship with, and explains why", () => {
    const view = employerFitView(full, { orgHasRelationship: true });
    expect(view.fields.identity).toEqual({ shared: true, lines: ["pro-labor, moderate"] });
    expect(view.fields.party).toEqual({ shared: true, lines: ["Registered: unaffiliated · Leans: varies"] });
    expect(view.fields.boundaries).toEqual({
      shared: true,
      lines: ["Won't work for libertarian campaigns", "Won't campaign to oppose labor unions / right to organize"],
    });
    expect(view.basis).toMatch(/chose to share/);
  });

  it("renders skipped questions as not shared, even when other answers are shared", () => {
    const view = employerFitView({ ...full, issuePositions: null }, { orgHasRelationship: true });
    expect(view.fields.issues).toEqual({ shared: false });
    expect(view.fields.identity.shared).toBe(true);
  });
});

describe("fromRow", () => {
  it("reads the M0 seeded row without adding anything", () => {
    const p = fromRow({
      visibilityMode: "MATCHING_ONLY",
      identityLabels: ["unaffiliated"],
      partyRelationship: null,
      issuePositions: null,
      campaignBoundaries: null,
    });
    expect(p).toEqual({
      visibilityMode: "MATCHING_ONLY",
      identityLabels: ["unaffiliated"],
      partyRelationship: null,
      issuePositions: null,
      campaignBoundaries: null,
    });
  });
});
