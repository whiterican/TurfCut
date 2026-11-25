import { describe, expect, it } from "vitest";
import { idForTap, tapContents } from "./client-id";

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};

describe("a tap's id", () => {
  it("is kept for a retry of exactly the same tap, so it counts once", () => {
    const kept = idForTap(null, tapContents(form({ stopId: "s", outcome: "DONE", clientId: "x" })));
    expect(idForTap(kept, tapContents(form({ outcome: "DONE", stopId: "s", clientId: "y" }))).id).toBe(kept.id);
  });
  it("is new once the worker changed anything after a save that may have landed, so the change isn't dropped", () => {
    const kept = idForTap(null, tapContents(form({ stopId: "s", outcome: "DONE" })));
    expect(idForTap(kept, tapContents(form({ stopId: "s", outcome: "NOT_HOME" }))).id).not.toBe(kept.id);
    expect(idForTap(kept, tapContents(form({ stopId: "s", outcome: "DONE", signatures: "3" }))).id).not.toBe(kept.id);
  });
});
