/**
 * The social layer, worker side (S2): follows, the home feed and likes.
 * Pure rules — no database access.
 *
 * What this is: a recruiting channel. A worker's feed is the posts of the
 * campaigns they chose to follow and of the campaigns whose jobs hired
 * them, newest first, nothing else. There is no ranking, no suggestion,
 * no "for you": chronological and follows only.
 *
 * What stays private: who follows a campaign and who liked a post are the
 * worker's business. A campaign sees how many likes a post has, never who;
 * it never sees its followers or a follower count. None of this activity
 * reaches matching, scorecards or any ranking (C1-Q14; enforced by
 * src/lib/social-isolation.test.ts).
 */

/** Posts per feed page. */
export const FEED_PAGE_SIZE = 20;
/** Notices of new posts a worker gets from one campaign in a day, at most (S2.4). */
export const MAX_NOTICES_PER_CAMPAIGN_PER_DAY = 3;

/** Why a campaign is in a worker's feed. Following is the worker's own choice, so it wins when both apply. */
export type FeedReason = "following" | "hired";

/**
 * The campaigns a worker's feed draws from, each with its reason. A campaign
 * the worker follows and was hired by reads as "following".
 */
export function feedSources(followed: Iterable<string>, hired: Iterable<string>): Map<string, FeedReason> {
  const out = new Map<string, FeedReason>();
  for (const id of hired) out.set(id, "hired");
  for (const id of followed) out.set(id, "following");
  return out;
}

export type OpenFollow = { notify: boolean };
export type FollowWish = { follow: boolean; notify?: boolean };
/**
 * What a follow request does to the worker's open follow row, if any:
 * - "open": start following (a new row, with the notice setting asked for);
 * - "close": stop following (close the open row);
 * - "replace": keep following with a different notice setting (close the
 *   row and open a new one — rows never change);
 * - "none": already as asked.
 * Leaving `notify` out keeps the current setting, or starts without notices.
 */
export function followChange(open: OpenFollow | null, wish: FollowWish): "open" | "close" | "replace" | "none" {
  if (!wish.follow) return open ? "close" : "none";
  if (!open) return "open";
  if (wish.notify === undefined || wish.notify === open.notify) return "none";
  return "replace";
}

/** Whether one more notice from a campaign may be sent to a worker today (S2.4). */
export function noticeAllowed(sentToday: number): boolean {
  return sentToday < MAX_NOTICES_PER_CAMPAIGN_PER_DAY;
}

/** A like request against the worker's open like: start one, end one, or nothing to do. */
export function likeChange(liked: boolean, want: boolean): "open" | "close" | "none" {
  return liked === want ? "none" : want ? "open" : "close";
}

/** The start of the current day in UTC: notice caps and "today" are counted on it (S2.4). */
export function dayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
