import { describe, expect, it } from "vitest";
import {
  activeTime,
  earningsEstimate,
  findConflicts,
  turfAction,
  turfMarks,
  locationCheck,
  readTurf,
  shiftProgress,
  shiftState,
  supervisorAction,
  validateShift,
  workerAction,
  type FieldEvent,
  type ShiftFacts,
} from "./field-day";

const T0 = new Date("2026-10-05T15:00:00Z"); // 9:00 AM in Denver
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const ev = (type: string, min: number, payload: Record<string, unknown> = {}, actorId = "w"): FieldEvent => ({ type, payload, actorId, createdAt: at(min) });
const shift = (events: FieldEvent[] = [], over: Partial<ShiftFacts> = {}): ShiftFacts => ({
  status: "SCHEDULED",
  startsAt: T0,
  endsAt: at(8 * 60),
  workType: "PETITION",
  events,
  validations: [],
  ...over,
});
const DENVER_STAGING = { lat: 39.7392, lng: -104.9903 };

describe("worker actions", () => {
  it("opens check-in an hour early and closes it at the end", () => {
    const loc = { kind: "check_in" as const, location: { checked: false as const } };
    expect(workerAction(shift(), loc, at(-61)).ok).toBe(false);
    expect(workerAction(shift(), loc, at(-60))).toEqual({ ok: true, event: { type: "CHECK_IN", payload: { locationChecked: false } }, status: "ACTIVE" });
    expect(workerAction(shift(), loc, at(8 * 60 + 1)).ok).toBe(false);
    expect(workerAction(shift([ev("CHECK_IN", 0)]), loc, at(5))).toEqual({ ok: false, reason: "You're already checked in." });
  });

  it("logs only the unit that fits the work type, and only while on shift", () => {
    const on = shift([ev("CHECK_IN", 0)]);
    expect(workerAction(shift(), { kind: "log", unit: "signatures", count: 3 }, at(10)).ok).toBe(false);
    expect(workerAction(on, { kind: "log", unit: "signatures", count: 3 }, at(10))).toEqual({ ok: true, event: { type: "SIGNATURE_SUBMITTED", payload: { count: 3 } } });
    expect(workerAction(on, { kind: "log", unit: "doors", count: 3 }, at(10)).ok).toBe(false);
    expect(workerAction(on, { kind: "log", unit: "signatures", count: 0 }, at(10)).ok).toBe(false);
    expect(workerAction(shift([ev("CHECK_IN", 0), ev("PAUSE_START", 5)]), { kind: "log", unit: "signatures", count: 1 }, at(10)).ok).toBe(false);
  });

  it("can't check out holding a packet or mid-break", () => {
    const holding = shift([ev("CHECK_IN", 0), ev("PACKET_PICKUP", 5, { packetId: "18A", sheets: 25 }, "sup")]);
    expect(workerAction(holding, { kind: "check_out" }, at(60))).toEqual({ ok: false, reason: "Return packet 18A before checking out." });
    const returned = shift([...holding.events, ev("PACKET_RETURN", 50, { packetId: "18A", sheetsReturned: 25, signatures: 23 })]);
    expect(workerAction(returned, { kind: "check_out" }, at(60))).toMatchObject({ ok: true, status: "COMPLETED" });
    expect(workerAction(shift([...returned.events, ev("PAUSE_START", 55)]), { kind: "check_out" }, at(60)).ok).toBe(false);
  });

  it("returns only packets checked out on this shift", () => {
    const s = shift([ev("CHECK_IN", 0), ev("PACKET_PICKUP", 5, { packetId: "18A", sheets: 25 }, "sup")]);
    expect(workerAction(s, { kind: "return_packet", packetId: "99Z", sheetsReturned: 1, signatures: 1 }, at(60)).ok).toBe(false);
    expect(workerAction(s, { kind: "return_packet", packetId: "18A", sheetsReturned: 25, signatures: 23 }, at(60))).toEqual({
      ok: true,
      event: { type: "PACKET_RETURN", payload: { packetId: "18A", sheetsReturned: 25, signatures: 23 } },
    });
  });

  it("cancels only before check-in, with a reason, as a worker cancellation", () => {
    expect(workerAction(shift(), { kind: "cancel", reason: " " }, at(-120)).ok).toBe(false);
    expect(workerAction(shift(), { kind: "cancel", reason: "car trouble" }, at(-120))).toEqual({
      ok: true,
      event: { type: "SHIFT_CANCELLED", payload: { by: "WORKER", reason: "car trouble" } },
      status: "CANCELLED",
    });
    expect(workerAction(shift([ev("CHECK_IN", 0)]), { kind: "cancel", reason: "x" }, at(5)).ok).toBe(false);
    expect(workerAction(shift([ev("SHIFT_CANCELLED", -60, { by: "WORKER" })]), { kind: "check_in", location: { checked: false } }, at(0)).ok).toBe(false);
  });
});

