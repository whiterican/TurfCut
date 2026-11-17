import { describe, expect, it } from "vitest";
import { answerWords, fieldsFor, latestByStop, OUTCOME_KINDS, OUTCOMES, outcomeLook, progressOf, settledPercent, UNVISITED, validateOutcome } from "@/lib/stop-outcomes";

describe("the color code", () => {
  it("has a word, a hint, a glyph and a colour for every outcome, and no two share a colour", () => {
    expect(OUTCOMES.map((o) => o.kind)).toEqual([...OUTCOME_KINDS]);
    for (const o of OUTCOMES) expect(o.label && o.hint && o.glyph && /^#[0-9a-f]{6}$/.test(o.color)).toBeTruthy();
    expect(new Set(OUTCOMES.map((o) => o.color)).size).toBe(OUTCOMES.length);
    expect(new Set(OUTCOMES.map((o) => o.glyph)).size).toBe(OUTCOMES.length);
    expect(outcomeLook("DO_NOT_KNOCK").label).toBe("Don't knock");
  });
});

describe("fields by work type", () => {
  it("canvassing records contact and literature on a Done, and literature on a Not home (a lit drop)", () => {
    expect(fieldsFor("CANVASS", "DONE").map((f) => f.key)).toEqual(["talked_to", "left_literature"]);
    expect(fieldsFor("CANVASS", "NOT_HOME").map((f) => f.key)).toEqual(["left_literature"]);
    expect(fieldsFor("CANVASS", "REFUSED")).toEqual([]);
  });
  it("petition circulation records signatures on a Done only", () => {
    expect(fieldsFor("PETITION", "DONE").map((f) => f.key)).toEqual(["signatures"]);
    expect(fieldsFor("PETITION", "NOT_HOME")).toEqual([]);
  });
});

describe("validateOutcome", () => {
  it("needs a known outcome", () => {
    for (const outcome of [undefined, "", "SUPPORTER", "done"]) expect(validateOutcome("CANVASS", { outcome }).ok).toBe(false);
  });
  it("reads yes/no fields, and unticked means no", () => {
    const v = validateOutcome("CANVASS", { outcome: "DONE", talked_to: "on" });
    expect(v.ok && v.value.answers).toEqual([
      { key: "talked_to", intValue: null, boolValue: true },
      { key: "left_literature", intValue: null, boolValue: false },
    ]);
  });
  it("ignores a field the work type doesn't record at that outcome, so it is never stored", () => {
    const v = validateOutcome("CANVASS", { outcome: "REFUSED", talked_to: "on", signatures: "5", note: "said he supports X" });
    expect(v.ok && v.value.answers).toEqual([]);
    const p = validateOutcome("PETITION", { outcome: "DONE", talked_to: "on", left_literature: "on", signatures: "3" });
    expect(p.ok && p.value.answers).toEqual([{ key: "signatures", intValue: 3, boolValue: null }]);
  });
  it("checks the signature count", () => {
    expect(validateOutcome("PETITION", { outcome: "DONE", signatures: "" }).ok).toBe(true);
    for (const signatures of ["51", "-1", "2.5", "abc", "1000"]) {
      const v = validateOutcome("PETITION", { outcome: "DONE", signatures });
      expect(!v.ok && v.errors.signatures).toBeTruthy();
    }
  });
});

describe("state and progress", () => {
  const t = (n: number) => new Date(Date.UTC(2026, 10, 17, 8, n));
  const row = (stopId: string, createdAt: Date, outcome: "DONE" | "COME_BACK" | "NOT_HOME" | "DO_NOT_KNOCK", answers: Array<{ key: string; intValue: number | null; boolValue: boolean | null }> = []) => ({ stopId, createdAt, outcome, answers });
  it("the newest row of a stop is its state, whatever order rows arrive in", () => {
    const m = latestByStop([row("a", t(5), "DONE", [{ key: "signatures", intValue: 2, boolValue: null }]), row("a", t(1), "COME_BACK"), row("b", t(2), "NOT_HOME")]);
    expect(m.get("a")).toEqual({ outcome: "DONE", answers: { signatures: 2 } });
    expect(m.get("b")?.outcome).toBe("NOT_HOME");
    expect(m.get("c")).toBeUndefined();
  });
  it("a correction supersedes: Done then Come back is open again", () => {
    const m = latestByStop([row("a", t(1), "DONE"), row("a", t(2), "COME_BACK")]);
    expect(progressOf([m.get("a")!]).remaining).toBe(1);
  });
  it("counts what is left: unvisited and Come back remain; the rest are settled", () => {
    const states = [UNVISITED, { outcome: "COME_BACK" as const, answers: {} }, { outcome: "DONE" as const, answers: { signatures: 3 } }, { outcome: "DONE" as const, answers: { signatures: 2 } }, { outcome: "DO_NOT_KNOCK" as const, answers: {} }];
    const p = progressOf(states);
    expect(p).toMatchObject({ total: 5, unvisited: 1, remaining: 2, settled: 3, signatures: 5 });
    expect(p.byKind.DONE).toBe(2);
    expect(settledPercent(p)).toBe(60);
    expect(settledPercent(progressOf([]))).toBe(0);
  });
});

describe("answerWords", () => {
  it("says what was recorded, and nothing for a no or a zero", () => {
    expect(answerWords({ outcome: "DONE", answers: { talked_to: true, left_literature: true } })).toEqual(["Talked with someone", "Left literature"]);
    expect(answerWords({ outcome: "DONE", answers: { talked_to: false, left_literature: false } })).toEqual([]);
    expect(answerWords({ outcome: "DONE", answers: { signatures: 1 } })).toEqual(["1 signature"]);
    expect(answerWords({ outcome: "DONE", answers: { signatures: 0 } })).toEqual([]);
    expect(answerWords(UNVISITED)).toEqual([]);
  });
});
