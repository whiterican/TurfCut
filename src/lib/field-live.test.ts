import { describe, expect, it } from "vitest";
import type { ShiftState } from "./field-day";
import { groupField } from "./field-view";
import { fillOpacity, groupKey, readSummary, shortHash, summarizeField, zoneFill, type LiveRow } from "./field-live";

const now = new Date("2026-10-24T18:00:00Z");
const turfA = { type: "Polygon" as const, coordinates: [[[-73.9, 40.7], [-73.8, 40.7], [-73.8, 40.8], [-73.9, 40.7]]] as [number, number][][] };
const turfB = { type: "Polygon" as const, coordinates: [[[-74.1, 40.6], [-74.0, 40.6], [-74.0, 40.7], [-74.1, 40.6]]] as [number, number][][] };

const st = (s: Partial<ShiftState> = {}): ShiftState => ({
  cancelled: false, checkedInAt: null, checkedOutAt: null, paused: false, packetsOut: [], packetsReturned: [], packetsHeld: [], signatures: 0, doors: 0, contacts: 0, batchCounted: false, appCounts: null, closeout: null, atStaging: null, ...s,
});

const row = (id: string, o: Partial<LiveRow> & { s?: Partial<ShiftState> } = {}): LiveRow => {
  const { s, ...rest } = o;
  return {
    shiftId: id,
    jobId: "job-1",
    jobTitle: "Petition drive",
    staging: "Library steps",
    worker: "Zed Worker",
    startsAt: new Date("2026-10-24T16:00:00Z"),
    endsAt: new Date("2026-10-24T22:00:00Z"),
    state: st(s),
    turf: null,
    ...rest,
  };
};
const inAt = new Date("2026-10-24T16:05:00Z");
const outAt = new Date("2026-10-24T17:30:00Z");

