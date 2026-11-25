import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ apiArea: vi.fn(), assignShiftTurf: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/api-session", () => ({ apiArea: m.apiArea }));
vi.mock("@/lib/field-day-data", () => ({ assignShiftTurf: m.assignShiftTurf }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { POST } from "./route";
import { readSaveAnswer } from "@/lib/turf-assign";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const square = { type: "Polygon", coordinates: [[[-104.9, 39.7], [-104.9, 39.71], [-104.89, 39.71], [-104.9, 39.7]]] };
const post = (body: unknown) => POST(new Request("http://t/api/field/turf", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("POST /api/field/turf", () => {
  beforeEach(() => {
    for (const f of Object.values(m)) f.mockReset();
    m.apiArea.mockResolvedValue({ session: { userId: "u-1", orgId: "org-1" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("needs the scheduling area in full: seeing the Field map is not enough", async () => {
    m.apiArea.mockResolvedValue({ error: Response.json({ error: "Your role can't do this." }, { status: 403 }) });
    const res = await post({ shiftIds: [id(1)], polygon: square });
    expect(res.status).toBe(403);
    expect(m.apiArea).toHaveBeenCalledWith("scheduling");
    expect(m.assignShiftTurf).not.toHaveBeenCalled();
    // The panel shows the guard's words as they are.
    expect(readSaveAnswer(await res.json())).toEqual({ ok: false, message: "Your role can't do this." });
  });

  it("gives the turf as the caller, for the caller's organization, and says what changed", async () => {
    m.assignShiftTurf.mockResolvedValue({ ok: true, count: 2, unchanged: 1 });
    const res = await post({ shiftIds: [id(1), id(2), id(3)], polygon: square });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const [actor, shiftIds, turf] = m.assignShiftTurf.mock.calls[0];
    expect(actor).toEqual({ profileId: "u-1", orgId: "org-1" });
    expect(shiftIds).toEqual([id(1), id(2), id(3)]);
    expect(turf.coordinates[0]).toHaveLength(4);
    expect(readSaveAnswer(await res.json())).toEqual({ ok: true, message: "Turf given to 2 workers' shifts. 1 more already had this turf." });
    expect(m.revalidatePath.mock.calls.map((c) => c[0])).toEqual(["/field", `/shifts/${id(1)}`, `/shifts/${id(2)}`, `/shifts/${id(3)}`]);
  });

  it("clears with an explicit null, never with a missing turf", async () => {
    m.assignShiftTurf.mockResolvedValue({ ok: true, count: 1, unchanged: 0 });
    const cleared = await post({ shiftIds: [id(1)], polygon: null });
    expect(m.assignShiftTurf.mock.calls[0][2]).toBeNull();
    expect((await cleared.json()).message).toBe("Turf cleared on 1 worker's shift.");
    m.assignShiftTurf.mockClear();
    const missing = await post({ shiftIds: [id(1)] });
    expect(missing.status).toBe(400);
    expect(m.assignShiftTurf).not.toHaveBeenCalled();
  });

  it("refuses a bad request before touching the database, in words the panel can show", async () => {
    for (const body of ["not json", null, [], { shiftIds: [], polygon: square }, { shiftIds: ["nope"], polygon: square }, { shiftIds: [id(1)], polygon: { type: "Point", coordinates: [0, 0] } }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(readSaveAnswer(await res.json())?.ok).toBe(false);
    }
    expect(m.assignShiftTurf).not.toHaveBeenCalled();
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("passes a rule's refusal through: 409, or 404 for a shift that is not the caller's", async () => {
    m.assignShiftTurf.mockResolvedValue({ ok: false, reason: "Jo's shift has already ended; nothing was changed." });
    const ended = await post({ shiftIds: [id(1)], polygon: square });
    expect(ended.status).toBe(409);
    expect(readSaveAnswer(await ended.json())).toEqual({ ok: false, message: "Jo's shift has already ended; nothing was changed." });
    m.assignShiftTurf.mockResolvedValue({ ok: false, reason: "Shift not found." });
    expect((await post({ shiftIds: [id(1)], polygon: square })).status).toBe(404);
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("a database failure is told as one: the transaction did not commit, so nothing was changed", async () => {
    m.assignShiftTurf.mockRejectedValue(new Error("connection lost"));
    const res = await post({ shiftIds: [id(1)], polygon: square });
    expect(res.status).toBe(500);
    expect(readSaveAnswer(await res.json())).toEqual({ ok: false, message: "Couldn't save the turf. Nothing was changed. Try again." });
  });
});
