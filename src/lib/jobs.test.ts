import { describe, expect, it } from "vitest";
import {
  payShort,
  jobToForm,
  parseFeedFilters,
  canScheduleShift,
  compensationProblem,
  exclusionReasons,
  jobCardAnswers,
  publishBlockers,
  readHiringModes,
  validateJob,
  type JobDisclosure,
  type JurisdictionFacts,
  type PublishFacts,
} from "./jobs";
import type { FitPreferences } from "./political-fit";

const now = new Date("2026-10-01T12:00:00Z");
const SEED_RULES = { compensationAllowed: ["HOURLY", "SHIFT_RATE"], perUnitAllowed: false, workerRegistrationRequired: true, badgeRequired: true, affidavitRequired: true };
const denver: JurisdictionFacts = { state: "CO", locality: "Denver", version: 1, approved: true, isCurrent: true, effectiveFrom: null, approvalExpiresAt: null, rules: SEED_RULES };
const disclosure: JobDisclosure = {
  campaignType: "ballot_measure",
  affiliation: "nonpartisan",
  campaignName: "Initiative 305",
  issues: { housing_affordability: "support" },
  message: "Put affordable housing on the ballot.",
};
const contacts = { emergency: "Field lead, 555-0100", disputes: "ops@frc.example", lostMaterials: "Office, 555-0101" };

const ready = (): PublishFacts => ({
  job: {
    status: "DRAFT",
    compensationMethod: "HOURLY",
    payRateCents: 2500,
    headcount: 10,
    startsAt: new Date("2026-10-05"),
    endsAt: new Date("2026-11-05"),
    campaignDisclosure: disclosure,
    supportContacts: contacts,
    hiringMethod: { modes: ["application"] },
  },
  jurisdiction: { ...denver },
  org: { approved: true, contractorTermsSignedAt: now, classificationReviewedAt: now },
});

