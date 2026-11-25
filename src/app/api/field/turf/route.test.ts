import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ apiArea: vi.fn(), assignShiftTurf: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/api-session", async (real) => ({ ...(await real<typeof import("@/lib/api-session")>()), apiArea: m.apiArea }));
vi.mock("@/lib/auth", () => ({ getSessionProfile: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: vi.fn() }));
vi.mock("@/lib/field-day-data", () => ({ assignShiftTurf: m.assignShiftTurf }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));

import { POST } from "./route";
import { readSaveAnswer } from "@/lib/turf-assign";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const square = { type: "Polygon", coordinates: [[[-104.9, 39.7], [-104.9, 39.71], [-104.89, 39.71], [-104.9, 39.7]]] };
const post = (body: unknown, headers: Record<string, string> = {}, signal?: AbortSignal) =>
  POST(new Request("http://t/api/field/turf", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body), signal }));

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

  it("takes requests from Turfcut's own pages only, as the server action it replaced did", async () => {
    m.assignShiftTurf.mockResolvedValue({ ok: true, count: 1, unchanged: 0 });
    const good = { shiftIds: [id(1)], polygon: square };
    const foreign: Record<string, string>[] = [{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { origin: "https://evil.example", host: "turf-cut.vercel.app" }, { origin: "https://app.turf-cut.vercel.app", "x-forwarded-host": "turf-cut.vercel.app" }, { origin: "null" }];
    for (const headers of foreign) {
      const res = await post(good, headers);
      expect(res.status).toBe(403);
      expect(readSaveAnswer(await res.json())?.ok).toBe(false);
    }
    // Refused before anyone's session is even looked at.
    expect(m.apiArea).not.toHaveBeenCalled();
    expect(m.assignShiftTurf).not.toHaveBeenCalled();
    const own: Record<string, string>[] = [{ "sec-fetch-site": "same-origin" }, { origin: "https://turf-cut.vercel.app", "x-forwarded-host": "turf-cut.vercel.app" }, { origin: "http://localhost:3475", host: "localhost:3475" }, {}];
    for (const headers of own) {
      expect((await post(good, headers)).status).toBe(200);
    }
    // The browser's own word wins over an Origin a page could not have forged anyway.
    expect((await post(good, { "sec-fetch-site": "same-origin", origin: "https://turf-cut.vercel.app", host: "internal:3000" })).status).toBe(200);
  });

  it("a session check that fails is told as one: nothing has run", async () => {
    m.apiArea.mockRejectedValue(new Error("auth service unavailable"));
    const res = await post({ shiftIds: [id(1)], polygon: square });
    expect(res.status).toBe(503);
    expect(readSaveAnswer(await res.json())).toEqual({ ok: false, message: "Couldn't check your sign-in just now. Nothing was changed. Try again." });
    expect(m.assignShiftTurf).not.toHaveBeenCalled();
  });

  it("a request already given up is not begun", async () => {
    const gone = new AbortController();
    gone.abort();
    const req = new Request("http://t/api/field/turf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shiftIds: [id(1)], polygon: square }) });
    Object.defineProperty(req, "signal", { value: gone.signal });
    const res = await POST(req);
    expect(res.status).toBe(408);
    expect(m.assignShiftTurf).not.toHaveBeenCalled();
  });

  it("refuses more shifts than one assignment may cover", async () => {
    const res = await post({ shiftIds: Array.from({ length: 51 }, (_, i) => id(i + 1)), polygon: square });
    expect(res.status).toBe(400);
    expect(m.assignShiftTurf).not.toHaveBeenCalled();
  });

  it("a database failure is told as one: the transaction did not commit, so nothing was changed", async () => {
    m.assignShiftTurf.mockRejectedValue(new Error("connection lost"));
    const res = await post({ shiftIds: [id(1)], polygon: square });
    expect(res.status).toBe(500);
    expect(readSaveAnswer(await res.json())).toEqual({ ok: false, message: "Couldn't save the turf. Nothing was changed. Try again." });
  });
});
