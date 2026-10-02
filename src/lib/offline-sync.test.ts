import { describe, expect, it } from "vitest";
import { correctTime, placeTime, readQueued, stagingCheck, timeProblem, wasOffline } from "@/lib/offline-sync";

const id = "3f2b8c1e-9a4d-4e2f-8b6a-1c2d3e4f5a6b";
const at = Date.UTC(2026, 9, 2, 15, 0);

describe("readQueued", () => {
  it("accepts the field actions and nothing else", () => {
    expect(readQueued({ clientId: id, at, action: { kind: "log", unit: "signatures", count: 5 } })).toEqual({ clientId: id, at, action: { kind: "log", unit: "signatures", count: 5 } });
    expect(readQueued({ clientId: id, at, action: { kind: "pause" } })?.action).toEqual({ kind: "pause" });
    expect(readQueued({ clientId: id, at, action: { kind: "cancel", reason: "x" } })).toBeNull();
    expect(readQueued({ clientId: "nope", at, action: { kind: "pause" } })).toBeNull();
    expect(readQueued({ clientId: id, at: "soon", action: { kind: "pause" } })).toBeNull();
    expect(readQueued({ clientId: id, at, action: { kind: "log", unit: "votes", count: 1 } })).toBeNull();
  });
  it("check-in carries only yes/no and a band — never a position", () => {
    expect(readQueued({ clientId: id, at, action: { kind: "check_in", location: { checked: true, atStaging: true, distance: "under 250 m" } } })?.action).toEqual({
      kind: "check_in",
      location: { checked: true, atStaging: true, distance: "under 250 m" },
    });
    expect(readQueued({ clientId: id, at, action: { kind: "check_in", location: { checked: false } } })?.action).toEqual({ kind: "check_in", location: { checked: false } });
    // a band that contradicts the yes/no, or a raw position, is refused
    expect(readQueued({ clientId: id, at, action: { kind: "check_in", location: { checked: true, atStaging: true, distance: "over 1 km" } } })).toBeNull();
    expect(readQueued({ clientId: id, at, action: { kind: "check_in", location: { lat: 39.7, lng: -104.9 } } })).toBeNull();
  });
});

describe("time correction", () => {
  it("shifts phone times by the clock difference and keeps their order", () => {
    const server = new Date(Date.UTC(2026, 9, 2, 16, 0));
    // phone clock is 10 minutes slow
    const phoneNow = server.getTime() - 10 * 60_000;
    expect(correctTime(phoneNow - 60 * 60_000, phoneNow, server).toISOString()).toBe("2026-10-02T15:00:00.000Z");
    const a = correctTime(phoneNow - 30 * 60_000, phoneNow, server);
    // a clock that jumped back can't reorder: 1 ms after the last saved
    const b = placeTime(correctTime(phoneNow - 31 * 60_000, phoneNow, server), a, server);
    expect(b.getTime()).toBe(a.getTime() + 1);
    // and nothing is placed after now
    expect(placeTime(new Date(server.getTime() + 60_000), null, server).getTime()).toBe(server.getTime());
  });
  it("refuses the future and anything over 24 hours old; flags offline", () => {
    const now = new Date(Date.UTC(2026, 9, 2, 16, 0));
    expect(timeProblem(new Date(now.getTime() + 60_000), now)).toBeNull();
    expect(timeProblem(new Date(now.getTime() + 5 * 60_000), now)).toMatch(/future/);
    expect(timeProblem(new Date(now.getTime() - 23 * 3_600_000), now)).toBeNull();
    expect(timeProblem(new Date(now.getTime() - 25 * 3_600_000), now)).toMatch(/24 hours/);
    expect(wasOffline(new Date(now.getTime() - 60_000), now)).toBe(false);
    expect(wasOffline(new Date(now.getTime() - 10 * 60_000), now)).toBe(true);
  });
});

describe("stagingCheck (on the phone)", () => {
  const staging = { lat: 39.7392, lng: -104.9903 };
  it("returns only yes/no and a band", () => {
    expect(stagingCheck(staging, { lat: 39.7393, lng: -104.9904 })).toEqual({ checked: true, atStaging: true, distance: "under 250 m" });
    expect(stagingCheck(staging, { lat: 39.75, lng: -104.99 })).toEqual({ checked: true, atStaging: false, distance: "over 1 km" });
    expect(stagingCheck(null, { lat: 39.75, lng: -104.99 })).toEqual({ checked: false });
    expect(stagingCheck(staging, null)).toEqual({ checked: false });
  });
});
