import { describe, expect, it } from "vitest";
import { legacyJobActivity } from "./legacy-job-compliance";
import type { JobType } from "@prisma/client";

describe("current job type to compliance activity compatibility", () => {
  it("maps petition work without changing how signatures are paid", () => {
    expect(legacyJobActivity("PETITION")).toEqual({
      activity: "petition_circulation", method: "in_person", isLegacySupported: true,
    });
  });
  it("maps all legacy canvassing to its actual field activity, not inferred politics", () => {
    expect(legacyJobActivity("CANVASS")).toEqual({
      activity: "door_canvassing", method: "in_person", isLegacySupported: true,
    });
  });
  it("does not silently classify new/unknown work under an old payment unit", () => {
    expect(legacyJobActivity("PHONE_POLLING" as JobType)).toBeNull();
    expect(legacyJobActivity("" as JobType)).toBeNull();
  });
});
