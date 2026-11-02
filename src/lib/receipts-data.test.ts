import { describe, expect, it } from "vitest";
import { partialReversals } from "@/lib/receipts-data";

const T = "00000000-0000-0000-0000-00000000e165";
const at = (h: number) => new Date(Date.UTC(2026, 10, 1, h));
const audit = (cents: unknown, h: number, entityId = T) => ({ entityId, metadata: { reversedCents: cents, amountCents: 8750 }, createdAt: at(h) });

describe("partialReversals (a receipt's part that came back)", () => {
  const amounts = new Map([[T, 8750]]);

  it("takes Stripe's largest report, since Stripe reports the total reversed so far, even if reports arrive out of order", () => {
    const got = partialReversals([audit(2500, 3), audit(1000, 1), audit(1500, 2)], amounts).get(T);
    expect(got).toEqual({ reversedCents: 2500, sentCents: 8750, at: at(3) });
  });

  it("ignores a report of nothing, of the whole amount or more (a full reversal is the line events' job), and junk", () => {
    expect(partialReversals([audit(0, 1), audit(8750, 2), audit(9000, 3), audit("100", 4), audit(12.5, 5)], amounts).size).toBe(0);
  });

  it("judges partial against the amount Stripe says it sent, as the webhook did, when that differs from Turfcut's record", () => {
    // Stripe sent $90.00 where Turfcut recorded $87.50: $88.00 back is still partial; $90.00 back isn't.
    const mism = (cents: number, h: number) => ({ entityId: T, metadata: { reversedCents: cents, amountCents: 9000 }, createdAt: at(h) });
    expect(partialReversals([mism(8800, 1)], amounts).get(T)).toEqual({ reversedCents: 8800, sentCents: 9000, at: at(1) });
    expect(partialReversals([mism(9000, 1)], amounts).size).toBe(0);
  });

  it("falls back to Turfcut's amount when the report doesn't carry one", () => {
    expect(partialReversals([{ entityId: T, metadata: { reversedCents: 500 }, createdAt: at(1) }], amounts).get(T)?.sentCents).toBe(8750);
  });

  it("ignores a report for a transfer it wasn't asked about", () => {
    expect(partialReversals([audit(500, 1, "00000000-0000-0000-0000-000000000000")], amounts).size).toBe(0);
  });
});