describe("summarizeField", () => {
  it("counts the Desk's and the field page's figures the way those pages do", () => {
    const rows = [
      row("a", { s: { checkedInAt: inAt, signatures: 12, packetsOut: ["P1"] } }),
      row("b", { s: { checkedInAt: inAt, checkedOutAt: outAt, signatures: 5 } }),
      row("c"), // due, not checked in: late
      row("d", { startsAt: new Date("2026-10-24T20:00:00Z") }), // upcoming
      row("e", { s: { cancelled: true, checkedInAt: inAt } }),
    ];
    const s = summarizeField(rows, now);
    expect(s.today).toEqual({ due: 3, dueCheckedIn: 2, underWay: 2, onGround: 1, upcoming: 1, signatures: 17, doors: 0, packetsOut: 1 });
    expect(s.at).toBe(now.toISOString());
  });

  it("matches groupField's keys and totals, so the board's lines can go live", () => {
    const rows = [
      row("a", { s: { checkedInAt: inAt, signatures: 3 } }),
      row("b", { staging: null, s: { packetsHeld: ["H1"] } }),
      row("c", { jobId: "job-2", jobTitle: "Canvass", s: { doors: 40 } }),
    ];
    const s = summarizeField(rows, now);
    const groups = groupField(rows);
    expect(s.groups.map((g) => g.key).sort()).toEqual(groups.map(groupKey).sort());
    for (const g of groups) {
      const live = s.groups.find((x) => x.key === groupKey(g))!;
      expect(live).toMatchObject({ total: g.rows.length, checkedIn: g.checkedIn, packetsOut: g.packetsOut, packetsHeld: g.packetsHeld, signatures: g.signatures });
    }
  });

  it("fills zones by the share on the ground, one zone per distinct polygon, never per person", () => {
    const rows = [
      row("a", { turf: turfA, s: { checkedInAt: inAt } }),
      row("b", { turf: turfA }),
      row("c", { turf: { ...turfA, coordinates: turfA.coordinates.map((r) => r.map((p) => [...p] as [number, number])) }, s: { checkedInAt: inAt, checkedOutAt: outAt } }),
      row("d", { turf: turfB, s: { checkedInAt: inAt } }),
      row("e", { turf: turfB, s: { cancelled: true } }),
      row("f"),
    ];
    const s = summarizeField(rows, now);
    expect(s.zones).toHaveLength(2);
    const a = s.zones.find((z) => z.turf.coordinates[0][0][0] === -73.9)!;
    expect(a).toMatchObject({ total: 3, onGround: 1 });
    expect(zoneFill(a)).toBeCloseTo(1 / 3);
    const b = s.zones.find((z) => z.turf.coordinates[0][0][0] === -74.1)!;
    expect(b).toMatchObject({ total: 1, onGround: 1 });
    expect(zoneFill({ total: 0, onGround: 0 })).toBe(0);
    expect(fillOpacity(0)).toBeCloseTo(0.12);
    expect(fillOpacity(1)).toBeCloseTo(0.72);
    expect(fillOpacity(-1)).toBeCloseTo(0.12);
    expect(fillOpacity(5)).toBeCloseTo(0.72);
    // Same polygon, same id, whatever the poll.
    expect(summarizeField(rows.slice().reverse(), now).zones.map((z) => z.id)).toEqual(s.zones.map((z) => z.id));
  });

  it("carries no names, shift ids or worker positions over the wire", () => {
    const rows = [row("shift-secret-id", { turf: turfA, s: { checkedInAt: inAt } }), row("other-id", { staging: "Library steps" })];
    const json = JSON.stringify(summarizeField(rows, now));
    expect(json).not.toMatch(/Zed|Worker|secret-id|other-id|displayName|lat"|lng"|position/);
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(["at", "groups", "today", "version", "zones"]);
  });

  it("changes its version when a shift's state changes, or one becomes due, and not with the clock alone", () => {
    const base = [row("a"), row("b", { s: { checkedInAt: inAt } })];
    const v1 = summarizeField(base, now).version;
    expect(summarizeField(base, new Date(now.getTime() + 60_000)).version).toBe(v1);
    // A shift whose start the clock has just passed: the words around the figures change, so the page must refresh.
    const soon = row("c", { startsAt: new Date(now.getTime() + 30_000) });
    expect(summarizeField([...base, soon], new Date(now.getTime() + 60_000)).version).not.toBe(summarizeField([...base, soon], now).version);
    // A closeout changes the badge in the list under the figures.
    const reviewed = row("b", { s: { checkedInAt: inAt, checkedOutAt: outAt, closeout: { workEventId: null, status: "APPROVED", reason: null, createdAt: outAt } } });
    expect(summarizeField([base[0], reviewed], now).version).not.toBe(summarizeField([base[0], row("b", { s: { checkedInAt: inAt, checkedOutAt: outAt } })], now).version);
    expect(summarizeField(base.slice().reverse(), now).version).toBe(v1);
    expect(summarizeField([row("a", { s: { checkedInAt: inAt } }), base[1]], now).version).not.toBe(v1);
    expect(summarizeField([base[0], row("b", { s: { checkedInAt: inAt, signatures: 1 } })], now).version).not.toBe(v1);
    expect(summarizeField([...base, row("c")], now).version).not.toBe(v1);
    expect(shortHash("")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("reads a summary off the wire and refuses anything else", () => {
    const s = summarizeField([row("a")], now);
    expect(readSummary(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(readSummary(null)).toBeNull();
    expect(readSummary({ error: "Sign in required." })).toBeNull();
    expect(readSummary({ ...s, today: { ...s.today, due: "3" } })).toBeNull();
    expect(readSummary({ ...s, zones: undefined })).toBeNull();
    expect(readSummary({ ...s, zones: [{ id: "z", total: 1, onGround: 0 }] })).toBeNull();
    expect(readSummary({ ...s, groups: [{ key: 1, total: 1, checkedIn: 0, packetsOut: 0, packetsHeld: 0, signatures: 0 }] })).toBeNull();
    expect(readSummary({ ...s, zones: [{ id: "z", total: 1, onGround: 0, turf: turfA }] })).not.toBeNull();
  });
});
