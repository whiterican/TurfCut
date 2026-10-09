/**
 * The Applicants table (C3.2). Pure: applicants-data.ts loads, this builds
 * the rows. One job, the people who applied or claimed on it, and only what
 * each one shares with this organization right now (C2):
 *
 * - Columns are chosen by the recruiter from a fixed list. Political answers
 *   are never a column, a filter or a sort (owner decision Q3); they show
 *   only on the applicant detail, where the worker shared them.
 * - A withheld value reads "not shared" and is never ranked: sorting puts
 *   those rows in their own group (lib/table), and a filter never drops
 *   them, so not sharing is never a reason to fall off the list.
 * - There is no combined score. Each metric stands alone, with its sample.
 */
import { DAYS, type Availability } from "@/lib/availability";
import { expiryState, type CredentialKind, type OrgCredentialView } from "@/lib/credentials";
import type { EngagementStatus } from "@/lib/engagements";
import type { JobRequirements } from "@/lib/jobs";
import type { AverageKey, SharedMetric, SharedScorecard } from "@/lib/shared-scorecard";
import { METRIC_GROUP } from "@/lib/sharing";
import type { TableCell, TableColumn } from "@/lib/table";

export type ApplicantColumn =
  | "applied"
  | "stage"
  | "free"
  | "credentials"
  | "signaturesPerActiveHour"
  | "acceptanceRate"
  | "doorsPerActiveHour"
  | "contactRate"
  | "doorsPerCompletedShift"
  | "showRate"
  | "shifts";

type JobType = "PETITION" | "CANVASS";

const COLUMN_DEFS: Record<ApplicantColumn, { label: string; numeric?: boolean; types?: JobType[] }> = {
  applied: { label: "Applied" },
  stage: { label: "Stage" },
  free: { label: "Free on job dates", numeric: true },
  credentials: { label: "Required credentials" },
  signaturesPerActiveHour: { label: "Signatures / active hr", numeric: true, types: ["PETITION"] },
  acceptanceRate: { label: "Validity rate", numeric: true, types: ["PETITION"] },
  doorsPerActiveHour: { label: "Doors / active hr", numeric: true, types: ["CANVASS"] },
  contactRate: { label: "Contact rate", numeric: true, types: ["CANVASS"] },
  doorsPerCompletedShift: { label: "Doors / shift", numeric: true, types: ["CANVASS"] },
  showRate: { label: "Show rate", numeric: true },
  shifts: { label: "Verified shifts", numeric: true },
};

const ORDER = Object.keys(COLUMN_DEFS) as ApplicantColumn[];

export interface ApplicantJob {
  type: JobType;
  startsAt: Date | null;
  endsAt: Date | null;
  requirements: JobRequirements;
  /** The jurisdiction's state, for a circulator registration. */
  state: string;
}

/** Columns that mean something for this job: its work type's metrics, and dates or credentials only when it has them. */
export function availableColumns(job: ApplicantJob): ApplicantColumn[] {
  return ORDER.filter((c) => {
    const d = COLUMN_DEFS[c];
    if (d.types && !d.types.includes(job.type)) return false;
    if (c === "free") return !!job.startsAt && !!job.endsAt;
    if (c === "credentials") return requiredKinds(job).length > 0;
    return true;
  });
}

export function defaultColumns(job: ApplicantJob): ApplicantColumn[] {
  const main = job.type === "PETITION" ? "signaturesPerActiveHour" : "doorsPerActiveHour";
  const want: ApplicantColumn[] = ["applied", "free", "credentials", main, "showRate", "stage"];
  const ok = availableColumns(job);
  return want.filter((c) => ok.includes(c));
}

/** The recruiter's choice from `?cols=a,b`, kept to known columns for this job; the defaults when none is valid. */
export function parseColumns(raw: string | null | undefined, job: ApplicantJob): ApplicantColumn[] {
  const ok = availableColumns(job);
  const picked = (raw ?? "").split(",").filter((c): c is ApplicantColumn => (ok as string[]).includes(c));
  const unique = ORDER.filter((c) => picked.includes(c));
  return unique.length ? unique : defaultColumns(job);
}

export const columnLabel = (c: ApplicantColumn) => COLUMN_DEFS[c].label;

