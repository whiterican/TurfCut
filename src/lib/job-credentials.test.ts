import { describe, expect, it } from "vitest";
import { isBadgeName, missingCredentials, missingCredentialsMessage, type WalletRow } from "./job-credentials";

const NOW = new Date("2026-11-14T18:00:00Z");
const CO_RULES = { workerRegistrationRequired: true, badgeRequired: true, affidavitRequired: true };
const petition = { type: "PETITION" as const, requirements: { training: "Petition basics" }, jurisdictionRules: CO_RULES, state: "CO" };
const canvassBadge = { type: "CANVASS" as const, requirements: { badge: true }, jurisdictionRules: CO_RULES, state: "CO" };

let n = 0;
const cred = (c: Partial<WalletRow> & Pick<WalletRow, "kind">): WalletRow => ({
  id: `c${++n}`,
  label: null,
  state: null,
  expiresOn: null,
  supersedesId: null,
  removed: false,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  ...c,
});
const full = () => [
  cred({ kind: "CIRCULATOR_REGISTRATION", state: "CO", expiresOn: new Date("2027-06-30") }),
  cred({ kind: "NOTARY_OR_AFFIDAVIT", state: "CO" }),
  cred({ kind: "OTHER", label: "Paid circulator badge" }),
];

describe("credentials checked before hiring", () => {
  it("a worker with no credentials is missing everything the job needs, except training", () => {
    expect(missingCredentials(petition, [], NOW)).toEqual(["Circulator registration", "Badge", "Signed affidavit"]);
    // The audit's probe: a canvass job that asks for a badge, and a worker with none.
    expect(missingCredentials(canvassBadge, [], NOW)).toEqual(["Badge"]);
  });

  it("a job that asks for nothing (or only training) is open to anyone", () => {
    expect(missingCredentials({ type: "CANVASS", requirements: {}, jurisdictionRules: CO_RULES, state: "CO" }, [], NOW)).toEqual([]);
    expect(missingCredentials({ type: "CANVASS", requirements: { training: "Canvass basics" }, jurisdictionRules: CO_RULES, state: "CO" }, [], NOW)).toEqual([]);
  });

  it("a full, current wallet covers the job, self-reported included", () => {
    expect(missingCredentials(petition, full(), NOW)).toEqual([]);
    expect(missingCredentials(canvassBadge, full(), NOW)).toEqual([]);
  });

  it("an expired credential doesn't count; one that expires today still does", () => {
    const expired = [cred({ kind: "CIRCULATOR_REGISTRATION", state: "CO", expiresOn: new Date("2026-11-13") }), ...full().slice(1)];
    expect(missingCredentials(petition, expired, NOW)).toEqual(["Circulator registration"]);
    const today = [cred({ kind: "CIRCULATOR_REGISTRATION", state: "CO", expiresOn: new Date("2026-11-14") }), ...full().slice(1)];
    expect(missingCredentials(petition, today, NOW)).toEqual([]);
  });

  it("a registration from another state doesn't count; one with no state counts anywhere", () => {
    const az = [cred({ kind: "CIRCULATOR_REGISTRATION", state: "AZ" }), ...full().slice(1)];
    expect(missingCredentials(petition, az, NOW)).toEqual(["Circulator registration"]);
    const anyState = [cred({ kind: "CIRCULATOR_REGISTRATION" }), ...full().slice(1)];
    expect(missingCredentials(petition, anyState, NOW)).toEqual([]);
  });

  it("only the current wallet counts: removed and superseded rows don't", () => {
    const old = cred({ kind: "OTHER", label: "Badge" });
    const edited = cred({ kind: "OTHER", label: "Parking pass", supersedesId: old.id });
    expect(missingCredentials(canvassBadge, [old, edited], NOW)).toEqual(["Badge"]);
    expect(missingCredentials(canvassBadge, [cred({ kind: "OTHER", label: "Badge", removed: true })], NOW)).toEqual(["Badge"]);
  });

  it("a badge is an Other or training credential named for it; other kinds don't stand in", () => {
    expect(missingCredentials(canvassBadge, [cred({ kind: "OTHER", label: "Badge" })], NOW)).toEqual([]);
    expect(missingCredentials(canvassBadge, [cred({ kind: "TRAINING", label: "Circulator badge" })], NOW)).toEqual([]);
    expect(missingCredentials(canvassBadge, [cred({ kind: "OTHER", label: "Volunteer lanyard" })], NOW)).toEqual(["Badge"]);
    expect(missingCredentials(canvassBadge, [cred({ kind: "CIRCULATOR_REGISTRATION" })], NOW)).toEqual(["Badge"]);
  });
});

describe("what counts as the badge", () => {
  it("only an exact badge name, trimmed and in any case, counts", () => {
    for (const ok of ["Badge", "badge", "  BADGE  ", "Circulator badge", "Paid  circulator   badge", "paid circulator badge"]) expect(isBadgeName(ok), ok).toBe(true);
  });

  it("a name that merely mentions a badge doesn't", () => {
    for (const no of ["No badge yet", "Badge pending", "badge?", "Badges", "Badge orientation", "Lost my badge", "", null, undefined]) expect(isBadgeName(no), String(no)).toBe(false);
  });

  it("\"No badge yet\" is refused on a job that needs a badge", () => {
    expect(missingCredentials(canvassBadge, [cred({ kind: "OTHER", label: "No badge yet" })], NOW)).toEqual(["Badge"]);
    expect(missingCredentials(canvassBadge, [cred({ kind: "TRAINING", label: "Badge orientation" })], NOW)).toEqual(["Badge"]);
  });
});

describe("what the worker is told", () => {
  it("names each missing credential and where to add it", () => {
    const m = missingCredentialsMessage(["Circulator registration", "Badge"]);
    expect(m).toContain("Circulator registration, Badge");
    expect(m).toContain("Profile → Credentials");
    expect(m).toContain("named “Badge”");
  });
});