describe("publish gate (jurisdiction hard stop, spec p.15)", () => {
  it("lets a complete job in an approved, current jurisdiction publish", () => {
    expect(publishBlockers(ready(), now)).toEqual([]);
  });

  it("blocks unknown, unapproved, superseded, not-yet-effective and expired jurisdictions — with reasons", () => {
    const cases: Array<[Partial<JurisdictionFacts> | null, RegExp]> = [
      [null, /unknown/],
      [{ approved: false }, /hasn't been approved/],
      [{ isCurrent: false }, /superseded/],
      [{ effectiveFrom: new Date("2026-12-01") }, /isn't effective until 2026-12-01/],
      [{ approvalExpiresAt: new Date("2026-09-30") }, /expired on 2026-09-30/],
      [{ rules: {} }, /no compensation rules/],
    ];
    for (const [patch, msg] of cases) {
      const f = ready();
      f.jurisdiction = patch === null ? null : { ...denver, ...patch };
      const blockers = publishBlockers(f, now);
      expect(blockers.some((b) => msg.test(b)), `${msg}`).toBe(true);
    }
  });

  it("blocks until the org is approved, has signed terms and finished classification review", () => {
    const f = ready();
    f.org = { approved: false, contractorTermsSignedAt: null, classificationReviewedAt: null };
    expect(publishBlockers(f, now)).toEqual([
      "Your organization is awaiting Turfcut approval.",
      "Sign the contractor terms in organization settings.",
      "Complete the worker-classification review in organization settings.",
    ]);
  });

  it("requires disclosure, support contacts, rate, headcount, dates and a hiring mode", () => {
    const f = ready();
    Object.assign(f.job, { campaignDisclosure: null, supportContacts: { emergency: "x" }, payRateCents: null, headcount: 0, startsAt: null, hiringMethod: {} });
    expect(publishBlockers(f, now)).toHaveLength(6);
  });

  it("returns every blocker at once, not just the first", () => {
    const f = ready();
    f.org.contractorTermsSignedAt = null;
    f.job.compensationMethod = "PER_UNIT";
    expect(publishBlockers(f, now)).toHaveLength(2);
  });

  it("won't re-publish a published job", () => {
    const f = ready();
    f.job.status = "PUBLISHED";
    expect(publishBlockers(f, now)).toEqual(["Only draft or paused jobs can be published."]);
  });
});

describe("compensation engine (spec p.13)", () => {
  it("always allows hourly, even with no listed methods", () => {
    expect(compensationProblem("HOURLY", {})).toBeNull();
  });
  it("allows shift rate only where listed", () => {
    expect(compensationProblem("SHIFT_RATE", SEED_RULES)).toBeNull();
    expect(compensationProblem("SHIFT_RATE", { compensationAllowed: ["HOURLY"] })).toMatch(/doesn't allow per shift/);
  });
  it("requires per-unit to be listed AND explicitly approved", () => {
    expect(compensationProblem("PER_UNIT", SEED_RULES)).toMatch(/doesn't allow per accepted unit/);
    expect(compensationProblem("PER_UNIT", { compensationAllowed: ["PER_UNIT"], perUnitAllowed: false })).toMatch(/explicit per-unit approval/);
    expect(compensationProblem("PER_UNIT", { compensationAllowed: ["PER_UNIT"], perUnitAllowed: true })).toBeNull();
  });
});

describe("shift freeze on rule change (spec p.13)", () => {
  it("blocks new shifts while a jurisdiction is superseded and awaiting re-approval", () => {
    expect(canScheduleShift(denver, now).ok).toBe(true);
    expect(canScheduleShift({ ...denver, isCurrent: false }, now)).toMatchObject({ ok: false });
  });
});

describe("validateJob", () => {
  const form = {
    type: "PETITION", title: "Denver signature drive", jurisdictionId: "00000000-0000-0000-0000-000000000021",
    startsAt: "2026-10-05", endsAt: "2026-11-05", city: "Denver", state: "co",
    compensationMethod: "HOURLY", payRate: "25.50", headcount: "10", hiringModes: ["application", "invite"],
    badge: "on", training: "Petition basics", campaignType: "ballot_measure", affiliation: "nonpartisan",
    campaignName: "Initiative 305", issue_housing_affordability: "support", issue_gun_rights: "",
    message: "Put affordable housing on the ballot.", contactEmergency: "Lead 555-0100",
    contactDisputes: "ops@frc.example", contactLostMaterials: "Office", measureIds: "I-305, I-305 ,I-12", cancellationNoticeHours: "12",
  };

  it("round-trips through jobToForm, so editing a draft loses nothing", () => {
    const r = validateJob(form);
    if (!r.ok) throw new Error("form");
    const v = r.value;
    const stored = {
      type: v.type, title: v.title, description: v.description, jurisdictionId: v.jurisdictionId,
      startsAt: v.startsAt, endsAt: v.endsAt, geography: { city: v.city, state: v.state },
      compensationMethod: v.compensationMethod, payRateCents: v.payRateCents, headcount: v.headcount,
      hiringMethod: { modes: v.hiringModes }, requirements: v.requirements, campaignDisclosure: v.disclosure,
      supportContacts: v.supportContacts, measureIds: v.measureIds, cancellationNoticeHours: v.cancellationNoticeHours,
    };
    expect(validateJob(jobToForm(stored))).toEqual(r);
  });

  it("parses a complete form", () => {
    const r = validateJob(form);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      state: "CO",
      payRateCents: 2550,
      hiringModes: ["application", "invite"],
      requirements: { badge: true, registration: false, training: "Petition basics" },
      disclosure: { issues: { housing_affordability: "support" } },
      measureIds: ["I-305", "I-12"],
      cancellationNoticeHours: 12,
    });
  });

  it("rejects bad input with a message per field", () => {
    const r = validateJob({ ...form, type: "PHONEBANK", payRate: "-1", headcount: "0", endsAt: "2026-10-01", hiringModes: [], affiliation: "whig", issue_gun_rights: "maybe" });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["affiliation", "endsAt", "headcount", "hiringModes", "issues", "payRate", "type"]);
  });
});

describe("job card answers the five questions (spec p.7)", () => {
  it("names who, what, payable work, credentials and contacts", () => {
    const a = jobCardAnswers({
      type: "PETITION", compensationMethod: "HOURLY", payRateCents: 2500,
      requirements: { training: "Petition basics" }, supportContacts: contacts, orgName: "Front Range Circulators", jurisdictionRules: SEED_RULES,
    });
    expect(a.who).toBe("Front Range Circulators");
    expect(a.paidFor).toBe("$25.00 / hour (gross)");
    expect(a.payable).toMatch(/supervisor approves/);
    expect(a.credentials).toEqual(["Circulator registration", "Badge", "Signed affidavit", "Training: Petition basics"]);
    expect(a.contacts).toEqual(contacts);
  });
  it("reads the M0 seed's hiring shape", () => {
    expect(readHiringModes({ mode: "application" })).toEqual(["application"]);
  });
});

describe("worker exclusions — explicit 'do not match me' only", () => {
  const job = { disclosure, orgName: "Front Range Circulators", measureIds: ["I-305"] };
  const pref = (b: FitPreferences["campaignBoundaries"], mode: FitPreferences["visibilityMode"] = "MATCHING_ONLY"): FitPreferences => ({
    visibilityMode: mode, identityLabels: null, partyRelationship: null, issuePositions: null, campaignBoundaries: b,
  });

  it("hides a job that hits a do-not-match boundary, and says why", () => {
    for (const b of [
      { kind: "campaign_type", target: "ballot_measure" },
      { kind: "party", target: "nonpartisan" },
      { kind: "issue", target: "housing_affordability" },
      { kind: "organization", target: "front range circulators" },
      { kind: "measure", target: "i-305" },
    ] as const) {
      const r = exclusionReasons(pref([{ ...b, stance: "do_not_match" }]), job);
      expect(r).toHaveLength(1);
      expect(r[0]).toMatch(/^You asked not to be matched/);
    }
  });

  it("ignores every other stance, unanswered boundaries and PRIVATE preferences", () => {
    expect(exclusionReasons(pref([{ kind: "issue", target: "housing_affordability", stance: "ask_me_first" }]), job)).toEqual([]);
    expect(exclusionReasons(pref(null), job)).toEqual([]);
    expect(exclusionReasons(null, job)).toEqual([]);
    expect(exclusionReasons(pref([{ kind: "issue", target: "housing_affordability", stance: "do_not_match" }], "PRIVATE"), job)).toEqual([]);
  });

  it("never excludes on a job's position — only on the worker's own exclusion of the issue", () => {
    // Worker opposes housing measures but set no boundary: still shown.
    const p: FitPreferences = { ...pref(null), issuePositions: { housing_affordability: { position: "oppose" } } };
    expect(exclusionReasons(p, job)).toEqual([]);
  });
});

describe("feed filters", () => {
  it("parses known filters and ignores malformed ones", () => {
    expect(parseFeedFilters(new URLSearchParams("type=CANVASS&minRate=20.5&startsBefore=2026-11-01&noCredentials=1"))).toEqual({
      type: "CANVASS",
      minRateCents: 2050,
      startsBefore: new Date("2026-11-01T23:59:59Z"),
      noCredentials: true,
    });
    expect(parseFeedFilters(new URLSearchParams("type=DROP TABLE&minRate=-3&startsBefore=soon"))).toEqual({});
  });
});

describe("payShort", () => {
  it("is compact, without trailing cents on whole dollars", () => {
    expect(payShort("HOURLY", 2800)).toBe("$28/hr");
    expect(payShort("SHIFT_RATE", 12050)).toBe("$120.50/completed shift");
    expect(payShort("SHIFT_RATE", 120050)).toBe("$1,200.50/completed shift");
    // Says what's paid for: accepted units, not collected ones.
    expect(payShort("PER_UNIT", 150, "PETITION")).toBe("$1.50/accepted signature");
    expect(payShort("PER_UNIT", 200, "CANVASS")).toBe("$2/accepted contact");
    expect(payShort("HOURLY", null)).toBe("Rate not set");
  });
});
