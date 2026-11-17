/**
 * Polling at the door (W5), the pure half: validating a poll's questions,
 * reading an answer form, and working out what the newest answers say. The
 * database half is poll-data.ts.
 *
 * A poll is fixed choices only. There is no free text anywhere, so nothing
 * here can carry a note about a resident, and a resident's answer is only
 * ever what the worker recorded them saying: nothing is inferred from it,
 * nothing is scored, and no per-worker figure is built from it (CLAUDE.md
 * rules 4 and 5).
 */
import { hasHiddenChars } from "@/lib/text-guard";

export const POLL_MAX_QUESTIONS = 10;
export const POLL_MIN_CHOICES = 2;
export const POLL_MAX_CHOICES = 8;
export const POLL_PROMPT_MAX = 200;
export const POLL_CHOICE_MAX = 60;
/** The built-in answer that isn't a choice: the resident chose not to answer. */
export const DECLINED = "declined";

export interface PollChoiceView {
  id: string;
  label: string;
}
export interface PollQuestionView {
  id: string;
  position: number;
  prompt: string;
  choices: PollChoiceView[];
}

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

export interface QuestionInput {
  prompt: string;
  choices: string[];
}

/**
 * A question from the setup form: the prompt, and the choices one to a line.
 * Choices are trimmed, blank lines dropped, repeats (ignoring case) refused,
 * and "Declined" is reserved: it is built in, so it can't be a choice.
 */
export function validateQuestion(raw: Record<string, unknown>): { ok: true; value: QuestionInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const prompt = clean(raw.prompt);
  if (!prompt) errors.prompt = "Write the question.";
  else if (prompt.length > POLL_PROMPT_MAX) errors.prompt = `Keep the question under ${POLL_PROMPT_MAX} characters.`;
  else if (hasHiddenChars(prompt)) errors.prompt = "Remove the hidden characters.";
  const lines = String(raw.choices ?? "")
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean);
  const seen = new Set<string>();
  for (const c of lines) {
    const k = c.toLowerCase();
    if (c.length > POLL_CHOICE_MAX) errors.choices = `Keep each choice under ${POLL_CHOICE_MAX} characters.`;
    else if (hasHiddenChars(c)) errors.choices = "Remove the hidden characters.";
    else if (k === DECLINED || k === "declined to answer") errors.choices = "\"Declined\" is built in: leave it out.";
    else if (seen.has(k)) errors.choices = `"${c}" is listed twice.`;
    seen.add(k);
  }
  if (!errors.choices) {
    if (lines.length < POLL_MIN_CHOICES) errors.choices = `Give at least ${POLL_MIN_CHOICES} choices, one to a line.`;
    else if (lines.length > POLL_MAX_CHOICES) errors.choices = `At most ${POLL_MAX_CHOICES} choices.`;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { prompt, choices: lines } };
}

export interface AnswerInput {
  questionId: string;
  /** null when the resident declined. */
  choiceId: string | null;
}

/**
 * The answers on a form: one field per question, `q_<questionId>`, holding a
 * choice id or "declined"; an empty or missing field means that question was
 * not answered and is skipped. Only questions and choices on the poll are
 * read: anything else on the form is ignored, never stored.
 */
export function readAnswers(raw: Record<string, unknown>, questions: readonly PollQuestionView[]): { ok: true; value: AnswerInput[] } | { ok: false; reason: string } {
  const out: AnswerInput[] = [];
  for (const q of questions) {
    const v = clean(raw[`q_${q.id}`]).toLowerCase();
    if (!v) continue;
    if (v === DECLINED) out.push({ questionId: q.id, choiceId: null });
    else if (q.choices.some((c) => c.id === v)) out.push({ questionId: q.id, choiceId: v });
    else return { ok: false, reason: `That isn't a choice for "${q.prompt}". Pick again.` };
  }
  if (!out.length) return { ok: false, reason: "Answer at least one question." };
  return { ok: true, value: out };
}

export interface AnswerRow {
  stopId: string;
  questionId: string;
  choiceId: string | null;
  declined: boolean;
  createdAt: Date;
}

/** The newest row of each stop and question: the answer now, whatever order rows arrive in. */
export function newestAnswers<T extends AnswerRow>(rows: readonly T[]): Map<string, T> {
  const best = new Map<string, T>();
  for (const r of rows) {
    const k = `${r.stopId}|${r.questionId}`;
    const cur = best.get(k);
    if (!cur || r.createdAt > cur.createdAt) best.set(k, r);
  }
  return best;
}

export interface Tally {
  questionId: string;
  prompt: string;
  /** Answers counted: every choice and the declined. */
  total: number;
  choices: Array<{ id: string; label: string; n: number }>;
  declined: number;
}

/**
 * Counts per question of the newest answers. A question's counts are only its
 * own: nothing is combined across questions, nothing is split by worker, and
 * nothing is turned into a score.
 */
export function tally(questions: readonly PollQuestionView[], newest: Iterable<{ questionId: string; choiceId: string | null; declined: boolean }>): Tally[] {
  const by = new Map(questions.map((q): [string, Tally] => [q.id, { questionId: q.id, prompt: q.prompt, total: 0, choices: q.choices.map((c) => ({ ...c, n: 0 })), declined: 0 }]));
  for (const a of newest) {
    const t = by.get(a.questionId);
    if (!t) continue;
    t.total++;
    if (a.declined) t.declined++;
    else {
      const c = t.choices.find((x) => x.id === a.choiceId);
      if (c) c.n++;
    }
  }
  return questions.map((q) => by.get(q.id)!);
}

/** "Support" or "Declined" for one answer, given the poll's question. */
export function answerWord(q: PollQuestionView, a: { choiceId: string | null; declined: boolean }): string {
  return a.declined ? "Declined" : (q.choices.find((c) => c.id === a.choiceId)?.label ?? "—");
}
