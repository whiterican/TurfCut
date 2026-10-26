import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The queue's honesty about where an entry lives (P0): once the phone
 * refuses to store it, the page is the only copy and says so until a later
 * write succeeds or the user's queue is cleared.
 */
describe("offline queue: memory-only entries", () => {
  const store = new Map<string, string>();
  let full = false;
  beforeEach(() => {
    store.clear();
    full = false;
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (full) throw new Error("QuotaExceededError");
        store.set(k, v);
      },
      removeItem: (k: string) => void store.delete(k),
    });
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reports memory-only while storage refuses, and stops once a write lands or the queue is cleared", async () => {
    const q = await import("./offline-queue");
    const a = q.enqueue("u1", "s1", { kind: "check_in" } as never);
    expect(a.stored).toBe(true);
    expect(q.memoryOnlyFor("u1")).toBe(false);
    full = true;
    const b = q.enqueue("u1", "s1", { kind: "check_out" } as never);
    expect(b.stored).toBe(false);
    expect(q.memoryOnlyFor("u1")).toBe(true);
    expect(q.memoryOnlyFor("u2")).toBe(false);
    // The page's copy is what is read back, both entries included.
    expect(q.pendingFor("u1", "s1")).toHaveLength(2);
    expect(q.unsentCount("u1")).toBe(2);
    full = false;
    q.enqueue("u1", "s1", { kind: "pause_start" } as never);
    expect(q.memoryOnlyFor("u1")).toBe(false);
    full = true;
    q.enqueue("u1", "s1", { kind: "pause_end" } as never);
    expect(q.memoryOnlyFor("u1")).toBe(true);
    q.clearUser("u1");
    expect(q.memoryOnlyFor("u1")).toBe(false);
    expect(q.unsentCount("u1")).toBe(0);
  });
});
