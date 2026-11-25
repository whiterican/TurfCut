import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_SHIFTS_PER_ASSIGNMENT, OVERDUE_NOTICE, SAVE_PATIENCE_MS, assignMessage, assignProblem, orOverdue, overdueOutcome, readAssignment, sameTurf, saveOutcome } from "./turf-assign";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const square = { type: "Polygon", coordinates: [[[-104.9, 39.7], [-104.9, 39.71], [-104.89, 39.71], [-104.9, 39.7]]] };

describe("turf assignment", () => {
  it("reads shifts and a drawn zone", () => {
    const r = readAssignment([id(1), id(2), id(1)], square);
    expect(r).toMatchObject({ ok: true, shiftIds: [id(1), id(2)] });
    expect(r.ok && r.turf?.coordinates[0]).toHaveLength(4);
  });
  it("clears the turf with null, never with a missing zone", () => {
    expect(readAssignment([id(1)], null)).toMatchObject({ ok: true, turf: null });
    expect(readAssignment([id(1)], undefined).ok).toBe(false);
  });
  it("refuses no shifts, bad ids, too many, and a zone that is not a closed polygon", () => {
    expect(readAssignment([], square).ok).toBe(false);
    expect(readAssignment(["nope"], square).ok).toBe(false);
    expect(readAssignment("x", square).ok).toBe(false);
    expect(readAssignment(Array.from({ length: MAX_SHIFTS_PER_ASSIGNMENT + 1 }, (_, i) => id(i + 1)), square).ok).toBe(false);
    expect(readAssignment([id(1)], { type: "Polygon", coordinates: [[[0, 0], [1, 1]]] }).ok).toBe(false);
    expect(readAssignment([id(1)], { type: "Point", coordinates: [0, 0] }).ok).toBe(false);
  });
  it("leaves a finished, cancelled or long-over shift's turf alone", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    const shift = { status: "SCHEDULED", checkInAt: null as Date | null, checkOutAt: null as Date | null, endsAt: new Date("2026-11-17T18:00:00Z") };
    expect(assignProblem(shift, now)).toBeNull();
    expect(assignProblem({ ...shift, status: "ACTIVE", checkInAt: new Date("2026-11-17T09:00:00Z"), endsAt: new Date("2026-11-17T11:00:00Z") }, now)).toBeNull(); // still being worked past its end
    expect(assignProblem({ ...shift, status: "CANCELLED" }, now)).toMatch(/cancelled/);
    expect(assignProblem({ ...shift, checkOutAt: new Date() }, now)).toMatch(/finished/);
    expect(assignProblem({ ...shift, status: "COMPLETED" }, now)).toMatch(/finished/);
    expect(assignProblem({ ...shift, endsAt: new Date("2026-11-16T18:00:00Z") }, now)).toMatch(/ended/);
  });
  it("needs a closed ring of four or more points: a ring that does not close is refused", () => {
    expect(readAssignment([id(1)], { type: "Polygon", coordinates: [[[-104.9, 39.7], [-104.9, 39.71], [-104.89, 39.71], [-104.88, 39.7]]] }).ok).toBe(false);
  });
  it("folds ids to lower case", () => {
    const up = id(1).replace(/0/g, "A").toUpperCase();
    expect(readAssignment([up, up.toLowerCase()], null)).toMatchObject({ ok: true, shiftIds: [up.toLowerCase()] });
  });
});

