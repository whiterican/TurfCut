import { describe, expect, it } from "vitest";
import { dayWindow, groupField, needsReview, reviewQueue, shiftDay, type FieldRow } from "./field-view";
import type { ShiftState } from "./field-day";

const st = (o: Partial<ShiftState> = {}): ShiftState => ({
  cancelled: false, checkedInAt: null, checkedOutAt: null, paused: false, packetsOut: [], packetsReturned: [],
  signatures: 0, doors: 0, contacts: 0, batchCounted: false, closeout: null, atStaging: null, ...o,
});
const d = (s: string) => new Date(s);
const row = (id: string, jobId: string, staging: string | null, startsAt: string, s: Partial<ShiftState> = {}): FieldRow => ({
  shiftId: id, jobId, jobTitle: jobId === "j1" ? "Alpha drive" : "Beta drive", staging, worker: id, startsAt: d(startsAt), endsAt: d(startsAt), state: st(s),
});

describe("field views", () => {
  it("reads a day from the URL, refusing anything malformed or impossible", () => {
    expect(dayWindow("2026-10-04")).toEqual({ from: d("2026-10-04T00:00:00Z"), to: d("2026-10-05T00:00:00Z") });
    for (const bad of ["2026-02-30", "2026-1-4", "today", "2026-10-04T00:00"]) expect(dayWindow(bad)).toBeNull();
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("groups by job then staging point (unset last), with check-ins, packets out and signatures", () => {
    const g = groupField([
      row("b", "j1", "Library", "2026-10-04T16:00:00Z", { checkedInAt: d("2026-10-04T16:01:00Z"), packetsOut: ["P1", "P2"], signatures: 12 }),
      row("a", "j1", "Library", "2026-10-04T15:00:00Z", { signatures: 3 }),
      row("c", "j1", null, "2026-10-04T15:00:00Z"),
      row("e", "j2", "Park", "2026-10-04T15:00:00Z"),
    ]);
    expect(g.map((x) => [x.jobTitle, x.staging, x.rows.map((r) => r.shiftId)])).toEqual([
      ["Alpha drive", "Library", ["a", "b"]],
      ["Alpha drive", null, ["c"]],
      ["Beta drive", "Park", ["e"]],
    ]);
    expect(g[0]).toMatchObject({ checkedIn: 1, packetsOut: 2, signatures: 15 });
  });

  it("queues checked-out shifts without a closeout, longest waiting first; never cancelled or reviewed ones", () => {
    const approved = { status: "APPROVED" } as ShiftState["closeout"];
    expect(needsReview(st({ checkedOutAt: d("2026-10-04T18:00:00Z") }))).toBe(true);
    expect(needsReview(st({ checkedOutAt: d("2026-10-04T18:00:00Z"), closeout: approved }))).toBe(false);
    expect(needsReview(st({ checkedOutAt: d("2026-10-04T18:00:00Z"), cancelled: true }))).toBe(false);
    expect(needsReview(st({ checkedInAt: d("2026-10-04T15:00:00Z") }))).toBe(false);
    const q = reviewQueue([
      { id: "late", state: st({ checkedOutAt: d("2026-10-04T20:00:00Z") }) },
      { id: "done", state: st({ checkedOutAt: d("2026-10-03T20:00:00Z"), closeout: approved }) },
      { id: "early", state: st({ checkedOutAt: d("2026-10-03T19:00:00Z") }) },
    ]);
    expect(q.map((x) => x.id)).toEqual(["early", "late"]);
  });
});
