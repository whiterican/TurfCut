/**
 * Edits to published jobs (C4.3). What changed is recorded as a JobChange;
 * the parts of a job that are its terms for workers are "material": a
 * material change tells everyone on the job and lets hired workers leave
 * within RELEASE_HOURS with no reliability penalty.
 */

/** Hours after a material change in which a hired worker may leave with no penalty (owner decision, C4). */
export const RELEASE_HOURS = 24;

/** The job columns an edit can touch, and what each is called for workers. */
export const JOB_FIELDS = {
  title: "title",
  description: "description",
  type: "type of work",
  jurisdictionId: "rule profile",
  startsAt: "dates",
  endsAt: "dates",
  geography: "location",
  compensationMethod: "pay",
  payRateCents: "pay",
  headcount: "headcount",
  hiringMethod: "how it hires",
  requirements: "requirements",
  campaignDisclosure: "the campaign",
  supportContacts: "contacts",
  measureIds: "ballot measures",
  cancellationNoticeHours: "cancellation notice",
  launch: "how each day starts",
  tools: "the canvassing app",
} as const;
export type JobField = keyof typeof JOB_FIELDS;

/** The fields whose change is material: a worker agreed to these when they took the job. */
export const MATERIAL_FIELDS: readonly JobField[] = ["type", "jurisdictionId", "startsAt", "endsAt", "geography", "compensationMethod", "payRateCents", "requirements", "campaignDisclosure", "cancellationNoticeHours", "launch"];

export type JobChanges = Partial<Record<JobField, { from: unknown; to: unknown }>>;

const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
/** Dates as ISO strings and objects with sorted keys, so two spellings of one value compare equal. */
function norm(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])]));
  return v ?? null;
}

/** Ballot-measure ids are a set: the same ids in another order are no change. */
const ordered = (f: JobField, v: unknown) => (f === "measureIds" && Array.isArray(v) ? [...v].sort() : v);

/** The fields whose stored value the edit changes, each with before and after. */
export function jobDiff(before: Partial<Record<JobField, unknown>>, after: Partial<Record<JobField, unknown>>): JobChanges {
  const out: JobChanges = {};
  for (const f of Object.keys(JOB_FIELDS) as JobField[]) {
    if (!(f in after)) continue;
    const a = ordered(f, before[f]);
    const b = ordered(f, after[f]);
    if (!same(a, b)) out[f] = { from: norm(a), to: norm(b) };
  }
  return out;
}

/** The material parts a change touches, as labels, each once, in a fixed order. */
export function materialLabels(changes: JobChanges): string[] {
  const labels: string[] = [];
  for (const f of MATERIAL_FIELDS) if (f in changes && !labels.includes(JOB_FIELDS[f])) labels.push(JOB_FIELDS[f]);
  return labels;
}

/** Every part a change touches, as labels (for the record). */
export function changeLabels(changes: JobChanges): string[] {
  const labels: string[] = [];
  for (const f of Object.keys(JOB_FIELDS) as JobField[]) if (f in changes && !labels.includes(JOB_FIELDS[f])) labels.push(JOB_FIELDS[f]);
  return labels;
}

/** "a, b and c" (or "a, b or c"). */
export const listText = (xs: string[], word: "and" | "or" = "and") => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${word} ${xs.at(-1)}`);

/** The material parts in words, for the copy that warns about the release: one list, drawn from MATERIAL_FIELDS. */
export const materialText = (word: "and" | "or" = "or") => listText(materialLabels(Object.fromEntries(MATERIAL_FIELDS.map((f) => [f, { from: null, to: null }]))), word);

export const releaseDeadline = (changedAt: Date) => new Date(changedAt.getTime() + RELEASE_HOURS * 3_600_000);

/**
 * Whether a hired worker may leave over this change now: it was material,
 * it came after they were hired (an earlier change is what they agreed
 * to), and the release window is still open.
 */
export function releaseOpen(change: { material: string[]; createdAt: Date }, hiredAt: Date, now: Date): boolean {
  return change.material.length > 0 && change.createdAt > hiredAt && now < releaseDeadline(change.createdAt);
}
