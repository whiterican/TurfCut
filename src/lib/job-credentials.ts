/**
 * Hiring checks a worker's credentials (demo audit finding 3): a job that
 * needs a circulator registration, an affidavit status or a badge can't be
 * applied to or claimed by a worker whose credentials wallet doesn't hold
 * it. Checked on the server in engagements-data open(), for apply and claim.
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
 *   credential whose name contains "badge" is the badge.
 * - Training isn't checked before hiring: jobs say training is provided on
 *   day one, so it stays on the job card only.
 */
import { currentCredentials, expiryToday, type CredentialRow } from "@/lib/credentials";
import { jobCredentialNeeds, type JobCredentialNeed, type JobType } from "@/lib/jobs";

export type WalletRow = Pick<CredentialRow, "id" | "kind" | "label" | "state" | "expiresOn" | "supersedesId" | "removed" | "createdAt">;

/** Which needs are checked before hiring (training isn't: see the header). */
export const CHECKED_BEFORE_HIRING: ReadonlySet<JobCredentialNeed["need"]> = new Set(["registration", "badge", "affidavit"]);

function covers(need: JobCredentialNeed, c: WalletRow, jobState: string | null): boolean {
  const stateOk = !c.state || !jobState || c.state.toUpperCase() === jobState.toUpperCase();
  switch (need.need) {
    case "registration":
      return c.kind === "CIRCULATOR_REGISTRATION" && stateOk;
    case "affidavit":
      return c.kind === "NOTARY_OR_AFFIDAVIT" && stateOk;
    case "badge":
      return (c.kind === "OTHER" || c.kind === "TRAINING") && /badge/i.test(c.label ?? "") && stateOk;
    case "training":
      return false;
  }
}

/**
 * The credentials this worker is missing for this job, as the job card names
 * them (empty: nothing missing). `wallet` is every credential row the worker
 * has (the history too: only the current ones count).
 */
export function missingCredentials(
  job: { type: JobType; requirements: unknown; jurisdictionRules: unknown; state: string | null },
  wallet: WalletRow[],
  now = new Date()
): string[] {
  const today = expiryToday(now);
  const live = currentCredentials(wallet).filter((c) => !c.expiresOn || c.expiresOn.toISOString().slice(0, 10) >= today);
  return jobCredentialNeeds(job)
    .filter((n) => CHECKED_BEFORE_HIRING.has(n.need))
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
  const how = missing.map((m) => HOW[m] ?? m).join(", ");
  return `This job needs credentials you haven't added: ${list}. Add ${how} on Profile → Credentials (a current, unexpired one), then try again.`;
}
