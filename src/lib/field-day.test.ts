import { describe, expect, it } from "vitest";
import {
  findConflicts,
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