describe("supervisor actions — custody", () => {
  const on = shift([ev("CHECK_IN", 0)]);
  it("hands out a packet once, and never one that's out on another shift", () => {
    expect(supervisorAction(on, { kind: "packet_pickup", packetId: "18A", sheets: 25 }, [])).toEqual({
      ok: true,
      event: { type: "PACKET_PICKUP", payload: { packetId: "18A", sheets: 25 } },
    });
    expect(supervisorAction(on, { kind: "packet_pickup", packetId: "18A", sheets: 25 }, ["18A"]).ok).toBe(false);
    expect(supervisorAction(shift(), { kind: "packet_pickup", packetId: "18A", sheets: 25 }, []).ok).toBe(false);
    expect(supervisorAction(on, { kind: "packet_pickup", packetId: "18 A; drop", sheets: 25 }, []).ok).toBe(false);
  });

  it("counts the batch and closes out only after check-out; rejection needs a reason", () => {
    const done = shift([ev("CHECK_IN", 0), ev("SIGNATURE_SUBMITTED", 30, { count: 22 }), ev("CHECK_OUT", 240)]);
    expect(supervisorAction(on, { kind: "batch_count", reviewed: 2, accepted: 1, rejected: 1, exceptions: null }, []).ok).toBe(false);
    expect(supervisorAction(done, { kind: "batch_count", reviewed: 22, accepted: 20, rejected: 1, exceptions: null }, []).ok).toBe(false);
    expect(supervisorAction(done, { kind: "batch_count", reviewed: 22, accepted: 20, rejected: 2, exceptions: "2 out-of-county" }, [])).toEqual({
      ok: true,
      event: { type: "BATCH_COUNT", payload: { reviewed: 22, accepted: 20, rejected: 2, exceptions: "2 out-of-county" } },
    });
    expect(supervisorAction(done, { kind: "closeout", status: "REJECTED", reason: "" }, []).ok).toBe(false);
    expect(supervisorAction(done, { kind: "closeout", status: "APPROVED", reason: null }, [])).toEqual({
      ok: true,
      event: null,
      closeout: { status: "APPROVED", reason: null },
    });
  });

  it("organization cancellations are recorded as excused", () => {
    expect(supervisorAction(shift(), { kind: "cancel", reason: "rain" }, [])).toMatchObject({
      ok: true,
      event: { payload: { by: "ORGANIZATION", reason: "rain" } },
    });
  });
});

