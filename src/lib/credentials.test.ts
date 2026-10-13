import { describe, expect, it } from "vitest";
import { credentialName, currentCredentials, expiryReminder, expiryState, expiryToday, maskIdentifier, orgCredentialView, validateCredential } from "./credentials";

describe("validateCredential", () => {
  it("accepts a circulator registration and normalizes it", () => {
    expect(validateCredential({ kind: "CIRCULATOR_REGISTRATION", state: " co ", identifier: "  CO-12345 ", issuedOn: "2026-01-02", expiresOn: "2027-01-01" })).toEqual({
      ok: true,
      // Only the last four characters are kept.
      value: { kind: "CIRCULATOR_REGISTRATION", label: null, state: "CO", identifier: "2345", issuedOn: "2026-01-02", expiresOn: "2027-01-01" },
    });
  });
  it("never keeps a full number, even one typed by mistake", () => {
    const v = validateCredential({ kind: "OTHER", label: "x", identifier: "123 45 6789" });
    expect(v.ok && v.value.identifier).toBe("6789");
  });
  it("bounds years and says why text is refused", () => {
    expect(validateCredential({ kind: "OTHER", label: "x", expiresOn: "0000-01-01" }).ok).toBe(false);
    expect(validateCredential({ kind: "OTHER", label: "x", expiresOn: "2101-01-01" }).ok).toBe(false);
    const hidden = validateCredential({ kind: "OTHER", label: "a\u200bb" });
    expect(!hidden.ok && hidden.errors.label).toMatch(/character/);
  });
  it("needs a state for a registration and a name for training or other", () => {
    const reg = validateCredential({ kind: "CIRCULATOR_REGISTRATION" });
    expect(!reg.ok && Object.keys(reg.errors)).toEqual(["state"]);
    const tr = validateCredential({ kind: "TRAINING", label: "  " });
    expect(!tr.ok && Object.keys(tr.errors)).toEqual(["label"]);
    expect(validateCredential({ kind: "TRAINING", label: "Petition basics" }).ok).toBe(true);
  });
  it("refuses unknown kinds, bad states and dates, expiry before issue, overlong or hidden text", () => {
    for (const bad of [
      { kind: "BADGE" },
      { kind: "OTHER", label: "x", state: "Colorado" },
      { kind: "OTHER", label: "x", issuedOn: "2026-02-30" },
      { kind: "OTHER", label: "x", issuedOn: "2026-05-01", expiresOn: "2026-04-01" },
      { kind: "OTHER", label: "x".repeat(81) },
      { kind: "OTHER", label: "ok", identifier: "1".repeat(65) },
      { kind: "OTHER", label: "a\u202eb" },
      { kind: "OTHER", label: 7 },
    ]) expect({ bad, ok: validateCredential(bad).ok }).toEqual({ bad, ok: false });
  });
});

describe("display", () => {
  it("masks identifiers to the last four, never more than half", () => {
    expect(maskIdentifier("2345")).toBe("•••• 2345");
    expect(maskIdentifier("123")).toBe("•••• 123");
    expect(maskIdentifier(null)).toBeNull();
  });
  it("names credentials plainly", () => {
    expect(credentialName({ kind: "CIRCULATOR_REGISTRATION", label: null, state: "CO" })).toBe("CO circulator registration");
    expect(credentialName({ kind: "TRAINING", label: "Petition basics", state: null })).toBe("Petition basics");
    expect(credentialName({ kind: "TRAINING", label: "NVRA basics", state: "CO" })).toBe("CO: NVRA basics");
  });
});

describe("the current wallet", () => {
  const t = (s: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, s));
  it("drops superseded rows and removals, newest first", () => {
    const rows = [
      { id: "a", supersedesId: null, removed: false, createdAt: t(1) },
      { id: "a2", supersedesId: "a", removed: false, createdAt: t(2) },
      { id: "b", supersedesId: null, removed: false, createdAt: t(3) },
      { id: "b-rm", supersedesId: "b", removed: true, createdAt: t(4) },
      { id: "c", supersedesId: null, removed: false, createdAt: t(5) },
    ];
    const cur = currentCredentials(rows);
    expect(cur.map((r) => r.id)).toEqual(["c", "a2"]);
    // An edit keeps its credential's place and identity (the chain's first row).
    expect(cur.map((r) => r.rootId)).toEqual(["c", "a"]);
  });
});

describe("expiry", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  it("counts whole days and reminds at 30 and 7", () => {
    expect(expiryState(null, "2026-10-06")).toEqual({ kind: "none" });
    expect(expiryState(d("2026-10-05"), "2026-10-06")).toEqual({ kind: "expired", days: 1 });
    expect(expiryState(d("2026-10-06"), "2026-10-06")).toEqual({ kind: "soon", days: 0 });
    expect(expiryState(d("2026-12-31"), "2026-10-06")).toEqual({ kind: "ok" });
    expect(expiryReminder(d("2026-11-05"), "2026-10-06")).toBe("30");
    expect(expiryReminder(d("2026-11-06"), "2026-10-06")).toBeNull();
    expect(expiryReminder(d("2026-10-13"), "2026-10-06")).toBe("7");
    expect(expiryReminder(d("2026-10-01"), "2026-10-06")).toBe("expired");
    // An expired credential never quietly drops off.
    expect(expiryReminder(d("2026-01-01"), "2026-10-06")).toBe("expired");
  });
});

describe("expiryToday", () => {
  it("is the date in the furthest-west US time, so the expiry day still counts in US evenings", () => {
    expect(expiryToday(new Date("2026-10-13T01:00:00Z"))).toBe("2026-10-12"); // 7pm Oct 12 in Denver
    expect(expiryToday(new Date("2026-10-13T12:00:00Z"))).toBe("2026-10-13");
  });
});

describe("orgCredentialView", () => {
  const row = {
    id: "c1", kind: "NOTARY_OR_AFFIDAVIT" as const, label: null, state: "CO", identifier: "2345", issuedOn: new Date("2026-01-02T00:00:00Z"),
    expiresOn: new Date("2027-01-02T00:00:00Z"), verification: "SELF_REPORTED" as const, supersedesId: null, removed: false, createdAt: new Date(),
  };
  it("gives name, level and expiry, never the number or the issue date", () => {
    expect(orgCredentialView([row], true)).toEqual([{ kind: "NOTARY_OR_AFFIDAVIT", label: null, state: "CO", verification: "SELF_REPORTED", verificationMethod: null, expiresOn: row.expiresOn }]);
  });
  it("is withheld when not shared", () => {
    expect(orgCredentialView([row], false)).toBe("withheld");
  });
});
