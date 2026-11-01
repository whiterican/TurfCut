/**
 * The words and outcomes behind the job page's Save and Share controls (#113 review, P2).
 * Pure, so the client component stays thin and the rules are tested.
 */

/** A share or clipboard failure is a cancellation only when the person closed the share sheet. */
export function isShareCancelled(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

/** What a failed save or unsave says; the control keeps its previous state and stays usable for a retry. */
export function saveFailureText(saving: boolean): string {
  return saving ? "Couldn't save this job. Try again." : "Couldn't remove this saved job. Try again.";
}

export const SHARE_FAILED = "Couldn't share this job. Copy the link below.";
export const LINK_COPIED = "Link copied";
