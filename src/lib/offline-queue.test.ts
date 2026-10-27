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

/**
 * What the shift page's words rest on (S1): an entry reads "recorded" only
 * when the server answered for it, "not recorded" only when it refused it,
 * and anything else leaves it waiting, unsent.
 */
describe("offline queue: flush results behind 'recorded' and 'not recorded'", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  const answer = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
  const one = async () => {
    const q = await import("./offline-queue");
    const { item } = q.enqueue("u1", "s1", { kind: "check_in" } as never);
    return { q, id: item.clientId, entry: () => q.pendingFor("u1", "s1").find((p) => p.clientId === item.clientId) };
  };
  const results = (id: string, status: string, reason?: string) => ({ results: [{ clientId: id, status, reason }], serverNow: Date.now() });

  it("marks saved and duplicate answers as recorded", async () => {
    for (const status of ["saved", "duplicate"]) {
      const { q, id, entry } = await one();
      answer(200, results(id, status));
      const r = await q.flush("u1", "s1");
      expect(r.saved).toBe(1);
      expect(entry()?.savedAt).toBeTypeOf("number");
      expect(entry()?.rejected).toBeUndefined();
      store.clear();
      vi.resetModules();
    }
  });
  it("keeps the server's reason for a refusal, and never marks it recorded", async () => {
    const { q, id, entry } = await one();
    answer(200, results(id, "rejected", "This is from more than 24 hours ago. Ask your supervisor to add it."));
    await q.flush("u1", "s1");
    expect(entry()).toMatchObject({ rejected: "This is from more than 24 hours ago. Ask your supervisor to add it." });
    expect(entry()?.savedAt).toBeUndefined();
  });
  it("leaves entries unsent, neither recorded nor refused, on no answer, server trouble, rate limits or sign-out", async () => {
    const cases: Array<[() => void, Partial<{ offline: boolean; problem: string }>]> = [
      [() => vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch")))), { offline: true }],
      [() => answer(500, { error: "boom" }), { offline: true }],
      [() => answer(429, { error: "Syncing too often." }), { offline: true }],
      [() => answer(401, { error: "Sign in." }), { problem: "Sign in again to send your entries." }],
      [() => answer(404, { error: "Shift not found." }), { problem: "Couldn't find this shift. It'll try again." }],
    ];
    for (const [setUp, expected] of cases) {
      const { q, entry } = await one();
      setUp();
      expect(await q.flush("u1", "s1")).toMatchObject(expected);
      expect(entry()?.savedAt).toBeUndefined();
      expect(entry()?.rejected).toBeUndefined();
      store.clear();
      vi.resetModules();
    }
  });
  it("refuses a batch the server couldn't read in plain words, not the server's developer text", async () => {
    const { q, entry } = await one();
    answer(400, { error: "Send { deviceNow, actions }." });
    await q.flush("u1", "s1");
    expect(entry()?.rejected).toBe("Something went wrong sending this. Tell your supervisor.");
  });
  it("reading the queue doesn't write to it", async () => {
    const { q } = await one();
    vi.stubGlobal("window", new EventTarget());
    const listener = vi.fn();
    q.subscribe(listener);
    const setItem = vi.spyOn(localStorage, "setItem");
    q.pendingFor("u1", "s1");
    q.memoryOnlyFor("u1");
    expect(setItem).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});
