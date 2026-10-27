import { describe, expect, it } from "vitest";
import { applyMarks, isMark, swipeOutcome } from "./job-marks";

describe("job marks (P1.6)", () => {
  it("reads a swipe: far right saves, far left hides, short springs back, a flick counts", () => {
    expect(swipeOutcome(140, 0, 360)).toBe("save");
    expect(swipeOutcome(-140, 0, 360)).toBe("hide");
    expect(swipeOutcome(60, 0, 360)).toBeNull();
    expect(swipeOutcome(60, 0.9, 360)).toBe("save"); // a quick flick, short travel
    expect(swipeOutcome(60, -0.9, 360)).toBeNull(); // flicked the other way: not a commit
    expect(swipeOutcome(5, 2, 360)).toBeNull(); // too short to be anything
    expect(swipeOutcome(NaN, 0, 360)).toBeNull();
    expect(swipeOutcome(100, 0, 0)).toBeNull();
  });

  it("keeps the feed's order and only removes what the worker hid", () => {
    const jobs = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const marks = { saved: new Set(["c", "a"]), hidden: new Set(["b"]) };
    expect(applyMarks(jobs, marks)).toEqual({ shown: [{ id: "a" }, { id: "c" }, { id: "d" }], hiddenCount: 1 });
    expect(applyMarks(jobs, marks, { savedOnly: true }).shown.map((j) => j.id)).toEqual(["a", "c"]); // feed order, not save order
    expect(applyMarks(jobs, marks, { showHidden: true }).shown.map((j) => j.id)).toEqual(["b"]);
    expect(applyMarks(jobs, { saved: new Set(), hidden: new Set() })).toEqual({ shown: jobs, hiddenCount: 0 });
  });

  it("accepts only the four marks", () => {
    for (const m of ["save", "unsave", "hide", "unhide"]) expect(isMark(m)).toBe(true);
    for (const m of ["rank", "", null, 1]) expect(isMark(m)).toBe(false);
  });
});
