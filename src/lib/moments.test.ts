import { describe, expect, it } from "vitest";
import { countAt, easeOut, entryMessage, morphsToPaid, pillState, pillText, ringFill, sendState, shiftFill, type SendState } from "./moments";

describe("field-worker moments (P1.4)", () => {
  it("counts up in whole steps from the old value to the new, never past it", () => {
    expect(countAt(12, 17, 0)).toBe(12);
    expect(countAt(12, 17, 1)).toBe(17);
    for (let t = 0; t <= 1; t += 0.05) {
      const v = countAt(12, 17, t);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(12);
      expect(v).toBeLessThanOrEqual(17);
    }
    // A correction downward counts down, and still lands exactly.
    expect(countAt(17, 12, 0.5)).toBeGreaterThanOrEqual(12);
    expect(countAt(17, 12, 1)).toBe(12);
    expect(countAt(NaN, 5, 0.3)).toBe(5);
    expect(easeOut(2)).toBe(1);
  });

  it("keeps rings between empty and full", () => {
    expect(ringFill(null)).toBe(0);
    expect(ringFill(1.4)).toBe(1);
    expect(ringFill(-1)).toBe(0);
    expect(ringFill(0.42)).toBe(0.42);
    expect(shiftFill(90 * 60_000, 4 * 3_600_000)).toBeCloseTo(0.375);
    expect(shiftFill(1, 0)).toBe(0);
  });

  it("puts the most urgent connection state on the pill", () => {
    const base = { online: true, reachable: true, syncing: false, waiting: 0, refused: 0 };
    expect(pillState(base)).toBe("online");
    expect(pillState({ ...base, waiting: 2 })).toBe("waiting");
    // Entries the phone couldn't store outrank signal: the page is all that holds them.
    expect(pillState({ ...base, waiting: 2, memoryOnly: true })).toBe("unsaved");
    expect(pillState({ ...base, online: false, waiting: 2, memoryOnly: true })).toBe("unsaved");
    expect(pillState({ ...base, waiting: 0, memoryOnly: true })).toBe("online");
    expect(pillState({ ...base, waiting: 2, refused: 1, memoryOnly: true })).toBe("refused");
    expect(pillState({ ...base, waiting: 2, syncing: true })).toBe("syncing");
    expect(pillState({ ...base, waiting: 2, online: false })).toBe("offline");
    expect(pillState({ ...base, reachable: false })).toBe("offline");
    expect(pillState({ ...base, online: false, refused: 1 })).toBe("refused");
  });

  it("morphs a pay line to paid only when this phone saw it on its way", () => {
    expect(morphsToPaid("PROCESSING", "PAID")).toBe(true);
    expect(morphsToPaid("APPROVED", "PAID")).toBe(true);
    expect(morphsToPaid(null, "PAID")).toBe(false); // first look: just paid, no replay
    expect(morphsToPaid("PAID", "PAID")).toBe(false);
    expect(morphsToPaid("HELD", "PAID")).toBe(false);
    expect(morphsToPaid("PROCESSING", "HELD")).toBe(false);
  });
});

