import { excerpt } from "@/lib/campaign-social";
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

/**
 * Who gets a notice of a campaign's new post (S2.4): the followers who
 * asked for notices, each at most MAX_NOTICES_PER_CAMPAIGN_PER_DAY times
 * a day per campaign. Pure; the delivery (an in-app notification) lands
 * with the Notification model (C3.5) and reads this.
 */
export function noticeRecipients(followers: Iterable<{ workerId: string; notify: boolean }>, sentToday: ReadonlyMap<string, number>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of followers) {
    if (!f.notify || seen.has(f.workerId) || !noticeAllowed(sentToday.get(f.workerId) ?? 0)) continue;
    seen.add(f.workerId);
    out.push(f.workerId);
  }
  return out;
}

/** Today's feed link: how many posts are newer than the device's last visit, "9+" past the cap. */
export function feedBadge(fresh: number, cap = 9): string {
  return fresh <= 0 ? "Your feed" : fresh > cap ? `${cap}+ new in your feed` : `${fresh} new in your feed`;
}

/** The "feed seen" cookie: when this browser last opened the feed (per device, not a record of anything). */
export const FEED_SEEN_COOKIE = "turfcut-feed-seen";
/** Parses the cookie; anything but a plain ISO time (or a time in the future) counts as never. */
export function feedSeenAt(value: string | undefined, now: Date): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) || d > now ? null : d;
}

/** A like request against the worker's open like: start one, end one, or nothing to do. */
export function likeChange(liked: boolean, want: boolean): "open" | "close" | "none" {
  return liked === want ? "none" : want ? "open" : "close";
}

/** The start of the current day in UTC: notice caps and "today" are counted on it (S2.4). */
export function dayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Most of a post a notice quotes: enough to tell posts apart, short enough for a list. */
export const POST_NOTICE_EXCERPT = 90;

/**
 * A followed campaign's new post (S2.4), in the campaign's own words: its
 * name and the start of the post, leading to the post's page.
 */
export function postNoticeText(post: { id: string; body: string; profile: { handle: string; displayName: string } }): { text: string; href: string } {
  return { text: `${post.profile.displayName} posted: “${excerpt(post.body, POST_NOTICE_EXCERPT)}”`, href: `/c/${post.profile.handle}/p/${post.id}` };
}