describe("saveOutcome: what the panel does with a save's answer", () => {
  const given = { ok: true, message: "Turf given to 1 worker's shift." };
  const refused = { ok: false, message: "That shift is over." };
  it("on the turf it was sent for: the server's words, and the ticks cleared only when it worked", () => {
    expect(saveOutcome(false, given)).toEqual({ msg: { ok: true, text: given.message }, clearTicks: true, reopen: false });
    expect(saveOutcome(false, refused)).toEqual({ msg: { ok: false, text: refused.message }, clearTicks: false, reopen: true });
  });
  it("after the panel moved to another turf: never clears the new ticks, and says which save it was", () => {
    const late = saveOutcome(true, given);
    expect(late.clearTicks).toBe(false);
    expect(late.reopen).toBe(false);
    expect(late.msg).toEqual({ ok: true, text: "The save you sent a moment ago went through." });
    const lateRefused = saveOutcome(true, refused);
    expect(lateRefused.clearTicks).toBe(false);
    expect(lateRefused.msg.ok).toBe(false);
    expect(lateRefused.msg.text).toBe("The save you sent a moment ago did not go through. That shift is over.");
  });
  it("a failure is always told and brings a closed panel back, a call that never answered included", () => {
    for (const moved of [false, true]) {
      for (const result of [refused, null]) {
        const o = saveOutcome(moved, result);
        expect(o.msg.ok).toBe(false);
        expect(o.msg.text).not.toBe("");
        expect(o.reopen).toBe(true);
        expect(o.clearTicks).toBe(false);
      }
    }
  });
  it("a call that never answered does not claim to know what happened", () => {
    // The request or its answer was lost: the save may have gone through. Only the server can say "nothing was changed".
    for (const moved of [false, true]) {
      const text = saveOutcome(moved, null).msg.text;
      expect(text).toContain("It may or may not have saved: check the map before sending it again.");
      expect(text).not.toMatch(/nothing was changed/i);
    }
    expect(saveOutcome(false, null).msg.text).toMatch(/^Couldn't reach the server\./);
  });
});

describe("a save that takes too long", () => {
  afterEach(() => vi.useRealTimers());
  it("waits longer than the server's own limit for the save (10 s for a connection, 15 s for the transaction)", () => {
    expect(SAVE_PATIENCE_MS).toBeGreaterThan(25_000);
  });
  it("orOverdue hands over the answer when it comes in time, and leaves no timer behind", async () => {
    vi.useFakeTimers();
    const r = orOverdue(Promise.resolve("done"), 1000);
    await expect(r).resolves.toEqual({ overdue: false, value: "done" });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("orOverdue gives up waiting after the patience, without stopping the work", async () => {
    vi.useFakeTimers();
    let finish: (v: string) => void = () => {};
    const work = new Promise<string>((res) => { finish = res; });
    const r = orOverdue(work, 1000);
    let settled: unknown = null;
    void r.then((v) => { settled = v; });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toEqual({ overdue: true });
    // The work goes on, and whoever kept the promise still gets its answer.
    finish("late");
    await expect(work).resolves.toBe("late");
  });
  it("the notice while waiting promises nothing either way", () => {
    expect(OVERDUE_NOTICE).toMatch(/may still go through/);
    expect(OVERDUE_NOTICE).not.toMatch(/nothing was changed|saved\b/i);
  });
  it("when the overdue save answers: told which save it was, a failure brings the panel back, an unknown stays unknown", () => {
    expect(overdueOutcome({ ok: true, message: "Turf given to 2 workers' shifts." })).toEqual({ msg: { ok: true, text: "The save that was taking a long time went through. Turf given to 2 workers' shifts." }, reopen: false });
    expect(overdueOutcome({ ok: false, message: "Jo's shift has already ended; nothing was changed." })).toEqual({ msg: { ok: false, text: "The save that was taking a long time did not go through. Jo's shift has already ended; nothing was changed." }, reopen: true });
    const lost = overdueOutcome(null);
    expect(lost.reopen).toBe(true);
    expect(lost.msg.ok).toBe(false);
    expect(lost.msg.text).toBe("The save that was taking a long time got no answer. It may or may not have saved: check the map before sending it again.");
  });
});

describe("sameTurf: a shift that already has what is asked is left alone", () => {
  const read = readAssignment([id(1)], square);
  const turf = read.ok ? read.turf : null;
  if (!turf) throw new Error("fixture");
  it("the same corners in the same order are the same turf, however the stored JSON is written", () => {
    expect(sameTurf(square, turf)).toBe(true);
    // As Postgres hands a jsonb column back: its own key order, and extra keys the turf reader drops.
    expect(sameTurf({ coordinates: square.coordinates, bbox: [0, 0, 1, 1], type: "Polygon" }, turf)).toBe(true);
  });
  it("a moved corner, another order or another count of corners is a different turf", () => {
    const ring = square.coordinates[0];
    expect(sameTurf({ ...square, coordinates: [[ring[0], [-104.9, 39.7101], ring[2], ring[3]]] }, turf)).toBe(false);
    expect(sameTurf({ ...square, coordinates: [[ring[0], ring[2], ring[1], ring[3]]] }, turf)).toBe(false);
    expect(sameTurf({ ...square, coordinates: [[ring[0], ring[1], ring[2], [-104.89, 39.7], ring[3]]] }, turf)).toBe(false);
  });
  it("the same shape drawn from another corner counts as different: it is written, never skipped", () => {
    // Deliberately strict, and the same identity the map uses for a zone (zoneId hashes the corners in order). The
    // cost of being strict is one honest write; being loose could skip an assignment that was meant.
    const [p0, p1, p2] = square.coordinates[0];
    // (Drawn the other way round is the "another order" case above: the fixture is a triangle.)
    expect(sameTurf({ ...square, coordinates: [[p1, p2, p0, p1]] }, turf)).toBe(false);
  });
  it("no turf matches only a request to clear", () => {
    expect(sameTurf(null, null)).toBe(true);
    expect(sameTurf(undefined, null)).toBe(true);
    expect(sameTurf(null, turf)).toBe(false);
    expect(sameTurf(square, null)).toBe(false);
  });
  it("a stored value that is not a readable turf is never the same: it gets replaced, or cleared", () => {
    for (const junk of [{}, "x", 0, { type: "Polygon", coordinates: [] }, { type: "Point", coordinates: [0, 0] }]) {
      expect(sameTurf(junk, turf)).toBe(false);
      expect(sameTurf(junk, null)).toBe(false);
    }
  });
});

describe("assignMessage: what the organizer is told", () => {
  it("counts only the shifts that changed", () => {
    expect(assignMessage(true, 1, 0)).toBe("Turf given to 1 worker's shift.");
    expect(assignMessage(true, 3, 0)).toBe("Turf given to 3 workers' shifts.");
    expect(assignMessage(false, 2, 0)).toBe("Turf cleared on 2 workers' shifts.");
  });
  it("says how many were already as asked", () => {
    expect(assignMessage(true, 2, 1)).toBe("Turf given to 2 workers' shifts. 1 more already had this turf.");
    expect(assignMessage(false, 1, 2)).toBe("Turf cleared on 1 worker's shift. 2 more had no turf.");
  });
  it("never claims a change when there was none", () => {
    expect(assignMessage(true, 0, 1)).toBe("That shift already had this turf. Nothing was changed.");
    expect(assignMessage(true, 0, 2)).toBe("Both shifts already had this turf. Nothing was changed.");
    expect(assignMessage(true, 0, 3)).toBe("All 3 shifts already had this turf. Nothing was changed.");
    expect(assignMessage(false, 0, 3)).toBe("All 3 shifts had no turf. Nothing was changed.");
    expect(assignMessage(false, 0, 1)).toBe("That shift had no turf. Nothing was changed.");
    expect(assignMessage(false, 0, 2)).toBe("Both shifts had no turf. Nothing was changed.");
  });
});
