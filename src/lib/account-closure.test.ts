import { describe, expect, it } from "vitest";
import { CLOSE_PHRASE, closureProblems, confirmed } from "./account-closure";

describe("closing an account (M7)", () => {
  const clear = { unpaidLines: 0, openDisputes: 0, liveShifts: 0, pendingReviews: 0, transfersInFlight: 0 };

  it("closes only when nothing is owed, open or in flight", () => {
    expect(closureProblems(clear)).toEqual([]);
    expect(closureProblems({ ...clear, unsyncedEntries: 0 })).toEqual([]);
  });

  it("names every blocker in plain words", () => {
    const all = closureProblems({ unpaidLines: 2, openDisputes: 1, liveShifts: 1, pendingReviews: 2, transfersInFlight: 1, unsyncedEntries: 3 });
    expect(all).toHaveLength(6);
    expect(all[0]).toMatch(/going through Stripe/);
    expect(all[1]).toMatch(/pay on the way \(2 lines\)/);
    expect(all[2]).toMatch(/an open pay dispute/);
    expect(all[3]).toMatch(/checked in on a shift/);
    expect(all[4]).toMatch(/2 shifts you worked are waiting/);
    expect(all[5]).toMatch(/3 field entries haven't synced/);
    expect(closureProblems({ ...clear, pendingReviews: 1 })[0]).toMatch(/A shift you worked is waiting/);
    expect(closureProblems({ ...clear, unpaidLines: 1 })[0]).toMatch(/\(1 line\)/);
    expect(closureProblems({ ...clear, unsyncedEntries: 1 })[0]).toMatch(/1 field entry hasn't/);
  });

  it("needs the exact phrase, forgiving case and spaces only", () => {
    expect(confirmed(CLOSE_PHRASE)).toBe(true);
    expect(confirmed("  Close My Account ")).toBe(true);
    expect(confirmed("close my acount")).toBe(false);
    expect(confirmed("")).toBe(false);
    expect(confirmed(null)).toBe(false);
    expect(confirmed({ toString: () => CLOSE_PHRASE })).toBe(false);
  });
});
