import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { ACCEPTED_STATUSES } from "@/lib/engagements";
import { check, retryAfter, waitText } from "@/lib/rate-limit";
import { decodeCursor, encodeCursor } from "@/lib/campaign-social";
import { POST_SELECT, publicPost, type PublicPost } from "@/lib/campaign-social-data";
import { FEED_PAGE_SIZE, feedSources, followChange, likeChange, type FeedReason } from "@/lib/campaign-follow";

/**
 * Follows, the home feed and likes (S2), server side. Every read and write
 * is scoped to the signed-in worker here; the campaign side only ever
 * learns a post's like total. Rows are never changed or removed: a follow
 * or a like is closed (once) and a new one opened.
 */

type Result = { ok: true } | { ok: false; reason: string };
const lock = (tx: Prisma.TransactionClient, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

/** The same rule as the database's public read policy: published, and the organization approved. */
const PUBLIC_CAMPAIGN = { publishedAt: { not: null }, org: { approved: true } } satisfies Prisma.CampaignProfileWhereInput;

async function gate(name: "follow" | "like", workerId: string): Promise<{ ok: false; reason: string } | null> {
  const verdict = await check(name, workerId);
  if (verdict === "ok") return null;
  if (verdict === "unavailable") return { ok: false, reason: "That's briefly unavailable. Try again in a minute." };
  return { ok: false, reason: `Too many changes. Try again in ${waitText(await retryAfter(name, workerId))}.` };
}

// ---------------------------------------------------------------------------
// Follows
// ---------------------------------------------------------------------------

export type FollowState = { following: boolean; notify: boolean };

/** Whether the worker follows a campaign, and with notices. */
export async function followState(workerId: string, campaignId: string): Promise<FollowState> {
  if (!UUID_RE.test(campaignId)) return { following: false, notify: false };
  const open = await db().campaignFollow.findFirst({ where: { workerId, campaignId, revokedAt: null }, select: { notify: true } });
  return { following: !!open, notify: open?.notify ?? false };
}

/** The campaigns the worker follows, with each one's notice setting. */
export function openFollows(workerId: string) {
  return db().campaignFollow.findMany({ where: { workerId, revokedAt: null }, select: { campaignId: true, notify: true, createdAt: true }, orderBy: { createdAt: "desc" } });
}

/**
 * Follow, unfollow, or change the notice setting. Only a public campaign can
 * be followed; unfollowing is always allowed (a campaign that went private
 * still lets go). The open row is closed and a new one opened on a change:
 * rows never change.
 */
export async function setFollow(workerId: string, campaignId: string, wish: { follow: boolean; notify?: boolean }): Promise<Result> {
  if (!UUID_RE.test(campaignId)) return { ok: false, reason: "That campaign doesn't exist." };
  const gated = await gate("follow", workerId);
  if (gated) return gated;
  return db().$transaction(async (tx) => {
    await lock(tx, `follow:${workerId}:${campaignId}`);
    const open = await tx.campaignFollow.findFirst({ where: { workerId, campaignId, revokedAt: null }, select: { id: true, notify: true } });
    const change = followChange(open, wish);
    if (change === "none") return { ok: true };
    if (change === "open" || change === "replace") {
      const campaign = await tx.campaignProfile.findFirst({ where: { id: campaignId, ...PUBLIC_CAMPAIGN }, select: { id: true } });
      if (!campaign) return { ok: false, reason: "That campaign isn't public." };
    }
    const now = new Date();
    if (open && change !== "open") await tx.campaignFollow.update({ where: { id: open.id }, data: { revokedAt: now } });
    if (change !== "close") await tx.campaignFollow.create({ data: { workerId, campaignId, notify: wish.notify ?? open?.notify ?? false, createdAt: now } });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// The home feed
// ---------------------------------------------------------------------------

const FEED_CAMPAIGN_SELECT = { id: true, handle: true, displayName: true, avatarKey: true } satisfies Prisma.CampaignProfileSelect;
export type FeedCampaign = Prisma.CampaignProfileGetPayload<{ select: typeof FEED_CAMPAIGN_SELECT }>;
export type FeedPost = PublicPost & { campaign: FeedCampaign; reason: FeedReason; liked: boolean };
export type FeedPage = { posts: FeedPost[]; next: string | null; sources: number };

/** The public campaigns whose jobs hired the worker (a seat held: claimed, active or completed). */
async function hiredCampaignIds(workerId: string): Promise<string[]> {
  const rows = await db().job.findMany({
    where: { campaignProfileId: { not: null }, campaignProfile: PUBLIC_CAMPAIGN, engagements: { some: { workerId, status: { in: ACCEPTED_STATUSES } } } },
    select: { campaignProfileId: true },
    distinct: ["campaignProfileId"],
  });
  return rows.flatMap((r) => (r.campaignProfileId ? [r.campaignProfileId] : []));
}

/** The campaigns a worker's feed draws from (public ones only), with the reason for each. */
export async function feedCampaigns(workerId: string): Promise<Map<string, FeedReason>> {
  const [follows, hired] = await Promise.all([
    db().campaignFollow.findMany({ where: { workerId, revokedAt: null, campaign: PUBLIC_CAMPAIGN }, select: { campaignId: true } }),
    hiredCampaignIds(workerId),
  ]);
  return feedSources(follows.map((f) => f.campaignId), hired);
}

/**
 * One page of the worker's home feed: the live posts of the campaigns they
 * follow and the campaigns that hired them, newest first, by (createdAt,
 * id) keyset. Chronological only: no ranking, no suggestions. Every post
 * carries whether this worker liked it; nobody else's likes are shown.
 */
export async function loadHomeFeed(workerId: string, cursor?: string | null): Promise<FeedPage> {
  const sources = await feedCampaigns(workerId);
  if (sources.size === 0) return { posts: [], next: null, sources: 0 };
  const after = decodeCursor(cursor);
  const rows = await db().campaignPost.findMany({
    where: {
      profileId: { in: [...sources.keys()] },
      deletedAt: null,
      ...(after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: FEED_PAGE_SIZE + 1,
    select: { ...POST_SELECT, profile: { select: FEED_CAMPAIGN_SELECT } },
  });
  const page = rows.slice(0, FEED_PAGE_SIZE);
  const liked = await likedPostIds(workerId, page.map((p) => p.id));
  const posts = page.map(({ profile, ...p }) => ({ ...publicPost(p), campaign: profile, reason: sources.get(p.profileId) ?? "following", liked: liked.has(p.id) }));
  return { posts, next: rows.length > FEED_PAGE_SIZE ? encodeCursor(page[page.length - 1]) : null, sources: sources.size };
}

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

/** Which of these posts the worker has liked (open likes). */
export async function likedPostIds(workerId: string, postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const rows = await db().postLike.findMany({ where: { workerId, removedAt: null, postId: { in: postIds } }, select: { postId: true } });
  return new Set(rows.map((r) => r.postId));
}

/** Like or unlike a live post on a public campaign. Unliking is always allowed. */
export async function setLike(workerId: string, postId: string, want: boolean): Promise<Result> {
  if (!UUID_RE.test(postId)) return { ok: false, reason: "That post doesn't exist." };
  const gated = await gate("like", workerId);
  if (gated) return gated;
  return db().$transaction(async (tx) => {
    await lock(tx, `like:${workerId}:${postId}`);
    const open = await tx.postLike.findFirst({ where: { workerId, postId, removedAt: null }, select: { id: true } });
    const change = likeChange(!!open, want);
    if (change === "none") return { ok: true };
    if (change === "open") {
      const post = await tx.campaignPost.findFirst({ where: { id: postId, deletedAt: null, profile: PUBLIC_CAMPAIGN }, select: { id: true } });
      if (!post) return { ok: false, reason: "That post isn't available." };
      await tx.postLike.create({ data: { workerId, postId } });
    } else if (open) {
      await tx.postLike.update({ where: { id: open.id }, data: { removedAt: new Date() } });
    }
    return { ok: true };
  });
}

/** Like totals per post, for the campaign's own view (counts only; never who). */
export async function likeCounts(orgId: string, postIds: string[]): Promise<Map<string, number>> {
  const ids = postIds.filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return new Map();
  const rows = await db().postLike.groupBy({ by: ["postId"], where: { removedAt: null, postId: { in: ids }, post: { profile: { orgId } } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.postId, r._count._all]));
}
