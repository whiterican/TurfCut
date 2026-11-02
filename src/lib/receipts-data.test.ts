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

describe("transferExportState (transfers.csv agrees with the receipt, #117)", () => {
  const sentAt = at(1);
  const base = { amountCents: 8750, paidAt: null as Date | null, failedAt: null as Date | null, reversedAt: null as Date | null, partReversal: null as { reversedCents: number; sentCents: number; at: Date } | null, stripeSentCents: null as number | null };

  it("sending and failed carry no money figures: nothing settled", async () => {
    const { transferExportState } = await import("@/lib/receipts-data");
    expect(transferExportState({ ...base, status: "sending" })).toEqual({ status: "sending", sentAt: "", failedAt: "", reversedAt: "", reversedCents: "", keptCents: "", stripeSentCents: "" });
    expect(transferExportState({ ...base, status: "failed", failedAt: at(2) })).toEqual({ status: "failed", sentAt: "", failedAt: at(2), reversedAt: "", reversedCents: "", keptCents: "", stripeSentCents: "" });
  });

  it("sent keeps the whole amount; a failure later overtaken by Stripe's confirmation isn't reported as failed", async () => {
    const { transferExportState } = await import("@/lib/receipts-data");
    expect(transferExportState({ ...base, status: "sent", paidAt: sentAt, failedAt: at(0) })).toEqual({ status: "sent", sentAt, failedAt: "", reversedAt: "", reversedCents: 0, keptCents: 8750, stripeSentCents: "" });
  });

  it("partly reversed: what came back and what was kept, out of Stripe's figure", async () => {
    const { transferExportState } = await import("@/lib/receipts-data");
    expect(transferExportState({ ...base, status: "partly-reversed", paidAt: sentAt, partReversal: { reversedCents: 2500, sentCents: 8750, at: at(3) } })).toEqual({ status: "partly-reversed", sentAt, failedAt: "", reversedAt: at(3), reversedCents: 2500, keptCents: 6250, stripeSentCents: "" });
  });

  it("partly reversed where Stripe's amount differs from the record: the row names Stripe's figure, so it adds up as the receipt does", async () => {
    const { transferExportState } = await import("@/lib/receipts-data");
    const row = transferExportState({ ...base, status: "partly-reversed", paidAt: sentAt, partReversal: { reversedCents: 2500, sentCents: 8500, at: at(3) }, stripeSentCents: 8500 });
    expect(row).toMatchObject({ stripeSentCents: 8500, reversedCents: 2500, keptCents: 6000 });
  });

  it("a partial reversal Stripe reported before confirming the payment still carries Stripe's figures, with no sent time", async () => {
    const { transferExportState } = await import("@/lib/receipts-data");
    expect(transferExportState({ ...base, status: "partly-reversed", partReversal: { reversedCents: 500, sentCents: 8750, at: at(3) } })).toMatchObject({ sentAt: "", reversedCents: 500, keptCents: 8250 });
  });

  it("sent, where Stripe confirmed a different amount: kept is Stripe's figure, named; the record stays amountCents", async () => {
    const { transferExportState } = await import("@/lib/receipts-data");
    expect(transferExportState({ ...base, status: "sent", paidAt: sentAt, stripeSentCents: 8500 })).toMatchObject({ keptCents: 8500, reversedCents: 0, stripeSentCents: 8500 });
  });

  it("reversed in full, where Stripe confirmed a different amount: what came back is Stripe's figure, never the record", async () => {
    const { transferExportState } = await import("@/lib/receipts-data");
    expect(transferExportState({ ...base, status: "reversed", paidAt: sentAt, reversedAt: at(4), stripeSentCents: 8500 })).toMatchObject({ reversedCents: 8500, keptCents: 0, stripeSentCents: 8500 });
  });

  it("reversed in full: all of it came back, nothing kept", async () => {
    const { transferExportState } = await import("@/lib/receipts-data");
    expect(transferExportState({ ...base, status: "reversed", paidAt: sentAt, reversedAt: at(4) })).toEqual({ status: "reversed", sentAt, failedAt: "", reversedAt: at(4), reversedCents: 8750, keptCents: 0, stripeSentCents: "" });
  });
});

describe("stripeAmounts (what Stripe confirmed it sent, where it differs from the record)", () => {
  const amounts = new Map([[T, 8750]]);
  const mismatch = (stripe: unknown, h: number) => ({ action: "payout.amount_mismatch", entityId: T, metadata: { expected: 8750, stripe }, createdAt: at(h) });
  const partial = (amountCents: unknown, h: number) => ({ action: "payout.partially_reversed", entityId: T, metadata: { reversedCents: 500, amountCents }, createdAt: at(h) });

  it("takes the transfer.created mismatch report, the latest if several", async () => {
    const { stripeAmounts } = await import("@/lib/receipts-data");
    expect(stripeAmounts([mismatch(8400, 1), mismatch(8500, 2)], amounts).get(T)).toBe(8500);
  });

  it("falls back to a partial-reversal report's amount, so a partial then full reversal keeps Stripe's figure", async () => {
    const { stripeAmounts } = await import("@/lib/receipts-data");
    expect(stripeAmounts([partial(8500, 1)], amounts).get(T)).toBe(8500);
    expect(stripeAmounts([partial(8600, 3), mismatch(8500, 1)], amounts).get(T)).toBe(8500); // the explicit report wins
  });

  it("gives nothing when Stripe agrees with the record, or the report carries no usable amount", async () => {
    const { stripeAmounts } = await import("@/lib/receipts-data");
    expect(stripeAmounts([mismatch(8750, 1), partial(8750, 2), mismatch("8500", 3), partial(null, 4)], amounts).size).toBe(0);
  });
});

describe("one Stripe figure per transfer: sent, came back and kept add up (#118 review)", () => {
  it("a partial report's own amount yields to the transfer's ranked Stripe figure", async () => {
    const { partialReversals, stripeAmounts, transferExportState } = await import("@/lib/receipts-data");
    const amounts = new Map([[T, 8750]]);
    const audits = [
      { action: "payout.amount_mismatch", entityId: T, metadata: { expected: 8750, stripe: 8500 }, createdAt: at(1) },
      { action: "payout.partially_reversed", entityId: T, metadata: { reversedCents: 500, amountCents: 8600 }, createdAt: at(2) },
    ];
    const stripe = stripeAmounts(audits, amounts);
    const part = partialReversals(audits.filter((a) => a.action === "payout.partially_reversed"), amounts, stripe).get(T)!;
    expect(part).toMatchObject({ sentCents: 8500, reversedCents: 500 });
    const row = transferExportState({ status: "partly-reversed", amountCents: 8750, paidAt: at(1), failedAt: null, reversedAt: null, partReversal: part, stripeSentCents: stripe.get(T) ?? null });
    // The receipt's headline (Stripe's figure) − what came back = what was kept, and the file names the same figure.
    expect(row).toMatchObject({ stripeSentCents: 8500, reversedCents: 500, keptCents: 8000 });
  });
});
