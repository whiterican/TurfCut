import { describe, expect, it } from "vitest";
import {
  employerFitView,
  FLOW_STEPS,
  fromRow,
  NOT_SHARED_BASIS,
  samePreferences,
  SHARED_BASIS,
  validatePreferences,
  type CampaignDisclosure,
  type FitPreferences,
} from "./political-fit";

const full: FitPreferences = {
  visibilityMode: "APPLIED_TO",
  identityLabels: [{ label: "independent", shared: true }, { label: "other", text: "pro-labor Catholic" }],
  partyRelationship: { relationship: "cross_partisan", shared: true },
  issuePositions: {
    housing_affordability: { position: "support", importance: "high", shared: true },
    renewable_energy: { position: "lean_support", importance: "medium", shared: true },
    gun_rights: { position: "oppose", shared: true },
    minimum_wage: { position: "support" }, // answered, not shared
    abortion_access: { position: "private" },
  },
  campaignBoundaries: [
    { kind: "campaign_type", target: "ballot_measure", stance: "actively_interested", shared: true },
    { kind: "campaign_type", target: "candidate", stance: "ask_me_first", shared: true },
    { kind: "party", target: "libertarian", stance: "do_not_match", shared: true },
    { kind: "measure", target: "Denver Initiative 305", stance: "open_to" },
  ],
};

const campaign: CampaignDisclosure = {
  issues: { housing_affordability: "support", renewable_energy: "support", gun_rights: "support", minimum_wage: "support" },
};

describe("flow order", () => {
  it("runs visibility → identity → party → issues → boundaries → review", () => {
    expect(FLOW_STEPS).toEqual(["visibility", "identity", "party", "issues", "boundaries", "review"]);
  });
});

describe("validatePreferences — explicit answers only (spec p.8)", () => {
  it("accepts a complete set of spec-shaped answers", () => {
    const r = validatePreferences(full);
    expect(r.ok && r.value).toEqual(full);
  });

  it("requires an explicit visibility mode — there is no default", () => {
    expect(validatePreferences({ ...full, visibilityMode: undefined }).ok).toBe(false);
  });

  it("stores skipped steps as null (not answered), never a guess", () => {
    const r = validatePreferences({ visibilityMode: "MATCHING_ONLY" });
    expect(r.ok && r.value).toEqual({
      visibilityMode: "MATCHING_ONLY",
      identityLabels: null,
      partyRelationship: null,
      issuePositions: null,
      campaignBoundaries: null,
    });
  });

  it("allows free text for identity 'other', trimmed and length-limited", () => {
    const r = validatePreferences({ visibilityMode: "PRIVATE", identityLabels: [{ label: "other", text: "  green   conservative " }] });
    expect(r.ok && r.value.identityLabels).toEqual([{ label: "other", text: "green conservative" }]);
    expect(validatePreferences({ visibilityMode: "PRIVATE", identityLabels: [{ label: "other" }] }).ok).toBe(false);
    expect(validatePreferences({ visibilityMode: "PRIVATE", identityLabels: [{ label: "other", text: "x".repeat(61) }] }).ok).toBe(false);
  });

  it("describes party relationship, not voter registration", () => {
    const ok = [
      { relationship: "member_supporter", party: "democratic" },
      { relationship: "leans_toward", party: "republican" },
      { relationship: "leans_toward", party: "other", text: "Working Families" },
      { relationship: "no_affiliation" },
      { relationship: "cross_partisan" },
      { relationship: "other", text: "It's complicated" },
    ];
    for (const p of ok) expect(validatePreferences({ visibilityMode: "PRIVATE", partyRelationship: p }).ok).toBe(true);
    const bad = [
      { registered: "unaffiliated" }, // the old registration shape
      { relationship: "leans_toward" }, // missing party
      { relationship: "no_affiliation", party: "green" },
      { relationship: "other" }, // missing text
    ];
    for (const p of bad) expect(validatePreferences({ visibilityMode: "PRIVATE", partyRelationship: p }).ok).toBe(false);
  });

  it("uses the seven-point scale with optional importance, and a private answer can't be shared", () => {
    expect(validatePreferences({ visibilityMode: "PRIVATE", issuePositions: { gun_rights: { position: "lean_oppose", importance: "low" } } }).ok).toBe(true);
    expect(validatePreferences({ visibilityMode: "PRIVATE", issuePositions: { gun_rights: { position: "unsure" } } }).ok).toBe(true);
    expect(validatePreferences({ visibilityMode: "PRIVATE", issuePositions: { gun_rights: { position: "private", shared: true } } }).ok).toBe(false);
    expect(validatePreferences({ visibilityMode: "PRIVATE", issuePositions: { gun_rights: { position: "strongly oppose" } } }).ok).toBe(false);
  });

  it("accepts boundaries for campaign types, parties, issues and named targets", () => {
    const r = validatePreferences({
      visibilityMode: "PRIVATE",
      campaignBoundaries: [
        { kind: "issue", target: "immigration", stance: "do_not_match" },
        { kind: "organization", target: "Acme Strategies", stance: "ask_me_first" },
        { kind: "candidate", target: "Jane Doe for Council", stance: "actively_interested" },
      ],
    });
    expect(r.ok).toBe(true);
    for (const b of [
      { kind: "party", target: "whig", stance: "open_to" },
      { kind: "issue", target: "made_up", stance: "open_to" },
      { kind: "measure", target: "   ", stance: "open_to" },
      { kind: "campaign_type", target: "candidate", stance: "maybe" },
    ]) {
      expect(validatePreferences({ visibilityMode: "PRIVATE", campaignBoundaries: [b] }).ok).toBe(false);
    }
  });

  it("rejects fields nobody asked for, like a score", () => {
    expect(validatePreferences({ ...full, ideologyScore: 0.7 }).ok).toBe(false);
    expect(validatePreferences({ ...full, identityLabels: [{ label: "independent", inferred: true }] }).ok).toBe(false);
  });
});

