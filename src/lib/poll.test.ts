import { describe, expect, it } from "vitest";
import { answerWord, newestAnswers, readAnswers, tally, validateQuestion, type PollQuestionView } from "@/lib/poll";

const Q1: PollQuestionView = { id: "11111111-1111-4111-8111-111111111111", position: 1, prompt: "Measure 3?", choices: [{ id: "a1111111-1111-4111-8111-111111111111", label: "Support" }, { id: "a2222222-2222-4222-8222-222222222222", label: "Oppose" }, { id: "a3333333-3333-4333-8333-333333333333", label: "Undecided" }] };
const Q2: PollQuestionView = { id: "22222222-2222-4222-8222-222222222222", position: 2, prompt: "Top issue?", choices: [{ id: "b1111111-1111-4111-8111-111111111111", label: "Housing" }, { id: "b2222222-2222-4222-8222-222222222222", label: "Transit" }] };

describe("validateQuestion", () => {
  it("reads a prompt and choices one to a line, trimming and dropping blanks", () => {
    const v = validateQuestion({ prompt: "  Do you   support Measure 3? ", choices: " Support \r\n\r\nOppose\nUndecided  " });
    expect(v).toEqual({ ok: true, value: { prompt: "Do you support Measure 3?", choices: ["Support", "Oppose", "Undecided"] } });
  });
  it("needs a prompt of at most 200 characters and 2 to 8 choices", () => {
    const bad = (o: Record<string, unknown>) => { const v = validateQuestion(o); return v.ok ? null : v.errors; };
    expect(bad({ prompt: "", choices: "a\nb" })?.prompt).toBeTruthy();
    expect(bad({ prompt: "x".repeat(201), choices: "a\nb" })?.prompt).toBeTruthy();
    expect(bad({ prompt: "Q", choices: "only one" })?.choices).toMatch(/at least 2/);
    expect(bad({ prompt: "Q", choices: Array.from({ length: 9 }, (_, i) => `c${i}`).join("\n") })?.choices).toMatch(/At most 8/);
    expect(bad({ prompt: "Q", choices: `${"x".repeat(61)}\nb` })?.choices).toMatch(/under 60/);
  });
  it("refuses repeated choices (ignoring case) and the built-in Declined", () => {
    expect(validateQuestion({ prompt: "Q", choices: "Yes\nyes" }).ok).toBe(false);
    for (const c of ["Declined", "declined to answer"]) expect(validateQuestion({ prompt: "Q", choices: `Yes\n${c}` }).ok).toBe(false);
  });
  it("refuses hidden characters, which could carry text nobody can see", () => {
    expect(validateQuestion({ prompt: "Q‮", choices: "a\nb" }).ok).toBe(false);
    expect(validateQuestion({ prompt: "Q", choices: "a\nb​" }).ok).toBe(false);
  });
});

describe("readAnswers", () => {
  it("reads a choice id or 'declined' per question and skips an empty one", () => {
    const v = readAnswers({ [`q_${Q1.id}`]: Q1.choices[1].id.toUpperCase(), [`q_${Q2.id}`]: "declined" }, [Q1, Q2]);
    expect(v).toEqual({ ok: true, value: [{ questionId: Q1.id, choiceId: Q1.choices[1].id }, { questionId: Q2.id, choiceId: null }] });
    expect(readAnswers({ [`q_${Q1.id}`]: Q1.choices[0].id, [`q_${Q2.id}`]: "" }, [Q1, Q2])).toEqual({ ok: true, value: [{ questionId: Q1.id, choiceId: Q1.choices[0].id }] });
  });
  it("refuses a choice that belongs to another question, and a form with no answer", () => {
    expect(readAnswers({ [`q_${Q1.id}`]: Q2.choices[0].id }, [Q1, Q2]).ok).toBe(false);
    expect(readAnswers({}, [Q1, Q2])).toMatchObject({ ok: false });
  });
  it("ignores anything on the form that isn't a poll question, so it is never stored", () => {
    const v = readAnswers({ [`q_${Q1.id}`]: Q1.choices[0].id, "q_not-a-question": "x", note: "said she supports X" }, [Q1]);
    expect(v).toEqual({ ok: true, value: [{ questionId: Q1.id, choiceId: Q1.choices[0].id }] });
  });
});

describe("newest answers and tallies", () => {
  const t = (n: number) => new Date(Date.UTC(2026, 10, 17, 9, n));
  const row = (stopId: string, q: PollQuestionView, choice: number | "declined", n: number) => ({ stopId, questionId: q.id, choiceId: choice === "declined" ? null : q.choices[choice].id, declined: choice === "declined", createdAt: t(n) });
  it("the newest row of a stop and question is the answer, whatever order rows arrive in", () => {
    const m = newestAnswers([row("s1", Q1, 1, 5), row("s1", Q1, 0, 1), row("s1", Q2, 0, 2)]);
    expect(m.get(`s1|${Q1.id}`)?.choiceId).toBe(Q1.choices[1].id);
    expect(m.size).toBe(2);
  });
  it("counts each question on its own, counting an edit once (its newest answer)", () => {
    const m = newestAnswers([row("s1", Q1, 0, 1), row("s1", Q1, 1, 3), row("s2", Q1, 1, 2), row("s3", Q1, "declined", 2), row("s1", Q2, 0, 2)]);
    const [a, b] = tally([Q1, Q2], m.values());
    expect(a).toMatchObject({ total: 3, declined: 1 });
    expect(a.choices.map((c) => c.n)).toEqual([0, 2, 0]);
    expect(b).toMatchObject({ total: 1, declined: 0 });
    expect(b.choices.map((c) => c.n)).toEqual([1, 0]);
  });
  it("ignores an answer to a question that isn't in the list and says an empty question has none", () => {
    const [a] = tally([Q1], [{ questionId: "other", choiceId: null, declined: true }]);
    expect(a.total).toBe(0);
  });
  it("words an answer", () => {
    expect(answerWord(Q1, { choiceId: Q1.choices[2].id, declined: false })).toBe("Undecided");
    expect(answerWord(Q1, { choiceId: null, declined: true })).toBe("Declined");
  });
});
