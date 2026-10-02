import { describe, expect, it } from "vitest";
import { readPendingSignup, SIGNUP_METADATA_KEY } from "./account";

describe("pending sign-up metadata", () => {
  it("re-validates what the auth user carries", () => {
    expect(readPendingSignup({ [SIGNUP_METADATA_KEY]: { accountType: "worker", name: "  Alex  Rivera ", phone: "303 555 0100" } })).toEqual({
      accountType: "worker",
      name: "Alex Rivera",
      phone: "+13035550100",
    });
    // Organizations never carry a phone; unknown roles and blank names are refused.
    expect(readPendingSignup({ [SIGNUP_METADATA_KEY]: { accountType: "company", name: "FRC", phone: "3035550100" } })).toEqual({ accountType: "company", name: "FRC", phone: null });
    expect(readPendingSignup({ [SIGNUP_METADATA_KEY]: { accountType: "OWNER", name: "x" } })).toBeNull();
    expect(readPendingSignup({ [SIGNUP_METADATA_KEY]: { accountType: "worker", name: " " } })).toBeNull();
    expect(readPendingSignup(null)).toBeNull();
  });
});
