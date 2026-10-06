import { describe, expect, it } from "vitest";
import { credentialName, currentCredentials, expiryReminder, expiryState, maskIdentifier, validateCredential } from "./credentials";

describe("validateCredential", () => {
  it("accepts a circulator registration and normalizes it", () => {
    expect(validateCredential({ kind: "CIRCULATOR_REGISTRATION", state: " co ", identifier: "  CO-12345 ", issuedOn: "2026-01-02", expiresOn: "2027-01-01" })).toEqual({
      ok: true,
      value: { kind: "CIRCULATOR_REGISTRATION", label: null, state: "CO", identifier: "CO-12345", issuedOn: "2026-01-02", expiresOn: "2027-01-01" },
    });
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
    expect(maskIdentifier("CO-12345")).toBe("•••• 2345");
    expect(maskIdentifier("123")).toBe("•••• 3");
    expect(maskIdentifier("1")).toBe("••••");
    expect(maskIdentifier(null)).toBeNull();
  });
  it("names credentials plainly", () => {
    expect(credentialName({ kind: "CIRCULATOR_REGISTRATION", label: null, state: "CO" })).toBe("CO circulator registration");
    expect(credentialName({ kind: "TRAINING", label: "Petition basics", state: null })).toBe("Petition basics");
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
    expect(currentCredentials(rows).map((r) => r.id)).toEqual(["c", "a2"]);
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
    expect(expiryReminder(d("2026-08-01"), "2026-10-06")).toBeNull();
  });
});
