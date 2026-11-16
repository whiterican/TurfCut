/**
 * Hiring checks a worker's credentials (demo audit finding 3): a job that
 * needs a circulator registration, an affidavit status, a badge or a named
 * training course can't be applied to, claimed, or accepted (invitation or
 * offer) by a worker whose credentials wallet doesn't hold it. Checked on
 * the server in engagements-data open() and moveEngagement (accept), and
 * re-checked under the locks against the fresh job and wallet.
 *
 * Product choices (the owner decides; listed in the PR):
 * - What counts: the worker's current wallet (credentials.ts
 *   currentCredentials), self-reported included. Organizations verify after
 *   hiring (C3.6), so requiring verified credentials would block every
 *   first hire.
 * - Expired doesn't count: a credential with an expiry date before today
 *   (expiryToday) is missing. One with no expiry date counts.
 * - State: a registration or affidavit status that names a state counts
 *   only for jobs in that state. One with no state counts anywhere.
 * - A badge has no credential kind of its own: an "Other" (or training)
 *   credential whose name is exactly one of BADGE_NAMES (trimmed, any case,
 *   inner spaces collapsed) is the badge. "No badge yet" isn't.
 * - Training is a TRAINING credential whose name matches the job's course
 *   (same normalization). The existing TRAINING kind is used; no new kind.
 * - "We provide training" (Job.providesTraining): when true, a missing
 *   required training or badge is waived. Registration and affidavit are
 *   never waived. When false, every required credential is enforced.
 *   Existing hires are not re-checked if the flag is later turned off.
 */
import { currentCredentials, expiryToday, type CredentialRow } from "@/lib/credentials";
import { jobCredentialNeeds, type JobCredentialNeed, type JobType } from "@/lib/jobs";

export type WalletRow = Pick<CredentialRow, "id" | "kind" | "label" | "state" | "expiresOn" | "supersedesId" | "removed" | "createdAt">;

/** Which needs are checked before hiring (all of them; badge and training may be waived). */
export const CHECKED_BEFORE_HIRING: ReadonlySet<JobCredentialNeed["need"]> = new Set(["registration", "badge", "affidavit", "training"]);

/** Needs the organization can cover by providing training (Job.providesTraining). Registration and affidavit are never in this set. */
export const WAIVED_WHEN_PROVIDES_TRAINING: ReadonlySet<JobCredentialNeed["need"]> = new Set(["badge", "training"]);

/** The names an Other (or training) credential may have to count as the badge, lower-case. */
export const BADGE_NAMES: ReadonlySet<string> = new Set(["badge", "circulator badge", "paid circulator badge"]);

/** Whether a credential's name is one of BADGE_NAMES (trimmed, case-insensitive, inner spaces collapsed). */
function normalizedName(label: string | null | undefined): string {
  return (label ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function isBadgeName(label: string | null | undefined): boolean {
  return BADGE_NAMES.has(normalizedName(label));
}

/** Whether a training credential's name is this job's course (trimmed, any case, inner spaces collapsed). */
export function isTrainingName(label: string | null | undefined, course: string): boolean {
  return !!normalizedName(course) && normalizedName(label) === normalizedName(course);
}

function covers(need: JobCredentialNeed, c: WalletRow, jobState: string | null): boolean {
  const stateOk = !c.state || !jobState || c.state.toUpperCase() === jobState.toUpperCase();
  switch (need.need) {
    case "registration":
      return c.kind === "CIRCULATOR_REGISTRATION" && stateOk;
    case "affidavit":
      return c.kind === "NOTARY_OR_AFFIDAVIT" && stateOk;
    case "badge":
      return (c.kind === "OTHER" || c.kind === "TRAINING") && isBadgeName(c.label) && stateOk;
    case "training":
      return c.kind === "TRAINING" && isTrainingName(c.label, need.course) && stateOk;
  }
}

/**
 * The credentials this worker is missing for this job, as the job card names
 * them (empty: nothing missing). `wallet` is every credential row the worker
 * has (the history too: only the current ones count).
 */
export function missingCredentials(
  job: { type: JobType; requirements: unknown; jurisdictionRules: unknown; state: string | null; providesTraining?: boolean },
  wallet: WalletRow[],
  now = new Date()
): string[] {
  const today = expiryToday(now);
  const live = currentCredentials(wallet).filter((c) => !c.expiresOn || c.expiresOn.toISOString().slice(0, 10) >= today);
  const waived = job.providesTraining ? WAIVED_WHEN_PROVIDES_TRAINING : new Set<JobCredentialNeed["need"]>();
  return jobCredentialNeeds(job)
    .filter((n) => CHECKED_BEFORE_HIRING.has(n.need) && !waived.has(n.need))
    .filter((n) => !live.some((c) => covers(n, c, job.state)))
    .map((n) => n.label);
}

const HOW: Record<string, string> = {
  "Circulator registration": "your circulator registration",
  "Signed affidavit": "your notary or affidavit status",
  Badge: "your badge (as Other, named “Badge”)",
};

/** What the worker is told when hiring stops on missing credentials. */
export function missingCredentialsMessage(missing: string[]): string {
  const list = missing.join(", ");
  const how = missing.map(howToAdd).join(", ");
  return `This job needs credentials you haven't added: ${list}. Add ${how} on Profile → Credentials (a current, unexpired one), then try again.`;
}

function howToAdd(label: string): string {
  if (HOW[label]) return HOW[label];
  if (label.startsWith("Training: ")) return `your training (as Training completed, named “${label.slice("Training: ".length)}”)`;
  return label;
}
