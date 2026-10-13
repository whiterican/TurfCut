import { describe, expect, it } from "vitest";
import { orgProfileView, type ProfileSource } from "./org-profile";
import { computeScorecard, type Period } from "./scorecard";
import { DEFAULT_SHARING, type SharingChoices } from "./sharing";
import { CONSENT_TEXT_VERSION, type FitPreferences } from "./political-fit";
import type { CredentialRow } from "./credentials";

const now = new Date("2026-10-07T03:00:00Z"); // evening of Oct 6 in the US
const empty = computeScorecard([], { now });
const periods: Record<Period, typeof empty> = { lifetime: empty, "12m": empty, "90d": empty };
const cred: CredentialRow = {
  id: "c1", kind: "CIRCULATOR_REGISTRATION", label: null, state: "CO", identifier: "2345",
  issuedOn: null, expiresOn: new Date("2026-10-06T00:00:00Z"), verification: "SELF_REPORTED",
  supersedesId: null, removed: false, createdAt: now,
};
const pref: FitPreferences = {
  visibilityMode: "APPLIED_TO",
  identityLabels: [{ label: "independent", shared: true }],
  partyRelationship: null,
  issuePositions: {},
  campaignBoundaries: [],
};
const source = (sharing: SharingChoices = DEFAULT_SHARING): ProfileSource<{ id: string; campaign: string; referenceContact: string | null }> => ({
  displayName: "Sam Rivera",
  sharing,
  periods,
  availability: { weekly: { sat: [{ from: "09:00", to: "15:00" }] }, exceptions: [], note: null },
  credentials: [cred],
  experience: [
    { id: "x1", campaign: "Parks bond", referenceContact: "jo@example.org" },
    { id: "x2", campaign: "Transit measure", referenceContact: null },
  ],
  preference: { ...pref, expiresAt: null, consentTextVersion: CONSENT_TEXT_VERSION },
});
const applied = { kind: "org", approved: true, relationship: true } as const;
const stranger = { kind: "org", approved: true, relationship: false } as const;

describe("orgProfileView", () => {
  it("shows an organization the worker applied to what the defaults share", () => {
    const v = orgProfileView(source(), applied, now);
    expect(v.displayName).toBe("Sam Rivera");
    expect(v.scorecard.lifetime.shared).toEqual({ output: true, quality: true, reliability: true, history: true });
    expect(v.availability).toMatchObject({ usual: "Usually free Sat 9am–3pm." });
    expect(v.credentials).toEqual([{ kind: "CIRCULATOR_REGISTRATION", label: null, state: "CO", verification: "SELF_REPORTED", verificationMethod: null, expiresOn: cred.expiresOn }]);
    expect(v.fit.fields.identity).toEqual({ shared: true, lines: expect.any(Array) });
  });

  it("never carries a credential number or a reference's contact details", () => {
    const text = JSON.stringify(orgProfileView(source(), applied, now));
    expect(text).not.toContain("2345");
    expect(text).not.toContain("jo@example.org");
    expect(orgProfileView(source(), applied, now).experience).toEqual([
      { id: "x1", campaign: "Parks bond", hasReference: true },
      { id: "x2", campaign: "Transit measure", hasReference: false },
    ]);
  });

  it("withholds what the worker shares only with organizations they applied to", () => {
    const v = orgProfileView(source(), stranger, now);
    expect(v.scorecard.lifetime.shared).toEqual({ output: false, quality: false, reliability: false, history: false });
    expect(v.availability).toBe("withheld");
    expect(v.credentials).toBe("withheld");
    expect(v.experience).toBe("withheld");
    expect(v.fit.fields.identity).toEqual({ shared: false });
  });

  it("follows each part's own audience", () => {
    const sharing: SharingChoices = { ...DEFAULT_SHARING, audiences: { ...DEFAULT_SHARING.audiences, availability: "ANY_APPROVED_ORG", credentials: "NOBODY" } };
    expect(orgProfileView(source(sharing), stranger, now).availability).not.toBe("withheld");
    expect(orgProfileView(source(sharing), applied, now).credentials).toBe("withheld");
  });

  it("treats experience as hours and history: it goes wherever that part goes", () => {
    const hidden: SharingChoices = { ...DEFAULT_SHARING, audiences: { ...DEFAULT_SHARING.audiences, history: "NOBODY" } };
    expect(orgProfileView(source(hidden), applied, now).experience).toBe("withheld");
    const wide: SharingChoices = { ...DEFAULT_SHARING, audiences: { ...DEFAULT_SHARING.audiences, history: "ANY_APPROVED_ORG" } };
    expect(orgProfileView(source(wide), stranger, now).experience).toHaveLength(2);
  });

  it("shows nothing to the public (a closed account reads as the public), not even the name", () => {
    const v = orgProfileView(source(), { kind: "public" }, now);
    expect(v.displayName).toBeNull();
    expect(v.availability).toBe("withheld");
    expect(v.credentials).toBe("withheld");
    expect(v.experience).toBe("withheld");
    expect(v.fit.fields.identity).toEqual({ shared: false });
  });

  it("gives an unapproved organization nothing, even with a relationship", () => {
    const v = orgProfileView(source(), { kind: "org", approved: false, relationship: true }, now);
    expect(v.displayName).toBeNull();
    expect([v.availability, v.credentials, v.experience]).toEqual(["withheld", "withheld", "withheld"]);
    expect(v.fit.fields.identity).toEqual({ shared: false });
  });

  it("dates credential expiry the way every credential screen does (UTC−10)", () => {
    expect(orgProfileView(source(), applied, now).today).toBe("2026-10-06");
  });
});
