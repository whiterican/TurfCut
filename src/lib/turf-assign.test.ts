import { afterEach, describe, expect, it, vi } from "vitest";
import { ASSIGN_TX, MAX_SHIFTS_PER_ASSIGNMENT, SAVE_PATIENCE_MS, assignMessage, assignProblem, readAssignment, readSaveAnswer, sameTurf, saveOutcome, sendTurf } from "./turf-assign";

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
    expect(saveOutcome(false, given)).toEqual({ msg: { ok: true, text: given.message }, clearTicks: true, reopen: false, refresh: true });
    expect(saveOutcome(false, refused)).toEqual({ msg: { ok: false, text: refused.message }, clearTicks: false, reopen: true, refresh: true });
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
  it("asks the server for the page again only after an answer: with no signal a refresh reloads the page and loses the panel", () => {
    for (const moved of [false, true]) {
      expect(saveOutcome(moved, null).refresh).toBe(false);
      expect(saveOutcome(moved, given).refresh).toBe(true);
      // A refusal too: the page may be behind (a shift that ended is why it was refused).
      expect(saveOutcome(moved, refused).refresh).toBe(true);
    }
  });
  it("a call that never answered does not claim to know what happened", () => {
    // The request or its answer was lost: the save may have gone through. Only the server can say "nothing was changed".
    for (const moved of [false, true]) {
      const text = saveOutcome(moved, null).msg.text;
      expect(text).toContain("It may or may not have saved: check the map before sending it again.");
      expect(text).not.toMatch(/nothing was changed/i);
    }
    expect(saveOutcome(false, null).msg.text).toBe("The save got no answer. It may or may not have saved: check the map before sending it again.");
  });
});

describe("sending a save, with a limit on how long it may take", () => {
  afterEach(() => vi.useRealTimers());
  const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("waits longer than the server's own limits for the save put together", () => {
    expect(SAVE_PATIENCE_MS).toBeGreaterThan(ASSIGN_TX.maxWait + ASSIGN_TX.timeout);
  });
  it("reads the route's answers, and nothing else as an answer", () => {
    expect(readSaveAnswer({ ok: true, message: "Turf given to 1 worker's shift." })).toEqual({ ok: true, message: "Turf given to 1 worker's shift." });
    expect(readSaveAnswer({ error: "Jo's shift has already ended; nothing was changed." })).toEqual({ ok: false, message: "Jo's shift has already ended; nothing was changed." });
    // A gateway's page, an empty body, a shape that is not the route's: not an answer, so nothing is claimed from it.
    for (const junk of [null, undefined, "", "<html>504</html>", 0, [], {}, { ok: true }, { ok: "yes", message: "x" }, { error: "" }, { error: 5 }, { message: "x" }]) expect(readSaveAnswer(junk)).toBeNull();
  });
  it("posts the shifts and the turf to the turf route, and hands back what it said", async () => {
    const calls: [string, RequestInit][] = [];
    const fetcher = (async (url: string, init: RequestInit) => { calls.push([url, init]); return answer({ ok: true, message: "Turf given to 2 workers' shifts." }); }) as unknown as typeof fetch;
    await expect(sendTurf([id(1), id(2)], square, 1000, fetcher)).resolves.toEqual({ ok: true, message: "Turf given to 2 workers' shifts." });
    expect(calls[0][0]).toBe("/api/field/turf");
    expect(calls[0][1].method).toBe("POST");
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ shiftIds: [id(1), id(2)], polygon: square });
    // Clearing sends null, never a missing turf.
    await sendTurf([id(1)], null, 1000, fetcher);
    expect(JSON.parse(String(calls[1][1].body))).toEqual({ shiftIds: [id(1)], polygon: null });
  });
  it("a refusal is an answer whatever its status", async () => {
    const fetcher = (async () => answer({ error: "Your role can't do this." }, 403)) as unknown as typeof fetch;
    await expect(sendTurf([id(1)], square, 1000, fetcher)).resolves.toEqual({ ok: false, message: "Your role can't do this." });
  });
  it("no answer when the network fails or what comes back is not the route's", async () => {
    await expect(sendTurf([id(1)], square, 1000, (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch)).resolves.toBeNull();
    await expect(sendTurf([id(1)], square, 1000, (async () => new Response("<html>504 Gateway Timeout</html>", { status: 504 })) as unknown as typeof fetch)).resolves.toBeNull();
  });
  it("gives the request up when the time runs out: it always ends, and leaves no timer behind", async () => {
    vi.useFakeTimers();
    let aborted = false;
    // A server that never answers: only giving the request up ends it.
    const stalled = ((_url: string, init: RequestInit) => new Promise<Response>((_res, rej) => {
      init.signal?.addEventListener("abort", () => { aborted = true; rej(new DOMException("aborted", "AbortError")); });
    })) as unknown as typeof fetch;
    let settled: unknown = "waiting";
    void sendTurf([id(1)], square, 30_000, stalled).then((v) => { settled = v; });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(settled).toBe("waiting");
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(aborted).toBe(true);
    expect(settled).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("gives up on an answer whose body never finishes arriving", async () => {
    vi.useFakeTimers();
    // Headers came, the body stalls: reading it only ends when the request is given up.
    const halfway = ((_url: string, init: RequestInit) => Promise.resolve({ json: () => new Promise((_res, rej) => { init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))); }) })) as unknown as typeof fetch;
    let settled: unknown = "waiting";
    void sendTurf([id(1)], square, 30_000, halfway).then((v) => { settled = v; });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(settled).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("an answer in time clears the timer", async () => {
    vi.useFakeTimers();
    await sendTurf([id(1)], square, 30_000, (async () => answer({ ok: true, message: "ok" })) as unknown as typeof fetch);
    expect(vi.getTimerCount()).toBe(0);
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
