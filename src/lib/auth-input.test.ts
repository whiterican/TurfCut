import { describe, expect, it } from "vitest";
import { normalizePhone, safeNext, validateSetup, validateSignup } from "./auth-input";

describe("auth input", () => {
  it("normalises US mobile numbers", () => {
    expect(normalizePhone("(303) 555-0100")).toBe("+13035550100");
    expect(normalizePhone("1 303 555 0100")).toBe("+13035550100");
    expect(normalizePhone("555-0100")).toBeNull();
  });

  it("only redirects to same-site paths after login", () => {
    expect(safeNext("/shifts/abc")).toBe("/shifts/abc");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext(undefined)).toBe("/dashboard");
  });

  it("validates signup; phone is optional and worker-only", () => {
    const ok = validateSignup({ accountType: "worker", name: " Alex  Rivera ", email: "Alex@Example.com", password: "longenough", phone: "303-555-0100" });
    expect(ok).toEqual({ ok: true, value: { accountType: "worker", name: "Alex Rivera", email: "alex@example.com", password: "longenough", phone: "+13035550100" } });
    expect(validateSignup({ accountType: "worker", name: "A", email: "a@b.co", password: "longenough" })).toMatchObject({ ok: true, value: { phone: null } });
    expect(validateSignup({ accountType: "company", name: "Co", email: "a@b.co", password: "longenough", phone: "nope" })).toMatchObject({ ok: true, value: { phone: null } });
    expect(validateSignup({ accountType: "worker", name: "", email: "bad", password: "short", phone: "123" })).toEqual({
      ok: false,
      errors: { name: "Enter your name.", email: "Enter a valid email address.", password: "Use at least 8 characters.", phone: "Enter a 10-digit US mobile number, or leave it blank." },
    });
  });
});

describe("finishing setup (C1)", () => {
  it("asks only for account type, name and phone", () => {
    expect(validateSetup({ accountType: "worker", name: "  Sam   Lee ", phone: "303 555 0100" })).toEqual({ ok: true, value: { accountType: "worker", name: "Sam Lee", phone: "+13035550100" } });
    expect(validateSetup({ accountType: "company", name: "Acme", phone: "x" })).toEqual({ ok: true, value: { accountType: "company", name: "Acme", phone: null } });
    expect(validateSetup({ accountType: "worker", name: "" }).ok).toBe(false);
  });
});

