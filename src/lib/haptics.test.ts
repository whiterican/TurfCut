import { afterEach, describe, expect, it, vi } from "vitest";
import { HAPTICS_KEY, canVibrate, haptic, hapticsEnabled } from "@/lib/haptics";

function stubBrowser(opts: { saved?: string | null; vibrate?: boolean }) {
  const store = new Map<string, string>(opts.saved ? [[HAPTICS_KEY, opts.saved]] : []);
  const vibrate = vi.fn();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null });
  vi.stubGlobal("navigator", { userAgent: "Android", maxTouchPoints: 5, ...(opts.vibrate ? { vibrate } : {}) });
  return vibrate;
}
afterEach(() => vi.unstubAllGlobals());

describe("haptics", () => {
  it("ticks with a short vibration where the browser supports it", () => {
    const vibrate = stubBrowser({ vibrate: true });
    haptic();
    expect(vibrate).toHaveBeenCalledWith(8);
  });
  it("is on by default and respects the off setting", () => {
    stubBrowser({});
    expect(hapticsEnabled()).toBe(true);
    const vibrate = stubBrowser({ saved: "off", vibrate: true });
    expect(hapticsEnabled()).toBe(false);
    haptic();
    expect(vibrate).not.toHaveBeenCalled();
  });
  it("does nothing on iPhone (no Vibration API) and adds nothing to the page", () => {
    stubBrowser({});
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)", maxTouchPoints: 5 });
    const appendChild = vi.fn();
    vi.stubGlobal("document", { body: { appendChild }, head: { appendChild }, createElement: vi.fn() });
    expect(canVibrate()).toBe(false);
    haptic();
    expect(appendChild).not.toHaveBeenCalled();
  });
  it("knows when the browser can vibrate", () => {
    stubBrowser({ vibrate: true });
    expect(canVibrate()).toBe(true);
  });
  it("does nothing on desktop browsers without vibration", () => {
    stubBrowser({});
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)", maxTouchPoints: 0 });
    expect(() => haptic()).not.toThrow();
  });
});