describe("field-day sync language (S1): never 'saved' for something only queued", () => {
  const base = { what: "+5 signatures", entry: {}, shownOnPage: false, stored: true, send: "sending" as SendState };
  const SENDS: SendState[] = ["sending", "no-signal", "unreachable", "problem"];

  it("works out whether a waiting entry is on its way", () => {
    const s = { syncing: false, online: true, unreachable: false, problem: false };
    expect(sendState(s)).toBe("sending");
    expect(sendState({ ...s, syncing: true, problem: true })).toBe("sending");
    expect(sendState({ ...s, syncing: true, online: false })).toBe("no-signal");
    expect(sendState({ ...s, online: false, problem: true })).toBe("no-signal");
    expect(sendState({ ...s, problem: true, unreachable: true })).toBe("problem");
    expect(sendState({ ...s, unreachable: true })).toBe("unreachable");
  });
  it("a stored entry is 'saved on this phone', and 'Sending…' only while it's on its way", () => {
    expect(entryMessage(base)).toEqual({ tone: "pending", text: "+5 signatures — saved on this phone. Sending…" });
    expect(entryMessage({ ...base, send: "no-signal" })?.text).toBe("+5 signatures — saved on this phone, not sent yet. It'll send when Turfcut is open with signal.");
    expect(entryMessage({ ...base, send: "unreachable" })?.text).toBe("+5 signatures — saved on this phone, not sent yet. It'll keep trying while Turfcut is open.");
    expect(entryMessage({ ...base, send: "problem" })?.text).toBe("+5 signatures — saved on this phone, not sent yet.");
    for (const send of SENDS.slice(1)) expect(entryMessage({ ...base, send })!.text).not.toContain("Sending");
  });
  it("only on this page is said plainly, without claiming it is saved on the phone or sending", () => {
    for (const send of SENDS) {
      const m = entryMessage({ ...base, stored: false, send })!;
      expect(m.tone).toBe("problem");
      expect(m.text).toBe("+5 signatures — not saved on this phone: storage is full or blocked. Keep this page open until it's sent, or it will be lost.");
    }
  });
  it("'recorded' only once the server has it (or the page already shows it)", () => {
    expect(entryMessage({ ...base, entry: { savedAt: 1 } })).toEqual({ tone: "done", text: "+5 signatures — recorded." });
    expect(entryMessage({ ...base, what: "Check-in at 2:14 PM", entry: { savedAt: 1 }, stored: false })?.text).toBe("Check-in at 2:14 PM — recorded.");
    expect(entryMessage({ ...base, entry: undefined, shownOnPage: true })?.text).toBe("+5 signatures — recorded.");
    expect(entryMessage({ ...base, entry: undefined, shownOnPage: false })).toBeNull();
  });
  it("a refusal says 'not recorded' with the server's reason (never review words like 'accepted')", () => {
    const r = entryMessage({ ...base, entry: { rejected: "This is from more than 24 hours ago. Ask your supervisor to add it." } })!;
    expect(r.tone).toBe("problem");
    expect(r.text).toBe("+5 signatures — not recorded: This is from more than 24 hours ago. Ask your supervisor to add it.");
  });
  it("never says 'Saved.', 'recorded' for an unsent entry, or that the clock is running", () => {
    for (const stored of [true, false]) for (const send of SENDS) {
      const m = entryMessage({ ...base, stored, send })!;
      expect(m.text).not.toMatch(/^Saved\.?$|clock is running|accepted|— recorded/i);
    }
  });
  it("the pill stays short and says unsent, only on this page, sending and not recorded; never 'All saved'", () => {
    const o = { waiting: 3, refused: 0, send: "sending" as SendState };
    const cases: Array<[Parameters<typeof pillText>[0], Parameters<typeof pillText>[1], string]> = [
      ["waiting", o, "3 saved on this phone, not sent yet"],
      ["syncing", o, "Sending…"],
      ["offline", { ...o, send: "no-signal" }, "No signal — 3 saved on this phone"],
      ["offline", { ...o, send: "unreachable" }, "Can't connect — 3 saved on this phone"],
      ["offline", { ...o, send: "problem" }, "Not sent — 3 saved on this phone"],
      ["offline", { ...o, waiting: 0, send: "no-signal" }, "No signal — you can keep working"],
      ["unsaved", o, "3 only on this page — keep it open"],
      ["unsaved", { ...o, send: "no-signal" }, "No signal — 3 only on this page. Keep it open."],
      ["unsaved", { ...o, send: "problem" }, "Not sent — 3 only on this page. Keep it open."],
      ["refused", { ...o, refused: 1 }, "1 not recorded"],
      ["online", { ...o, waiting: 0 }, "Nothing waiting to send"],
    ];
    for (const [state, opts, text] of cases) {
      expect(pillText(state, opts)).toBe(text);
      // Two lines at most in a 320px card (~35 characters a line), with two-digit counts.
      expect(pillText(state, { ...opts, waiting: 99, refused: 99 }).length).toBeLessThanOrEqual(47);
      expect(pillText(state, opts)).not.toMatch(/all saved|accepted/i);
    }
  });
});