describe("check-in location", () => {
  it("stores only at-staging and a distance band — never the coordinates", () => {
    const near = locationCheck(DENVER_STAGING, { lat: 39.7400, lng: -104.9900 });
    expect(near).toEqual({ checked: true, atStaging: true, distance: "under 250 m" });
    expect(JSON.stringify(near)).not.toMatch(/39\.|104\./);
    expect(locationCheck(DENVER_STAGING, { lat: 39.7450, lng: -104.9903 })).toEqual({ checked: true, atStaging: false, distance: "250 m – 1 km" });
    expect(locationCheck(DENVER_STAGING, { lat: 39.80, lng: -104.99 })).toMatchObject({ atStaging: false, distance: "over 1 km" });
  });

  it("is simply not checked without a staging point or a device position", () => {
    expect(locationCheck({ lat: null, lng: null }, { lat: 39.74, lng: -104.99 })).toEqual({ checked: false });
    expect(locationCheck(DENVER_STAGING, null)).toEqual({ checked: false });
    expect(locationCheck(DENVER_STAGING, { lat: 999, lng: 0 })).toEqual({ checked: false });
  });
});

describe("progress timeline", () => {
  it("walks check-in → materials → collecting → review → payout", () => {
    const s = shift([ev("CHECK_IN", 0, { atStaging: true }), ev("PACKET_PICKUP", 5, { packetId: "18A", sheets: 25 }), ev("SIGNATURE_SUBMITTED", 60, { count: 23 })]);
    expect(shiftProgress(s).map((p) => [p.key, p.state])).toEqual([
      ["checkin", "done"],
      ["materials", "done"],
      ["collecting", "current"],
      ["return", "todo"],
      ["payout", "todo"],
    ]);
    expect(shiftProgress(s)[0]).toMatchObject({ detail: "At staging", at: at(0) });
    expect(shiftProgress(s)[2].detail).toBe("23 submitted");
  });

  it("shows the reviewer's reason when a shift isn't approved", () => {
    const s = shift([ev("CHECK_IN", 0), ev("CHECK_OUT", 240)], {
      validations: [{ workEventId: null, status: "REJECTED", reason: "Sheets missing", createdAt: at(250) }],
    });
    expect(shiftProgress(s)[3]).toMatchObject({ state: "done", detail: "Not approved: Sheets missing" });
  });

  it("tracks packets in and out", () => {
    const st = shiftState(shift([ev("PACKET_PICKUP", 1, { packetId: "A" }), ev("PACKET_PICKUP", 2, { packetId: "B" }), ev("PACKET_RETURN", 3, { packetId: "A" })]));
    expect(st.packetsOut).toEqual(["B"]);
    expect(st.packetsReturned).toEqual(["A"]);
  });
});

describe("scheduling", () => {
  it("finds overlaps across every campaign, ignoring cancelled shifts", () => {
    const existing = [
      { id: "a", startsAt: at(0), endsAt: at(240), status: "SCHEDULED" },
      { id: "b", startsAt: at(300), endsAt: at(480), status: "CANCELLED" },
    ];
    expect(findConflicts({ startsAt: at(200), endsAt: at(400) }, existing).map((c) => c.id)).toEqual(["a"]);
    expect(findConflicts({ startsAt: at(240), endsAt: at(480) }, existing)).toEqual([]); // back-to-back is fine
  });

  it("validates the schedule form, including the turf polygon", () => {
    const job = { startsAt: new Date("2026-10-05"), endsAt: new Date("2026-10-18") };
    const turf = { type: "Polygon", coordinates: [[[-104.99, 39.74], [-104.98, 39.74], [-104.98, 39.75], [-104.99, 39.74]]] };
    const r = validateShift({ startsAt: at(0).toISOString(), endsAt: at(480).toISOString(), stagingLocation: "Denver Central, table 3", stagingLat: "39.7392", stagingLng: "-104.9903", turfArea: JSON.stringify(turf) }, job);
    expect(r).toMatchObject({ ok: true, value: { stagingLat: 39.7392, stagingLng: -104.9903, turfArea: turf } });
    expect(validateShift({ startsAt: at(0).toISOString(), endsAt: at(0).toISOString() }, job)).toMatchObject({ ok: false, errors: { endsAt: expect.any(String) } });
    expect(validateShift({ startsAt: "2026-11-30T15:00:00Z", endsAt: "2026-11-30T20:00:00Z" }, job)).toMatchObject({ ok: false, errors: { startsAt: "That's after the job ends." } });
    expect(validateShift({ startsAt: at(0).toISOString(), endsAt: at(60).toISOString(), stagingLat: "39.7" }, job)).toMatchObject({ ok: false, errors: { stagingLat: expect.any(String) } });
  });

  it("only accepts a closed, bounded polygon", () => {
    expect(readTurf({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1]]] })).toBeNull(); // too few points
    expect(readTurf({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] })).toBeNull(); // not closed
    expect(readTurf({ type: "Point", coordinates: [0, 0] })).toBeNull();
    expect(readTurf({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 91], [0, 0]]] })).toBeNull(); // bad latitude
  });
});

