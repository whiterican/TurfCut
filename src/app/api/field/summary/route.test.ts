import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShiftState } from "@/lib/field-day";

const m = vi.hoisted(() => ({ apiArea: vi.fn(), loadFieldWindow: vi.fn() }));
vi.mock("@/lib/api-session", () => ({ apiArea: m.apiArea }));
vi.mock("@/lib/field-day-data", () => ({ loadFieldWindow: m.loadFieldWindow }));

import { GET } from "./route";

const st = (o: Partial<ShiftState> = {}): ShiftState => ({
  cancelled: false, checkedInAt: null, checkedOutAt: null, paused: false, packetsOut: [], packetsReturned: [],
  packetsHeld: [], signatures: 0, doors: 0, contacts: 0, batchCounted: false, appCounts: null, closeout: null, atStaging: null, ...o,
});

describe("GET /api/field/summary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T18:00:00Z"));
    m.apiArea.mockReset();
    m.loadFieldWindow.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("needs the field area at read level and passes the guard's refusal through", async () => {
    m.apiArea.mockResolvedValue({ error: Response.json({ error: "Your role can't do this." }, { status: 403 }) });
    const res = await GET(new Request("http://t/api/field/summary"));
    expect(res.status).toBe(403);
    expect(m.apiArea).toHaveBeenCalledWith("field", "read");
    expect(m.loadFieldWindow).not.toHaveBeenCalled();
  });

  it("counts the caller's organization over the field page's window, with nobody's name in the body", async () => {
    m.apiArea.mockResolvedValue({ session: { orgId: "org-1" } });
    m.loadFieldWindow.mockResolvedValue([
      { shiftId: "s-1", jobId: "j", jobTitle: "Drive", staging: "Steps", worker: "Zed Worker", startsAt: new Date("2026-10-24T16:00:00Z"), endsAt: new Date("2026-10-24T22:00:00Z"), state: st({ checkedInAt: new Date("2026-10-24T16:01:00Z"), signatures: 4 }), turf: null },
    ]);
    const res = await GET(new Request("http://t/api/field/summary"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const [orgId, from, to] = m.loadFieldWindow.mock.calls[0];
    expect(orgId).toBe("org-1");
    expect(from).toEqual(new Date("2026-10-24T06:00:00Z"));
    expect(to).toEqual(new Date("2026-10-25T18:00:00Z"));
    const body = await res.text();
    expect(body).not.toMatch(/Zed|s-1/);
    expect(JSON.parse(body).today).toMatchObject({ due: 1, onGround: 1, signatures: 4 });
  });

  it("narrows to one job with ?job=<id>, as the Field map's filter does, and ignores anything that is not an id", async () => {
    m.apiArea.mockResolvedValue({ session: { orgId: "org-1" } });
    const row = (shiftId: string, jobId: string) => ({ shiftId, jobId, jobTitle: jobId, staging: null, worker: "W", startsAt: new Date("2026-10-24T16:00:00Z"), endsAt: new Date("2026-10-24T22:00:00Z"), state: st({ checkedInAt: new Date("2026-10-24T16:01:00Z") }), turf: null });
    const a = "00000000-0000-0000-0000-000000000061";
    m.loadFieldWindow.mockResolvedValue([row("s-1", a), row("s-2", "00000000-0000-0000-0000-000000000062")]);
    const one = await (await GET(new Request(`http://t/api/field/summary?job=${a}`))).json();
    expect(one.today.due).toBe(1);
    const all = await (await GET(new Request("http://t/api/field/summary?job=not-an-id"))).json();
    expect(all.today.due).toBe(2);
  });
});
