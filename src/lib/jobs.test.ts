import { describe, expect, it } from "vitest";
import {
  fitReasons,
  payParts,
  payShort,
  jobToForm,
  parseFeedFilters,
  canScheduleShift,
  compensationProblem,
  exclusionReasons,
  jobCardAnswers,
  jobCredentials,
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
    geography: { city: "Denver", state: "CO" },
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

  it("blocks a job whose state isn't the rule profile's state", () => {
    const f = ready();
    f.job.geography = { city: "Austin", state: "TX" };
    expect(publishBlockers(f, now)).toEqual(["The job is in TX but the rule profile is for CO. Pick a TX profile."]);
  });

  it("keeps a job open through its whole end date, US time", () => {
    // End date Oct 2 is stored as 2026-10-02T00:00Z (6 pm Oct 1 in Denver).
    const f = ready();
    f.job.endsAt = new Date("2026-10-02T00:00:00Z");
    f.job.startsAt = new Date("2026-10-01T00:00:00Z");
    expect(publishBlockers(f, new Date("2026-10-02T20:00:00Z"))).toEqual([]); // 2 pm Oct 2 in Denver
    expect(publishBlockers(f, new Date("2026-10-03T09:59:00Z"))).toEqual([]); // still Oct 2 in Hawaii
    expect(publishBlockers(f, new Date("2026-10-03T10:00:00Z"))).toEqual(["The job's end date has passed."]);
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

  it("reads a JSON client's numbers and lists the way it reads the form's text", () => {
    const r = validateJob({ ...form, payRate: 25.5, headcount: 10, measureIds: ["I-305", " I-12 ", "I-305"], cancellationNoticeHours: 12 });
    expect(r.ok && r.value).toMatchObject({ payRateCents: 2550, headcount: 10, measureIds: ["I-305", "I-12"], cancellationNoticeHours: 12 });
    const none = validateJob({ ...form, measureIds: [] });
    expect(none.ok && none.value.measureIds).toEqual([]);
  });
  it("refuses a value it can't read instead of storing a default", () => {
    // Before: a list with a non-text entry became no measure IDs at all, and an object became 24 hours' notice.
    const r = validateJob({ ...form, measureIds: ["I-305", 12], cancellationNoticeHours: { hours: 2 } });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["cancellationNoticeHours", "measureIds"]);
    const t = validateJob({ ...form, measureIds: true, headcount: Number.NaN });
    expect(!t.ok && Object.keys(t.errors).sort()).toEqual(["headcount", "measureIds"]);
  });
  it("takes requirement flags from a JSON client as well as a form", () => {
    const r = validateJob({ ...form, badge: true, registration: false, affidavit: "true" });
    expect(r.ok && r.value.requirements).toMatchObject({ badge: true, registration: false, affidavit: true });
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
  it("applies the jurisdiction's circulator rules to petition jobs only", () => {
    const canvass = { type: "CANVASS" as const, compensationMethod: "HOURLY" as const, payRateCents: 2500, supportContacts: contacts, orgName: "Front Range Circulators", jurisdictionRules: SEED_RULES };
    expect(jobCardAnswers({ ...canvass, requirements: {} }).credentials).toEqual(["None beyond the job's onboarding"]);
    // What the organization itself asks for still counts on a canvass job.
    expect(jobCardAnswers({ ...canvass, requirements: { badge: true, training: "Canvass basics" } }).credentials).toEqual(["Badge", "Training: Canvass basics"]);
    expect(jobCardAnswers({ ...canvass, requirements: { registration: true, affidavit: true } }).credentials).toEqual(["Circulator registration", "Signed affidavit"]);
  });
  it("lists the jurisdiction's rules only when they are really set", () => {
    expect(jobCredentials({ type: "PETITION", requirements: {}, jurisdictionRules: SEED_RULES })).toEqual(["Circulator registration", "Badge", "Signed affidavit"]);
    expect(jobCredentials({ type: "PETITION", requirements: { affidavit: true }, jurisdictionRules: {} })).toEqual(["Signed affidavit"]);
    expect(jobCredentials({ type: "PETITION", requirements: {}, jurisdictionRules: { badgeRequired: "true" } })).toEqual([]);
    expect(jobCredentials({ type: "PETITION", requirements: null, jurisdictionRules: null })).toEqual([]);
  });
  it("gives the No-credentials filter exactly the card's answer", () => {
    // Every combination: the filter's "nothing needed" must match the card's "None beyond…" line.
    const flags = [{}, { badge: true }, { registration: true }, { affidavit: true }, { training: "Basics" }, { badge: true, training: "Basics" }, { script: "Hi" }];
    const rules = [{}, SEED_RULES, { badgeRequired: true }, { affidavitRequired: true }, { workerRegistrationRequired: true }];
    for (const type of ["PETITION", "CANVASS"] as const)
      for (const requirements of flags)
        for (const jurisdictionRules of rules) {
          const card = jobCardAnswers({ type, compensationMethod: "HOURLY", payRateCents: 2500, requirements, supportContacts: contacts, orgName: "X", jurisdictionRules });
          const none = card.credentials.length === 1 && card.credentials[0].startsWith("None");
          expect(jobCredentials({ type, requirements, jurisdictionRules }).length === 0).toBe(none);
        }
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
    // "This week" quick filter: the next 7 days from now.
    const now = new Date("2026-10-01T12:00:00Z");
    expect(parseFeedFilters(new URLSearchParams("week=1"), now)).toEqual({ startsBefore: new Date("2026-10-08T12:00:00Z") });
    expect(parseFeedFilters(new URLSearchParams("week=1&startsBefore=2026-12-01"), now).startsBefore).toEqual(new Date("2026-12-01T23:59:59Z"));
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

describe("fitReasons", () => {
  const base = { type: "PETITION" as const, state: "CO", verifiedShiftsOfType: 0, statesWorked: [], credentials: ["None beyond the job's onboarding"], noExtraCredentials: true, spotsLeft: 3, hasBoundaries: false };
  it("explains fit from the worker's own record — checks and plain info, never a score", () => {
    const r = fitReasons({ ...base, verifiedShiftsOfType: 34, statesWorked: ["CO"] });
    expect(r.map((x) => [x.kind, x.title])).toEqual([
      ["yes", "Petition experience"],
      ["yes", "Worked in CO before"],
      ["yes", "No extra credentials"],
      ["yes", "3 spots open"],
    ]);
    expect(r[0].detail).toBe("34 verified shifts on your scorecard");
    expect(JSON.stringify(r)).not.toMatch(/%|score:/);
  });
  it("frames gaps as information, not marks against the worker", () => {
    const r = fitReasons({ ...base, credentials: ["Badge", "Signed affidavit"], noExtraCredentials: false, spotsLeft: 0, hasBoundaries: true });
    expect(r.filter((x) => x.kind === "info").map((x) => x.title)).toEqual(["New to petition work", "First job in CO", "Credentials needed", "Every spot is filled"]);
    expect(r.at(-1)).toMatchObject({ kind: "yes", title: "Within your boundaries" });
  });
  it("splits pay for big displays", () => {
    expect(payParts("HOURLY", 2800)).toEqual({ amount: "$28", unit: "hour", short: "hr" });
    expect(payParts("PER_UNIT", 150, "CANVASS")?.unit).toBe("accepted contact");
  });
});
