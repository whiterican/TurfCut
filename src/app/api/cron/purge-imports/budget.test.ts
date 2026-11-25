import { describe, expect, it } from "vitest";
import { maxDuration } from "./route";
import { PURGE_BUDGET_MS, PURGE_TX_TIMEOUT_MS, PURGE_TX_WAIT_MS } from "@/lib/walkbooks-data";

describe("the daily purge's time", () => {
  it("finishes, its last purge included, inside the function's time limit", () => {
    // The budget is checked before each purge; one started just before it runs out can wait for its connection and
    // then run to its timeout. Past maxDuration the function is cut off and the run reports nothing.
    expect(PURGE_BUDGET_MS + PURGE_TX_WAIT_MS + PURGE_TX_TIMEOUT_MS).toBeLessThan(maxDuration * 1000);
  });
});