describe("turf marks — pins and the worker's day turf", () => {
  const pin = (id: string, min: number, extra: Record<string, unknown> = {}) =>
    ev("NOTE", min, { kind: "pin", pinId: id, lat: 39.74, lng: -104.99, category: "good_spot", label: "Library steps", ...extra });
  const square = { type: "Polygon", coordinates: [[[-104.99, 39.74], [-104.98, 39.74], [-104.98, 39.75], [-104.99, 39.74]]] };

  it("replays pins and removals in order — nothing is edited", () => {
    const m = turfMarks([pin("a", 1), pin("b", 2, { category: "do_not_knock", label: null }), ev("NOTE", 3, { kind: "unpin", pinId: "a" })]);
    expect(m.pins.map((p) => [p.id, p.category])).toEqual([["b", "do_not_knock"]]);
    expect(turfMarks([ev("NOTE", 1, { kind: "pin", pinId: "x", lat: 999, lng: 0, category: "note" })]).pins).toEqual([]);
  });

  it("drops a pin, cleaned up, during the day of the shift only", () => {
    const a = { kind: "pin" as const, pinId: "p1", lat: 39.7392123456, lng: -104.9903, category: "come_back", label: "  gate   code? " };
    expect(turfAction(shift(), a, at(-61)).ok).toBe(false);
    expect(turfAction(shift(), a, at(-30))).toEqual({
      ok: true,
      event: { type: "NOTE", payload: { kind: "pin", pinId: "p1", lat: 39.739212, lng: -104.9903, category: "come_back", label: "gate code?" } },
    });
    expect(turfAction(shift(), a, at(8 * 60 + 6 * 60 + 1)).ok).toBe(false);
    expect(turfAction(shift(), { ...a, category: "secret" }, at(0)).ok).toBe(false);
    const reviewed = shift([], { validations: [{ workEventId: null, status: "APPROVED", reason: null, createdAt: at(500) }] });
    expect(turfAction(reviewed, a, at(510)).ok).toBe(false);
  });

  it("removes only existing pins", () => {
    expect(turfAction(shift([pin("a", 1)]), { kind: "unpin", pinId: "a" }, at(5))).toMatchObject({ ok: true, event: { payload: { kind: "unpin", pinId: "a" } } });
    expect(turfAction(shift(), { kind: "unpin", pinId: "a" }, at(5)).ok).toBe(false);
  });

  it("lets the worker mark their own day turf only when the campaign didn't assign one", () => {
    expect(turfAction(shift(), { kind: "day_turf", polygon: square }, at(0))).toMatchObject({ ok: true, event: { payload: { kind: "day_turf" } } });
    expect(turfAction(shift([], { campaignTurf: true }), { kind: "day_turf", polygon: square }, at(0))).toEqual({ ok: false, reason: "The campaign assigned this shift's turf." });
    expect(turfAction(shift(), { kind: "day_turf", polygon: { type: "Polygon", coordinates: [[[0, 0], [1, 1]]] } }, at(0)).ok).toBe(false);
    const drawn = [ev("NOTE", 1, { kind: "day_turf", polygon: square })];
    expect(turfMarks(drawn).dayTurf).toEqual(square);
    expect(turfMarks([...drawn, ev("NOTE", 2, { kind: "day_turf", polygon: null })]).dayTurf).toBeNull();
  });
});

