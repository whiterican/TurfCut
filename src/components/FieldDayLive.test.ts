import { describe, expect, it } from "vitest";
import { waitingLines } from "./FieldDayLive";

const log = (id: string, unit: "signatures" | "doors" | "contacts", count: number, at: number) => ({ clientId: id, at, action: { kind: "log" as const, unit, count } });

describe("entries waiting to be sent", () => {
  it("shows a run of taps as one line, from the first tap's time", () => {
    const lines = waitingLines([log("a", "signatures", 1, 100), log("b", "signatures", 1, 200), log("c", "signatures", 5, 300)]);
    expect(lines).toEqual([{ key: "a", what: "+7 signatures", at: 100 }]);
  });
  it("says one signature in the singular", () => {
    expect(waitingLines([log("a", "signatures", 1, 100)])[0].what).toBe("+1 signature");
    expect(waitingLines([log("a", "doors", 1, 100)])[0].what).toBe("+1 door");
  });
  it("keeps other entries, and other units, on lines of their own, in order", () => {
    const lines = waitingLines([
      log("a", "signatures", 1, 100),
      { clientId: "b", at: 150, action: { kind: "pause" as const } },
      log("c", "signatures", 1, 200),
      log("d", "signatures", 1, 210),
      log("e", "doors", 2, 220),
    ]);
    expect(lines.map((l) => l.what)).toEqual(["+1 signature", "Break started", "+2 signatures", "+2 doors"]);
    expect(lines.map((l) => l.key)).toEqual(["a", "b", "c", "e"]);
  });
  it("shows a take-back on a line of its own, between the +1s around it", () => {
    const lines = waitingLines([log("a", "signatures", 1, 100), { clientId: "b", at: 150, action: { kind: "undo_signature" as const } }, log("c", "signatures", 1, 200)]);
    expect(lines.map((l) => l.what)).toEqual(["+1 signature", "1 signature taken back", "+1 signature"]);
  });
});
