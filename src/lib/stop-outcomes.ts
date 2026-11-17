/**
 * Stop outcomes (W2), the pure half: the color code, which fields each kind
 * of work records at a stop, validation, and progress. The database half is
 * src/lib/stop-outcomes-data.ts.
 *
 * Colour is never the only cue: every outcome has a word and a glyph name
 * too (the component draws the glyph). The fields are deliberately few and
 * closed (yes/no and a count): nothing here records what a resident said or
 * thought, and the database refuses any other key (CLAUDE.md rule 4).
 */
import type { JobType } from "@/lib/jobs";

export const OUTCOME_KINDS = ["DONE", "COME_BACK", "NOT_HOME", "DO_NOT_KNOCK", "REFUSED", "MOVED_VACANT"] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export interface OutcomeLook {
  kind: OutcomeKind;
  label: string;
  /** One line under the label on the picker. */
  hint: string;
  /** Mid-tone accents that read on the light page and on the night one; the label and glyph carry the meaning. */
  color: string;
  /** lucide-react icon the component draws. */
  glyph: "check" | "rotate" | "door" | "ban" | "x" | "truck";
}

export const OUTCOMES: readonly OutcomeLook[] = [
  { kind: "DONE", label: "Done", hint: "Reached the door", color: "#2e9e5b", glyph: "check" },
  { kind: "COME_BACK", label: "Come back", hint: "Try again later", color: "#e0a100", glyph: "rotate" },
  { kind: "NOT_HOME", label: "Not home", hint: "No answer", color: "#3b82d6", glyph: "door" },
  { kind: "DO_NOT_KNOCK", label: "Don't knock", hint: "Skip this door", color: "#d6362d", glyph: "ban" },
  { kind: "REFUSED", label: "Refused", hint: "Declined to talk", color: "#8a8f98", glyph: "x" },
  { kind: "MOVED_VACANT", label: "Moved / vacant", hint: "Nobody lives here", color: "#a8734a", glyph: "truck" },
];
export const outcomeLook = (k: OutcomeKind): OutcomeLook => OUTCOMES.find((o) => o.kind === k)!;
/** A stop with no outcome yet. */
export const UNVISITED_COLOR = "#5a3a8a";
export const isOutcomeKind = (v: unknown): v is OutcomeKind => typeof v === "string" && (OUTCOME_KINDS as readonly string[]).includes(v);

// ---------------------------------------------------------------------------
// Fields by work type
// ---------------------------------------------------------------------------

export type FieldKey = "talked_to" | "left_literature" | "signatures";
export interface FieldSpec {
  key: FieldKey;
  label: string;
  kind: "bool" | "count";
  max?: number;
}

const TALKED: FieldSpec = { key: "talked_to", label: "Talked with someone", kind: "bool" };
const LIT: FieldSpec = { key: "left_literature", label: "Left literature", kind: "bool" };
const SIGS: FieldSpec = { key: "signatures", label: "Signatures gathered", kind: "count", max: 50 };

/**
 * What a kind of work records, and at which outcomes. Door-to-door canvassing
 * covers literature drops: "left literature" can go on a Done or a Not home.
 * Petition circulation records signatures on a Done. Polling is not here: it
 * records residents' answers, and stays planned until it has a privacy review.
 */
export function fieldsFor(type: JobType, outcome: OutcomeKind): FieldSpec[] {
  if (type === "CANVASS") return outcome === "DONE" ? [TALKED, LIT] : outcome === "NOT_HOME" ? [LIT] : [];
  return outcome === "DONE" ? [SIGS] : [];
}

export interface Answer {
  key: FieldKey;
  intValue: number | null;
  boolValue: boolean | null;
}

export type OutcomeInput = { outcome: OutcomeKind; answers: Answer[] };

