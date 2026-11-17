import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProviderError, stripeProvider } from "./payout-provider";

const SECRET = "whsec_test_turfcut";
const KEYS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET", "TURFCUT_DEMO", "VERCEL_ENV"] as const;
let saved: Record<string, string | undefined> = {};

function signed(livemode: boolean) {
  const payload = JSON.stringify({
    id: "evt_test_1",
    object: "event",
    type: "account.updated",
    livemode,
    created: 1_700_000_000,
    data: { object: { id: "acct_1AbCdEfGhIjK", object: "account", payouts_enabled: true, capabilities: { transfers: "active" } } },
  });
  const signature = new Stripe("sk_test_signing").webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return { payload, signature };
}

describe("Stripe webhooks under the demo guard", () => {
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
    process.env.STRIPE_SECRET_KEY = "sk_test_turfcut";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("rejects a signed livemode:true event when TURFCUT_DEMO is set", () => {
    process.env.TURFCUT_DEMO = "1";
    const { payload, signature } = signed(true);
    expect(() => stripeProvider().parseWebhook(payload, signature)).toThrow(/live mode/);
  });

  it("accepts a signed test-mode event in demo mode, and a live one with the flag unset", () => {
    process.env.TURFCUT_DEMO = "1";
    const test = signed(false);
    expect(stripeProvider().parseWebhook(test.payload, test.signature)).toMatchObject({ id: "evt_test_1", account: { id: "acct_1AbCdEfGhIjK", payoutsEnabled: true } });
    delete process.env.TURFCUT_DEMO;
    const live = signed(true);
    expect(stripeProvider().parseWebhook(live.payload, live.signature).id).toBe("evt_test_1");
  });

  it("a refused live key is a definitive ProviderError carrying the guard's message, not \"Couldn't reach Stripe\"", async () => {
    process.env.TURFCUT_DEMO = "1";
    process.env.STRIPE_SECRET_KEY = "sk_live_fake";
    const err = await stripeProvider().payoutsEnabled("acct_1AbCdEfGhIjK").then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).definitive).toBe(true);
    expect((err as ProviderError).message).toMatch(/TURFCUT_DEMO is set/);
    expect(stripeProvider().configured()).toBe(false);
  });
});
