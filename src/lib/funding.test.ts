import { describe, expect, it } from "vitest";
import { FUNDING_ENTRY_MAX_CENTS, FUNDING_REFERENCE_MAX, fundingEntryProblem, fundingPosition, fundingShortfall } from "./pay";

describe("G1 funding ledger rules", () => {
  it("available is credited less committed", () => {
    expect(fundingPosition(50_000, 20_000)).toEqual({ creditedCents: 50_000, committedCents: 20_000, availableCents: 30_000 });
  });

  it("a pay run within the balance is covered, to the cent", () => {
    const p = fundingPosition(50_000, 20_000);
    expect(fundingShortfall(p, 30_000)).toBeNull();
    expect(fundingShortfall(p, 1)).toBeNull();
  });

  it("a pay run over the balance names the balance and the shortfall", () => {
    expect(fundingShortfall(fundingPosition(50_000, 20_000), 30_001)).toMatch(/\$300\.00, \$0\.01 short/);
  });

  it("an overdrawn position reads as zero available, short the whole amount", () => {
    expect(fundingShortfall(fundingPosition(0, 5_000), 1_000)).toMatch(/\$0\.00, \$10\.00 short/);
  });

  it("checks a funding entry", () => {
    const p = fundingPosition(10_000, 4_000);
    expect(fundingEntryProblem(5_000, "INV-1", p)).toBeNull();
    expect(fundingEntryProblem(0, "INV-1", p)).toMatch(/non-zero/);
    expect(fundingEntryProblem(1.5, "INV-1", p)).toMatch(/non-zero/);
    expect(fundingEntryProblem(5_000, "  ", p)).toMatch(/reference|invoice/i);
    expect(fundingEntryProblem(5_000, "x".repeat(FUNDING_REFERENCE_MAX + 1), p)).toMatch(/characters/);
    expect(fundingEntryProblem(FUNDING_ENTRY_MAX_CENTS + 1, "INV-1", p)).toMatch(/at most/);
    expect(fundingEntryProblem(-6_000, "fix", p)).toBeNull();
    expect(fundingEntryProblem(-6_001, "fix", p)).toMatch(/below/);
  });
});
