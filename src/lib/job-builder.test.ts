import { describe, expect, it } from "vitest";
import { BUILDER_STEPS, errorsForStep, firstStepWithErrors, REVIEW_STEP, stepOfField } from "./job-builder";
import { validateJob } from "./jobs";

describe("job builder steps", () => {
  it("has six steps, the last of which is the review, and no field in two steps", () => {
    expect(BUILDER_STEPS).toHaveLength(6);
    expect(BUILDER_STEPS[REVIEW_STEP].id).toBe("review");
    const all = BUILDER_STEPS.flatMap((s) => s.fields);
    expect(new Set(all).size).toBe(all.length);
  });

  it("covers every error the validator can raise", () => {
    // An empty submission raises every required-field error at once…
    const empty = validateJob({});
    expect(empty.ok).toBe(false);
    // …and an over-long or malformed one raises the rest.
    const long = "x".repeat(5000);
    const bad = validateJob({
      type: "PETITION", title: long, description: long, jurisdictionId: "nope", startsAt: "2026-12-01", endsAt: "2026-11-01", city: long, state: "Colorado",
      compensationMethod: "HOURLY", payRate: "-1", headcount: "0", hiringModes: ["telepathy"], training: long, script: long, campaignType: "x", affiliation: "x",
      campaignName: long, issue_housing: "maybe", message: long, contactEmergency: long, contactDisputes: long, contactLostMaterials: long,
      measureIds: Array.from({ length: 30 }, (_, i) => `M${i}`).join(","), cancellationNoticeHours: "999", launchMode: "weird", point_0_name: "", point_0_lat: "95", point_0_lng: "0", point_0_radius: "1",
    });
    expect(bad.ok).toBe(false);
    if (empty.ok || bad.ok) return;
    const keys = [...new Set([...Object.keys(empty.errors), ...Object.keys(bad.errors)])];
    expect(keys.length).toBeGreaterThan(25);
    for (const key of keys) expect({ key, step: stepOfField(key) }).toEqual({ key, step: expect.any(Number) });
    // Every one lands on a step with fields, never on the review; an unknown key lands on the first step.
    expect(keys.every((k) => stepOfField(k) < REVIEW_STEP)).toBe(true);
    expect(keys.every((k) => BUILDER_STEPS[stepOfField(k)].fields.length > 0)).toBe(true);
    expect(firstStepWithErrors({ "something-new": "x", message: "y" })).toBe(0);
  });

  it("points an error back to its step, issue positions included", () => {
    expect(stepOfField("title")).toBe(0);
    expect(stepOfField("endsAt")).toBe(1);
    expect(stepOfField("hiringModes")).toBe(2);
    expect(stepOfField("contactEmergency")).toBe(3);
    expect(stepOfField("issues")).toBe(4);
    expect(stepOfField("issue_housing")).toBe(4);
    expect(stepOfField("launchMode")).toBe(1);
    expect(stepOfField("point_2_lat")).toBe(1);
    expect(stepOfField("something-new")).toBe(0);
    expect(firstStepWithErrors({ message: "x", payRate: "y" })).toBe(2);
    expect(firstStepWithErrors({})).toBeNull();
    expect(errorsForStep({ message: "x", payRate: "y", title: "z" }, 2)).toEqual({ payRate: "y" });
  });
});