export function tableColumns(cols: ApplicantColumn[]): TableColumn[] {
  return [{ key: "who", label: "Applicant", sortable: true }, ...cols.map((c) => ({ key: c, label: COLUMN_DEFS[c].label, numeric: COLUMN_DEFS[c].numeric, sortable: true }))];
}

// ---------------------------------------------------------------------------
// Availability on the job's dates
// ---------------------------------------------------------------------------

/** At most this many job days are counted (a season-long job reads "of 62+"). */
export const MAX_JOB_DAYS = 62;

const dayKey = (d: Date) => DAYS[(d.getUTCDay() + 6) % 7];

/**
 * On how many of the job's days the worker said they're free at some time:
 * a dated exception wins over the usual week. Job dates are calendar dates
 * (midnight UTC). Times aren't compared: shift times aren't set yet.
 */
export function freeDays(a: Availability, startsAt: Date, endsAt: Date): { free: number; total: number; capped: boolean } {
  const exceptions = new Map(a.exceptions.map((e) => [e.date, e.ranges.length > 0]));
  const start = Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate());
  const end = Date.UTC(endsAt.getUTCFullYear(), endsAt.getUTCMonth(), endsAt.getUTCDate());
  let free = 0;
  let total = 0;
  for (let t = start; t <= end && total < MAX_JOB_DAYS; t += 86_400_000, total++) {
    const d = new Date(t);
    const iso = d.toISOString().slice(0, 10);
    const ok = exceptions.has(iso) ? exceptions.get(iso)! : (a.weekly[dayKey(d)]?.length ?? 0) > 0;
    if (ok) free++;
  }
  return { free, total, capped: end - start >= MAX_JOB_DAYS * 86_400_000 };
}

// ---------------------------------------------------------------------------
// Credentials the job requires
// ---------------------------------------------------------------------------

export function requiredKinds(job: ApplicantJob): CredentialKind[] {
  const out: CredentialKind[] = [];
  // Circulator rules apply to petition jobs only (#43).
  if (job.type === "PETITION" && job.requirements.registration) out.push("CIRCULATOR_REGISTRATION");
  if (job.type === "PETITION" && job.requirements.affidavit) out.push("NOTARY_OR_AFFIDAVIT");
  if (job.requirements.training) out.push("TRAINING");
  return out;
}

export type HeldStatus = { kind: CredentialKind; text: string; rank: number };

/**
 * For each required kind, the best one the worker holds: current and verified,
 * then current and self-reported, then expired, then none. A registration
 * counts only for the job's state. The rank only orders this column; it
 * never feeds anything else.
 */
