import { describe, expect, it } from "vitest";
import { MAX_SHIFTS_PER_ASSIGNMENT, assignProblem, readAssignment } from "./turf-assign";

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
