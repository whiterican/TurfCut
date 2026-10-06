import { describe, expect, it } from "vitest";
import {
  canSee,
  DEFAULT_SHARING,
  METRIC_GROUP,
  sameSharing,
  SHARE_GROUPS,
  SHARE_PARTS,
  sharingFromRow,
  sharingToRow,
  validateSharing,
  visibleParts,
  type ShareAudience,
  type Viewer,
} from "./sharing";

const self: Viewer = { kind: "self" };
const related: Viewer = { kind: "org", approved: true, relationship: true };
const approved: Viewer = { kind: "org", approved: true, relationship: false };
const unapprovedRelated: Viewer = { kind: "org", approved: false, relationship: true };
const unapproved: Viewer = { kind: "org", approved: false, relationship: false };
const pub: Viewer = { kind: "public" };

const all = (a: ShareAudience) => Object.fromEntries(SHARE_PARTS.map((p) => [p, a]));

describe("who sees what", () => {
  const table: Array<[ShareAudience, Viewer, boolean]> = [
    ["RELATIONSHIP", self, true],
    ["RELATIONSHIP", related, true],
    ["RELATIONSHIP", approved, false],
    ["RELATIONSHIP", unapprovedRelated, false],
    ["RELATIONSHIP", unapproved, false],
    ["RELATIONSHIP", pub, false],
    ["ANY_APPROVED_ORG", self, true],
    ["ANY_APPROVED_ORG", related, true],
    ["ANY_APPROVED_ORG", approved, true],
    ["ANY_APPROVED_ORG", unapprovedRelated, false],
    ["ANY_APPROVED_ORG", unapproved, false],
    ["ANY_APPROVED_ORG", pub, false],
    ["NOBODY", self, true],
    ["NOBODY", related, false],
    ["NOBODY", approved, false],
    ["NOBODY", unapprovedRelated, false],
    ["NOBODY", unapproved, false],
    ["NOBODY", pub, false],
  ];
  it.each(table)("%s seen by %j → %s", (audience, viewer, expected) => {
    expect(canSee(audience, viewer)).toBe(expected);
  });

  it("each part follows its own audience", () => {
    const c = { ...DEFAULT_SHARING, audiences: { ...DEFAULT_SHARING.audiences, quality: "NOBODY" as const, availability: "ANY_APPROVED_ORG" as const } };
    expect(visibleParts(c, approved)).toEqual({ output: false, quality: false, reliability: false, history: false, availability: true, credentials: false });
    expect(visibleParts(c, related)).toEqual({ output: true, quality: false, reliability: true, history: true, availability: true, credentials: true });
    expect(Object.values(visibleParts(c, self)).every(Boolean)).toBe(true);
  });

  it("defaults keep what organizations saw before C2: related orgs see everything, nobody else does, not findable", () => {
    expect(Object.values(visibleParts(DEFAULT_SHARING, related)).every(Boolean)).toBe(true);
    expect(Object.values(visibleParts(DEFAULT_SHARING, approved)).some(Boolean)).toBe(false);
    expect(Object.values(visibleParts(DEFAULT_SHARING, pub)).some(Boolean)).toBe(false);
    expect(DEFAULT_SHARING.findable).toBe(false);
  });

  it("every scorecard average belongs to a group (C2-Q1)", () => {
    for (const k of ["doorsPerActiveHour", "doorsPerCompletedShift", "signaturesPerActiveHour", "acceptanceRate", "contactRate", "showRate"]) {
      expect(SHARE_GROUPS).toContain(METRIC_GROUP[k]);
    }
  });
});

describe("validateSharing", () => {
  it("accepts a full choice and normalizes it", () => {
    const v = validateSharing({ audiences: all("NOBODY"), findable: true, workTypes: ["PETITION", "CANVASS", "PETITION"], homeArea: "  Denver,   CO ", travelMiles: "25" });
    expect(v).toEqual({ ok: true, value: { audiences: all("NOBODY"), readReceipts: false, findable: true, workTypes: ["CANVASS", "PETITION"], homeArea: "Denver, CO", travelMiles: 25 } });
  });

  it("needs an audience for every part and refuses unknown ones", () => {
    const v = validateSharing({ audiences: { ...all("NOBODY"), quality: "EVERYONE", extra: "NOBODY" } });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errors).sort()).toEqual(["audiences", "quality"]);
    const missing = validateSharing({ audiences: { output: "NOBODY" } });
    expect(!missing.ok && Object.keys(missing.errors).length).toBe(5);
  });

  it("findable needs work types, a typed area and a radius", () => {
    const v = validateSharing({ audiences: all("RELATIONSHIP"), findable: true });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errors).sort()).toEqual(["homeArea", "travelMiles", "workTypes"]);
  });

  it("keeps a typed area while not findable, and refuses bad values", () => {
    expect(validateSharing({ audiences: all("RELATIONSHIP"), findable: false, homeArea: "80202", travelMiles: 10 }).ok).toBe(true);
    for (const bad of [
      { travelMiles: 0 }, { travelMiles: 501 }, { travelMiles: 2.5 }, { travelMiles: "ten" },
      { homeArea: "x".repeat(81) }, { homeArea: "Denver\u0007CO" }, { homeArea: 80202 },
      { workTypes: ["DOORS"] }, { workTypes: "PETITION" }, { findable: "yes" }, { readReceipts: 1 },
    ]) {
      expect({ bad, ok: validateSharing({ audiences: all("RELATIONSHIP"), ...bad }).ok }).toEqual({ bad, ok: false });
    }
  });

  it("refuses non-objects", () => {
    for (const raw of [null, undefined, "x", [], 3]) expect(validateSharing(raw).ok).toBe(false);
  });
});

describe("rows", () => {
  it("round-trips through the row shape, and sameSharing ignores work-type order", () => {
    const v = validateSharing({ audiences: { ...all("RELATIONSHIP"), history: "ANY_APPROVED_ORG" }, findable: true, workTypes: ["PETITION"], homeArea: "Boulder", travelMiles: 40, readReceipts: true });
    if (!v.ok) throw new Error("invalid");
    expect(sharingFromRow(sharingToRow(v.value))).toEqual(v.value);
    expect(sameSharing(v.value, { ...v.value, workTypes: ["PETITION"] })).toBe(true);
    expect(sameSharing(v.value, { ...v.value, travelMiles: 41 })).toBe(false);
    expect(sameSharing(v.value, { ...v.value, audiences: { ...v.value.audiences, credentials: "NOBODY" } })).toBe(false);
    expect(sameSharing(DEFAULT_SHARING, DEFAULT_SHARING)).toBe(true);
  });
});