describe("turf marks — limits and hostile input", () => {
  it("caps total turf events and day-turf redraws (append-only can't grow forever)", async () => {
    const { MAX_TURF_EVENTS, MAX_DAY_TURF_EVENTS } = await import("./field-day");
    const churn = Array.from({ length: MAX_TURF_EVENTS }, (_, i) => ev("NOTE", 1, { kind: i % 2 ? "unpin" : "pin", pinId: "a", lat: 39.7, lng: -104.9, category: "note" }));
    expect(turfAction(shift(churn), { kind: "pin", pinId: "b", lat: 39.7, lng: -104.9, category: "note", label: null }, at(5)).ok).toBe(false);
    // …but a live pin can still be removed at the cap.
    const atCapWithPin = [...churn.slice(0, MAX_TURF_EVENTS - 1), ev("NOTE", 2, { kind: "pin", pinId: "keep", lat: 39.7, lng: -104.9, category: "do_not_knock" })];
    expect(turfAction(shift(atCapWithPin), { kind: "unpin", pinId: "keep" }, at(5)).ok).toBe(true);
    const sq = { type: "Polygon", coordinates: [[[-104.99, 39.74], [-104.98, 39.74], [-104.98, 39.75], [-104.99, 39.74]]] };
    const redraws = Array.from({ length: MAX_DAY_TURF_EVENTS }, () => ev("NOTE", 1, { kind: "day_turf", polygon: sq }));
    expect(turfAction(shift(redraws), { kind: "day_turf", polygon: sq }, at(5))).toEqual({ ok: false, reason: "You've redrawn this shift's turf too many times." });
  });

  it("refuses non-text labels and unknown kinds instead of crashing", () => {
    expect(turfAction(shift(), { kind: "pin", pinId: "p", lat: 39.7, lng: -104.9, category: "note", label: 42 as unknown as string }, at(5)).ok).toBe(false);
    expect(turfAction(shift(), { kind: "explode" } as never, at(5))).toEqual({ ok: false, reason: "Unknown turf action." });
  });
});

describe("live time worked and earnings estimate", () => {
  it("counts from check-in, minus breaks, until now or check-out", () => {
    const evs = [ev("CHECK_IN", 0), ev("PAUSE_START", 60), ev("PAUSE_END", 90)];
    expect(activeTime(shift(evs, { status: "ACTIVE" }), at(120))).toEqual({ ms: 90 * 60_000, running: true });
    // On a break: the clock stops at the break's start.
    expect(activeTime(shift([ev("CHECK_IN", 0), ev("PAUSE_START", 60)], { status: "ACTIVE" }), at(120))).toEqual({ ms: 60 * 60_000, running: false });
    // Checked out: fixed at check-out, whatever "now" is.
    expect(activeTime(shift([...evs, ev("CHECK_OUT", 300)], { status: "COMPLETED" }), at(999)).ms).toBe(270 * 60_000);
    expect(activeTime(shift([]), at(10))).toEqual({ ms: 0, running: false });
    // Forgot to check out: stops at the scheduled end (8h), not "26h".
    expect(activeTime(shift([ev("CHECK_IN", 0)], { status: "ACTIVE" }), at(26 * 60))).toEqual({ ms: 8 * 60 * 60_000, running: false });
  });
  it("estimates gross pay honestly for each pay method", () => {
    expect(earningsEstimate("HOURLY", 2800, 90 * 60_000, 0)).toEqual({ cents: 4200, label: "Est. gross" });
    expect(earningsEstimate("PER_UNIT", 150, 0, 23)).toEqual({ cents: 3450, label: "Gross if all accepted" });
    expect(earningsEstimate("SHIFT_RATE", 12000, 0, 0)).toEqual({ cents: 12000, label: "Per completed shift" });
    expect(earningsEstimate("HOURLY", null, 1, 1)).toBeNull();
  });
});
