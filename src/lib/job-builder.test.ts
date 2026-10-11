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
    // An empty submission raises every required-field error at once.
    const r = validateJob({});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    for (const key of Object.keys(r.errors)) expect({ key, step: stepOfField(key) }).toEqual({ key, step: expect.any(Number) });
    expect(Object.keys(r.errors).every((k) => stepOfField(k) !== REVIEW_STEP)).toBe(true);
  });

  it("points an error back to its step, issue positions included", () => {
    expect(stepOfField("title")).toBe(0);
    expect(stepOfField("endsAt")).toBe(1);
    expect(stepOfField("hiringModes")).toBe(2);
    expect(stepOfField("contactEmergency")).toBe(3);
    expect(stepOfField("issues")).toBe(4);
    expect(stepOfField("issue_housing")).toBe(4);
    expect(stepOfField("something-new")).toBe(REVIEW_STEP);
    expect(firstStepWithErrors({ message: "x", payRate: "y" })).toBe(2);
    expect(firstStepWithErrors({})).toBeNull();
    expect(errorsForStep({ message: "x", payRate: "y", title: "z" }, 2)).toEqual({ payRate: "y" });
  });
});
