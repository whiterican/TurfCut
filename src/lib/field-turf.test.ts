import { describe, expect, it } from "vitest";
import { turfCards, readJobFilter } from "@/lib/field-turf";
import { summarizeField } from "@/lib/field-live";
import type { ShiftState } from "@/lib/field-day";
import type { FieldRow } from "@/lib/field-view";

const now = new Date("2026-10-28T19:40:00Z");
const poly = (x: number) => ({ type: "Polygon" as const, coordinates: [[[x, 39.7], [x + 0.01, 39.7], [x + 0.01, 39.71], [x, 39.71], [x, 39.7]]] as [number, number][][] });
const base = (): ShiftState => ({ cancelled: false, checkedInAt: null, checkedOutAt: null, paused: false, packetsOut: [], packetsReturned: [], packetsHeld: [], signatures: 0, doors: 0, contacts: 0, batchCounted: false, appCounts: null, closeout: null, atStaging: null });
const row = (p: Partial<Omit<FieldRow, "state">> & { state?: Partial<ShiftState> }): FieldRow => ({
  shiftId: p.shiftId ?? "s1",
  jobId: p.jobId ?? "j1",
  jobTitle: p.jobTitle ?? "Denver drive",
  staging: p.staging ?? null,
  worker: "W",
  startsAt: p.startsAt ?? new Date("2026-10-28T18:00:00Z"),
  endsAt: p.endsAt ?? new Date("2026-10-28T23:00:00Z"),
  turf: p.turf ?? null,
  state: { ...base(), ...p.state },
});

describe("turfCards", () => {
  it("makes one card per distinct turf, keyed like the live summary's zones", () => {
    const rows = [
      row({ shiftId: "a", staging: "Civic Center", turf: poly(-104.98), state: { checkedInAt: now } }),
      row({ shiftId: "b", staging: "Civic Center", turf: poly(-104.98) }),
      row({ shiftId: "c", staging: "Five Points", turf: poly(-104.96), startsAt: new Date("2026-10-29T15:00:00Z"), state: { signatures: 4 } }),
      row({ shiftId: "d", turf: null }),
    ];
    const cards = turfCards(rows);
    expect(cards.map((c) => [c.name, c.total, c.onGround, c.signatures])).toEqual([
      ["Civic Center", 2, 1, 0],
      ["Five Points", 1, 0, 4],
    ]);
    const zones = summarizeField(rows, now).zones.map((z) => z.id).sort();
    expect(cards.map((c) => c.id).sort()).toEqual(zones);
  });

  it("numbers turfs without a staging point among themselves and leaves cancelled shifts out", () => {
    const rows = [
      row({ shiftId: "n", staging: "Named", turf: poly(-104.95), startsAt: new Date("2026-10-28T17:00:00Z") }),
      row({ shiftId: "a", turf: poly(-104.9) }),
      row({ shiftId: "b", turf: poly(-104.9), state: { cancelled: true, checkedInAt: now } }),
      row({ shiftId: "c", turf: poly(-104.8), startsAt: new Date("2026-10-28T19:00:00Z") }),
    ];
    const cards = turfCards(rows);
    expect(cards.map((c) => c.name)).toEqual(["Named", "Turf 1", "Turf 2"]);
    expect(cards[1].total).toBe(1);
    expect(cards[1].onGround).toBe(0);
  });

  it("lets the earliest shift name the card and counts the jobs the turf is drawn on", () => {
    const rows = [
      row({ shiftId: "late", jobId: "j2", jobTitle: "Aurora", staging: "Library", turf: poly(-104.9), startsAt: new Date("2026-10-28T20:00:00Z") }),
      row({ shiftId: "early", jobId: "j1", jobTitle: "Denver drive", staging: "Civic Center", turf: poly(-104.9), startsAt: new Date("2026-10-28T17:00:00Z") }),
    ];
    const [c] = turfCards(rows);
    expect(c.name).toBe("Civic Center");
    expect(c.jobTitle).toBe("Denver drive");
    expect(c.jobs).toBe(2);
  });
});

describe("readJobFilter", () => {
  it("accepts an id and ignores anything else", () => {
    expect(readJobFilter("00000000-0000-0000-0000-000000000061")).toBe("00000000-0000-0000-0000-000000000061");
    expect(readJobFilter(["00000000-0000-0000-0000-000000000061", "x"])).toBe("00000000-0000-0000-0000-000000000061");
    expect(readJobFilter("all")).toBeNull();
    expect(readJobFilter(undefined)).toBeNull();
    expect(readJobFilter("1; drop table")).toBeNull();
  });
});
