import { describe, expect, it } from "vitest";
import { partialReversals } from "@/lib/receipts-data";

const T = "00000000-0000-0000-0000-00000000e165";
const at = (h: number) => new Date(Date.UTC(2026, 10, 1, h));
const audit = (cents: unknown, h: number, entityId = T) => ({ entityId, metadata: { reversedCents: cents, amountCents: 8750 }, createdAt: at(h) });

describe("partialReversals (a receipt's part that came back)", () => {
  const amounts = new Map([[T, 8750]]);

  it("takes Stripe's largest report, since Stripe reports the total reversed so far, even if reports arrive out of order", () => {
    const got = partialReversals([audit(2500, 3), audit(1000, 1), audit(1500, 2)], amounts).get(T);
    expect(got).toEqual({ reversedCents: 2500, at: at(3) });
  });

  it("ignores a report of nothing, of the whole amount or more (a full reversal is the line events' job), and junk", () => {
    expect(partialReversals([audit(0, 1), audit(8750, 2), audit(9000, 3), audit("100", 4), audit(12.5, 5)], amounts).size).toBe(0);
  });

  it("ignores a report for a transfer it wasn't asked about", () => {
    expect(partialReversals([audit(500, 1, "00000000-0000-0000-0000-000000000000")], amounts).size).toBe(0);
  });
});
