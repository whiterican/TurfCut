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
  it("leaves a finished or cancelled shift's turf alone", () => {
    expect(assignProblem({ cancelled: false, status: "SCHEDULED", checkedOutAt: null })).toBeNull();
    expect(assignProblem({ cancelled: false, status: "ACTIVE", checkedOutAt: null })).toBeNull();
    expect(assignProblem({ cancelled: true, status: "CANCELLED", checkedOutAt: null })).toMatch(/cancelled/);
    expect(assignProblem({ cancelled: false, status: "ACTIVE", checkedOutAt: new Date() })).toMatch(/finished/);
    expect(assignProblem({ cancelled: false, status: "COMPLETED", checkedOutAt: null })).toMatch(/finished/);
  });
});