/** Reads an outcome and its fields from a form. Anything the work type doesn't record at that outcome is ignored, never stored. */
export function validateOutcome(type: JobType, raw: Record<string, unknown>): { ok: true; value: OutcomeInput } | { ok: false; reason: string; errors: Record<string, string> } {
  const outcome = raw.outcome;
  if (!isOutcomeKind(outcome)) return { ok: false, reason: "Pick what happened at this door.", errors: { outcome: "Pick what happened at this door." } };
  const answers: Answer[] = [];
  const errors: Record<string, string> = {};
  for (const f of fieldsFor(type, outcome)) {
    const v = raw[f.key];
    if (f.kind === "bool") {
      answers.push({ key: f.key, intValue: null, boolValue: v === "on" || v === "true" || v === true });
    } else {
      const t = String(v ?? "").trim();
      const n = Number(t);
      if (t === "") answers.push({ key: f.key, intValue: 0, boolValue: null });
      else if (!/^\d{1,3}$/.test(t) || n > (f.max ?? 50)) errors[f.key] = `${f.label} must be a whole number from 0 to ${f.max}.`;
      else answers.push({ key: f.key, intValue: n, boolValue: null });
    }
  }
  if (Object.keys(errors).length) return { ok: false, reason: "Fix the highlighted fields.", errors };
  return { ok: true, value: { outcome, answers } };
}

// ---------------------------------------------------------------------------
// State and progress
// ---------------------------------------------------------------------------

export interface StopState {
  outcome: OutcomeKind | null;
  answers: Partial<Record<FieldKey, number | boolean>>;
}
export const UNVISITED: StopState = { outcome: null, answers: {} };

/** The newest outcome row of each stop, as a state. Rows come in any order. */
export function latestByStop<T extends { stopId: string; createdAt: Date; outcome: OutcomeKind; answers: Array<{ key: string; intValue: number | null; boolValue: boolean | null }> }>(rows: readonly T[]): Map<string, StopState> {
  const newest = new Map<string, T>();
  for (const r of rows) {
    const cur = newest.get(r.stopId);
    if (!cur || r.createdAt > cur.createdAt) newest.set(r.stopId, r);
  }
  return new Map(
    [...newest].map(([id, r]) => [id, { outcome: r.outcome, answers: Object.fromEntries(r.answers.map((a) => [a.key, a.intValue ?? a.boolValue ?? false])) as StopState["answers"] }])
  );
}

export interface Progress {
  total: number;
  byKind: Record<OutcomeKind, number>;
  unvisited: number;
  /** Stops still to work: nothing recorded yet, or a Come back. */
  remaining: number;
  /** Stops settled one way or another (everything but unvisited and Come back). */
  settled: number;
  signatures: number;
}

export function progressOf(states: readonly StopState[]): Progress {
  const byKind = Object.fromEntries(OUTCOME_KINDS.map((k) => [k, 0])) as Record<OutcomeKind, number>;
  let unvisited = 0;
  let signatures = 0;
  for (const s of states) {
    if (s.outcome) byKind[s.outcome]++;
    else unvisited++;
    if (typeof s.answers.signatures === "number") signatures += s.answers.signatures;
  }
  const remaining = unvisited + byKind.COME_BACK;
  return { total: states.length, byKind, unvisited, remaining, settled: states.length - remaining, signatures };
}

/** Progress for a book of `total` stops of which only some have an outcome: the rest are unvisited. */
export function progressFromRecorded(total: number, recorded: readonly StopState[]): Progress {
  const p = progressOf(recorded);
  const missing = Math.max(0, total - recorded.length);
  const unvisited = p.unvisited + missing;
  const remaining = unvisited + p.byKind.COME_BACK;
  return { ...p, total: Math.max(total, recorded.length), unvisited, remaining, settled: Math.max(total, recorded.length) - remaining };
}

/** "12 of 40 settled" as a whole percent; 0 for an empty book. */
export const settledPercent = (p: Progress) => (p.total ? Math.round((p.settled / p.total) * 100) : 0);