export function heldCredentials(creds: OrgCredentialView[], job: ApplicantJob, today: string): HeldStatus[] {
  return requiredKinds(job).map((kind) => {
    const name = kind === "CIRCULATOR_REGISTRATION" ? `${job.state} registration` : kind === "TRAINING" ? "Training" : "Affidavit status";
    const mine = creds.filter((c) => c.kind === kind && (kind !== "CIRCULATOR_REGISTRATION" || c.state === job.state));
    const best = mine
      .map((c) => {
        const expired = expiryState(c.expiresOn, today).kind === "expired";
        const verified = c.verification !== "SELF_REPORTED";
        const until = c.expiresOn && !expired ? ` · exp ${c.expiresOn.getUTCFullYear()}` : "";
        return { rank: expired ? 1 : verified ? 3 : 2, text: `${expired ? "expired" : verified ? "verified" : "self-reported"}${until}` };
      })
      .sort((a, b) => b.rank - a.rank)[0];
    return { kind, text: `${name}: ${best?.text ?? "none added"}`, rank: best?.rank ?? 0 };
  });
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface ApplicantFacts {
  engagementId: string;
  name: string;
  closed: boolean;
  status: EngagementStatus;
  stage: string;
  appliedAt: Date;
  /** The live, shared lifetime scorecard (C2.3). */
  scorecard: SharedScorecard;
  availability: Availability | "withheld";
  credentials: OrgCredentialView[] | "withheld";
}

const NOT_SHARED: TableCell = { text: "not shared", sort: null, withheld: true };
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** A shared metric: its value with its sample beside it when the counts are shared. */
function metricCell(m: SharedMetric | null | undefined, percent: boolean, sample: number | null): TableCell {
  if (m === null) return NOT_SHARED;
  if (!m || m.value === null) return { text: "No data yet", sort: null };
  const v = percent ? pct(m.value) : m.value.toFixed(1);
  return { text: sample !== null ? `${v} · ${sample} ${sample === 1 ? "shift" : "shifts"}` : v, sort: m.value };
}

export function applicantCells(a: ApplicantFacts, job: ApplicantJob, cols: ApplicantColumn[], today: string, href: string): Record<string, TableCell> {
  const seg = a.scorecard.segments.find((s) => s.workType === job.type);
  const shifts = seg?.history?.shiftsCount ?? null;
  const cells: Record<string, TableCell> = { who: { text: a.closed ? `${a.name} (account closed)` : a.name, href, sort: a.name } };
  for (const c of cols) {
    switch (c) {
      case "applied":
        cells[c] = { text: day(a.appliedAt), sort: a.appliedAt.getTime() };
        break;
      case "stage":
        cells[c] = { text: a.stage };
        break;
      case "free": {
        if (a.availability === "withheld") cells[c] = NOT_SHARED;
        else if (!job.startsAt || !job.endsAt) cells[c] = { text: "", sort: null };
        else if (!a.availability.exceptions.length && !Object.values(a.availability.weekly).some((r) => r?.length)) cells[c] = { text: "Not set", sort: null };
        else {
          const f = freeDays(a.availability, job.startsAt, job.endsAt);
          cells[c] = { text: `${f.free} of ${f.total}${f.capped ? "+" : ""} days`, sort: f.total ? f.free / f.total : null };
        }
        break;
      }
      case "credentials": {
        if (a.credentials === "withheld") cells[c] = NOT_SHARED;
        else {
          const held = heldCredentials(a.credentials, job, today);
          cells[c] = { text: held.map((h) => h.text).join("; "), sort: held.reduce((n, h) => n * 4 + h.rank, 0) };
        }
        break;
      }
      case "showRate":
        cells[c] = metricCell(a.scorecard.showRate, true, null);
        break;
      case "shifts":
        cells[c] = seg?.history ? { text: String(seg.history.shiftsCount), sort: seg.history.shiftsCount } : a.scorecard.shared.history ? { text: "0", sort: 0 } : NOT_SHARED;
        break;
      default: {
        // No segment for this work type: "No data yet" if the metric's group is shared, else "not shared".
        const k: AverageKey = c;
        const m = seg ? seg.averages[k] : a.scorecard.shared[METRIC_GROUP[k]] ? undefined : null;
        cells[c] = metricCell(m, c === "acceptanceRate" || c === "contactRate", shifts);
      }
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface ApplicantFilters {
  /** "open": waiting on someone (applied, offered); "all": every stage. */
  stage: "open" | "all";
  /** Free on at least one of the job's days. */
  free: boolean;
  /** Holds every required credential, current. */
  credentials: boolean;
  /** Applied on or after this date (YYYY-MM-DD). */
  since: string | null;
}

export function parseFilters(p: URLSearchParams): ApplicantFilters {
  const since = p.get("since");
  return {
    stage: p.get("stage") === "all" ? "all" : "open",
    free: p.get("free") === "1",
    credentials: p.get("creds") === "1",
    since: since && /^\d{4}-\d{2}-\d{2}$/.test(since) && !Number.isNaN(Date.parse(since)) ? since : null,
  };
}

/**
 * Whether a row stays under the filters. A worker who doesn't share what a
 * filter looks at always stays (shown as "not shared"): a filter narrows
 * what was shared, it never penalizes not sharing.
 */
export function keepApplicant(a: ApplicantFacts, job: ApplicantJob, f: ApplicantFilters, today: string): boolean {
  if (f.stage === "open" && a.status !== "APPLIED" && a.status !== "OFFERED") return false;
  if (f.since && a.appliedAt.toISOString().slice(0, 10) < f.since) return false;
  if (f.free && a.availability !== "withheld" && job.startsAt && job.endsAt && freeDays(a.availability, job.startsAt, job.endsAt).free === 0) return false;
  if (f.credentials && a.credentials !== "withheld" && heldCredentials(a.credentials, job, today).some((h) => h.rank < 2)) return false;
  return true;
}
