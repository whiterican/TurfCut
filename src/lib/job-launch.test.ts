import { describe, expect, it } from "vitest";
import { DEFAULT_LAUNCH, hasLaunchFields, launchBlocker, launchToForm, pointAt, radiusFor, readLaunch, validateLaunch } from "./job-launch";

const point = (i: number, over: Record<string, string> = {}) => ({
  [`point_${i}_name`]: "Library steps",
  [`point_${i}_address`]: "10 W 14th Ave",
  [`point_${i}_lat`]: "39.737",
  [`point_${i}_lng`]: "-104.989",
  [`point_${i}_radius`]: "300",
  ...over,
});

describe("job launch", () => {
  it("reads what's stored and never invents a point", () => {
    expect(readLaunch(null)).toEqual(DEFAULT_LAUNCH);
    expect(readLaunch({ mode: "SELF", points: [{ id: "a", name: "x", lat: 1, lng: 2 }] })).toEqual({ mode: "SELF", points: [] });
    const r = readLaunch({ mode: "STAGED", points: [{ id: "a", name: "Steps", lat: 39.7, lng: -104.9, radiusM: 5000 }, { id: 1, name: "bad" }, { id: "b", name: "No coords" }] });
    expect(r.points).toEqual([{ id: "a", name: "Steps", address: null, lat: 39.7, lng: -104.9, radiusM: 2000 }]);
    expect(readLaunch({ mode: "weird" }).mode).toBe("STAGED");
  });

  it("validates the builder's fields: blank rows skipped, bad rows named, self-launch keeps no points", () => {
    const ok = validateLaunch({ launchMode: "STAGED", ...point(0), ...point(1, { point_1_name: "", point_1_address: "", point_1_lat: "", point_1_lng: "" }) });
    expect(ok.ok && ok.value.points).toEqual([{ id: expect.any(String), name: "Library steps", address: "10 W 14th Ave", lat: 39.737, lng: -104.989, radiusM: 300 }]);
    const bad = validateLaunch({ launchMode: "STAGED", ...point(0, { point_0_name: "", point_0_lat: "95", point_0_radius: "10" }) });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["point_0_lat", "point_0_name", "point_0_radius"]);
    expect(validateLaunch({ launchMode: "nope" })).toMatchObject({ ok: false, errors: { launchMode: expect.any(String) } });
    const self = validateLaunch({ launchMode: "SELF", ...point(0) });
    expect(self.ok && self.value).toEqual({ mode: "SELF", points: [] });
    // No launch fields at all (API callers from before C4): staged, no points.
    expect(validateLaunch({})).toEqual({ ok: true, value: DEFAULT_LAUNCH });
    expect(hasLaunchFields({ title: "x" })).toBe(false);
    expect(hasLaunchFields({ launchMode: "SELF" })).toBe(true);
    expect(hasLaunchFields({ point_0_name: "x" })).toBe(true);
    const many = validateLaunch({ launchMode: "STAGED", ...Object.assign({}, ...Array.from({ length: 11 }, (_, i) => point(i, { [`point_${i}_lat`]: String(39 + i / 100) }))) });
    expect(many.ok).toBe(false);
  });

  it("round-trips through the form defaults, keeping ids", () => {
    const v = validateLaunch({ launchMode: "STAGED", ...point(0, { point_0_id: "11111111-1111-4111-8111-111111111111" }) });
    if (!v.ok) throw new Error("bad");
    const back = validateLaunch(launchToForm(v.value));
    expect(back.ok && back.value).toEqual(v.value);
    expect(v.value.points[0].id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("finds a shift's point by place and gives its radius, else the default", () => {
    const launch = readLaunch({ mode: "STAGED", points: [{ id: "a", name: "Steps", lat: 39.737, lng: -104.989, radiusM: 400 }] });
    expect(pointAt(launch, { lat: 39.737001, lng: -104.989 })?.id).toBe("a");
    expect(radiusFor(launch, { lat: 39.737, lng: -104.989 })).toBe(400);
    expect(radiusFor(launch, { lat: 39.8, lng: -104.989 })).toBe(250);
    expect(radiusFor(launch, { lat: null, lng: null })).toBe(250);
  });

  it("blocks publishing a staged job with no point", () => {
    expect(launchBlocker(DEFAULT_LAUNCH)).toMatch(/staging point/);
    expect(launchBlocker({ mode: "SELF", points: [] })).toBeNull();
    expect(launchBlocker({ mode: "STAGED", points: [{ id: "a", name: "x", address: null, lat: 1, lng: 2, radiusM: 250 }] })).toBeNull();
  });
});
