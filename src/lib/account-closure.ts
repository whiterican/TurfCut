/**
 * Closing an account (M7). Pure rules — no database access.
 *
 * Deleting a worker's rows is impossible by design (rule 3: consent
 * versions, metric versions, the work ledger and pay are append-only), so
 * leaving means: the login is deleted, the name and phone are anonymized,
 * and everything else stays as it was recorded. Closure waits until money
 * and open work are settled, so nothing is left dangling in someone
 * else's name.
 */
export const CLOSED_NAME = "Former worker";

export interface ClosureFacts {
  /** Pay lines not voided, paid or empty: the worker is still owed money. */
  unpaidLines: number;
  /** Disputes with no resolution. */
  openDisputes: number;
  /** Shifts checked in and not checked out. */
  liveShifts: number;
  /** Shifts worked but not yet reviewed: their pay isn't recorded yet. */
  pendingReviews: number;
  /** Transfers Stripe hasn't confirmed. */
  transfersInFlight: number;
  /** Field entries on the phone not yet synced (the phone reports this). */
  unsyncedEntries?: number;
}

/** Why the account can't close right now, in plain words (empty = it can). */
export function closureProblems(f: ClosureFacts): string[] {
  const out: string[] = [];
  if (f.transfersInFlight > 0) out.push("A payment to you is still going through Stripe. Wait for it to land.");
  if (f.unpaidLines > 0) out.push(`You have pay on the way (${f.unpaidLines === 1 ? "1 line" : `${f.unpaidLines} lines`}). Closing now would leave it unpaid — wait until it's paid, or ask the organization.`);
  if (f.openDisputes > 0) out.push(`You have ${f.openDisputes === 1 ? "an open pay dispute" : `${f.openDisputes} open pay disputes`}. Wait for the organization's answer.`);
  if (f.liveShifts > 0) out.push("You're checked in on a shift. Check out first.");
  if (f.pendingReviews > 0) out.push(`${f.pendingReviews === 1 ? "A shift you worked is" : `${f.pendingReviews} shifts you worked are`} waiting for the supervisor's review. Its pay isn't recorded yet — wait for the review.`);
  if ((f.unsyncedEntries ?? 0) > 0) out.push(`${f.unsyncedEntries} field ${f.unsyncedEntries === 1 ? "entry hasn't" : "entries haven't"} synced from this phone. Get signal and let them sync first.`);
  return out;
}

/** The confirmation phrase a person types to close their account. */
export const CLOSE_PHRASE = "close my account";
export const confirmed = (typed: unknown) => typeof typed === "string" && typed.trim().toLowerCase() === CLOSE_PHRASE;