describe("samePreferences", () => {
  it("ignores ordering so re-consenting identical answers is a no-op", () => {
    const shuffled: FitPreferences = {
      ...full,
      identityLabels: [...full.identityLabels!].reverse(),
      campaignBoundaries: [...full.campaignBoundaries!].reverse(),
    };
    expect(samePreferences(full, shuffled)).toBe(true);
    expect(samePreferences(full, { ...full, visibilityMode: "MATCHING_ONLY" })).toBe(false);
    expect(samePreferences(full, { ...full, partyRelationship: { relationship: "cross_partisan" } })).toBe(false);
  });
});

describe("employerFitView — worker-authorized overlap only", () => {
  const notShared = {
    fields: { identity: { shared: false }, party: { shared: false }, issues: { shared: false }, boundaries: { shared: false } },
    basis: NOT_SHARED_BASIS,
  };

  it("never shows the full issue questionnaire — only agreement with disclosed positions", () => {
    const view = employerFitView(full, { orgHasRelationship: true, campaign });
    expect(view.fields.issues).toEqual({
      shared: true,
      lines: [
        "Agrees with the campaign's position on housing affordability (high importance)",
        "Leans toward the campaign's position on renewable energy",
      ],
    });
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/gun|minimum|abortion|oppose/i); // disagreement, unshared and private answers stay out
  });

  it("shows no issues at all when the campaign hasn't disclosed positions", () => {
    expect(employerFitView(full, { orgHasRelationship: true }).fields.issues).toEqual({ shared: false });
    expect(employerFitView(full, { orgHasRelationship: true, campaign: null }).fields.issues).toEqual({ shared: false });
  });

  it("shows only answers the worker marked shared, and only positive campaign interests", () => {
    const view = employerFitView(full, { orgHasRelationship: true, campaign });
    expect(view.fields.identity).toEqual({ shared: true, lines: ["independent"] });
    expect(view.fields.party).toEqual({ shared: true, lines: ["Cross-partisan"] });
    expect(view.fields.boundaries).toEqual({ shared: true, lines: ["Actively interested: ballot measures"] });
    expect(JSON.stringify(view)).not.toMatch(/libertarian|do not match|ask me first|Initiative 305|pro-labor/i);
    expect(view.basis).toBe(SHARED_BASIS);
  });

  it("shows nothing for MATCHING_ONLY, even to an org the worker applied to", () => {
    expect(employerFitView({ ...full, visibilityMode: "MATCHING_ONLY" }, { orgHasRelationship: true, campaign })).toEqual(notShared);
  });

  it("makes every not-shared case indistinguishable, so withholding is never a signal", () => {
    const nothingShared: FitPreferences = {
      ...full,
      identityLabels: full.identityLabels!.map((a) => ({ label: a.label, ...(a.text ? { text: a.text } : {}) })),
      partyRelationship: { relationship: "cross_partisan" },
      issuePositions: { gun_rights: { position: "oppose", shared: true } }, // disagrees with campaign
      campaignBoundaries: [{ kind: "party", target: "green", stance: "do_not_match", shared: true }],
    };
    const cases = [
      employerFitView(null, { orgHasRelationship: true, campaign }),
      employerFitView({ ...full, visibilityMode: "PRIVATE" }, { orgHasRelationship: true, campaign }),
      employerFitView({ ...full, visibilityMode: "MATCHING_ONLY" }, { orgHasRelationship: false, campaign }),
      employerFitView({ ...full, visibilityMode: "APPROVED_RECRUITERS" }, { orgHasRelationship: true, campaign }),
      employerFitView(full, { orgHasRelationship: false, campaign }),
      employerFitView(nothingShared, { orgHasRelationship: true, campaign }),
    ];
    for (const c of cases) expect(c).toEqual(notShared);
  });

  it("never exposes the visibility mode", () => {
    expect(JSON.stringify(employerFitView(full, { orgHasRelationship: true, campaign }))).not.toMatch(
      /APPLIED_TO|MATCHING_ONLY|PRIVATE|visibility/i
    );
  });
});

describe("fromRow", () => {
  it("reads the M0 seeded row without adding anything", () => {
    expect(
      fromRow({ visibilityMode: "MATCHING_ONLY", identityLabels: ["unaffiliated"], partyRelationship: null, issuePositions: null, campaignBoundaries: null })
    ).toEqual({
      visibilityMode: "MATCHING_ONLY",
      identityLabels: [{ label: "other", text: "unaffiliated" }],
      partyRelationship: null,
      issuePositions: null,
      campaignBoundaries: null,
    });
    expect(fromRow({ visibilityMode: "PRIVATE", identityLabels: ["independent"], partyRelationship: null, issuePositions: null, campaignBoundaries: null }).identityLabels).toEqual([
      { label: "independent" },
    ]);
  });

  it("drops stored values that no longer validate instead of guessing", () => {
    const p = fromRow({ visibilityMode: "PRIVATE", identityLabels: null, partyRelationship: { registered: "democratic" }, issuePositions: null, campaignBoundaries: null });
    expect(p.partyRelationship).toBeNull();
  });
});
