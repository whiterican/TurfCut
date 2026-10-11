import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { checkImage, type MediaKind, type MediaStore } from "@/lib/campaign-media";
import { check, retryAfter, waitText } from "@/lib/rate-limit";
import { decodeCursor, embedProblem, encodeCursor, MAX_CAMPAIGNS_PER_ORG, MAX_PINNED, normalizeHandle, PAGE_SIZE, type ProfileInput } from "@/lib/campaign-social";

/**
 * Campaign profiles (S1), server side. Every write is scoped to the actor's
 * organization here (the pages and actions check the role first, through
 * the access map) and audited. The public loaders return a profile only
 * while it's published and its organization is approved by Turfcut, the
 * same rule the database's read policy applies.
 */

type Actor = { profileId: string; orgId: string };
/** A post writer: owners and publishers manage every post and the talking points; recruiters their own unpinned posts. */
type Writer = Actor & { manages: boolean };
type Result<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; reason: string; errors?: Record<string, string> };

const PROFILE_SELECT = {
  id: true, orgId: true, handle: true, displayName: true, bio: true, avatarKey: true, headerKey: true, publishedAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.CampaignProfileSelect;
export type CampaignProfileRow = Prisma.CampaignProfileGetPayload<{ select: typeof PROFILE_SELECT }>;

const lock = (tx: Prisma.TransactionClient, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
const handleTaken = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const TAKEN = { ok: false as const, reason: "Fix the highlighted fields.", errors: { handle: "That handle is taken. Pick another." } };
/**
 * Whether a handle was ever another campaign's public address: it stays
 * retired, so old links and printed QR codes never lead to someone else
 * (S1 review). A draft's handle that was never public is free again once
 * the draft lets it go. Read from the audit trail, which records the handle
 * on every publish.
 */
async function handleRetired(tx: Prisma.TransactionClient, handle: string, campaignId: string | null): Promise<boolean> {
  const used = await tx.auditEvent.findFirst({
    where: { entityType: "CampaignProfile", action: "campaign.published", metadata: { path: ["handle"], equals: handle }, ...(campaignId ? { NOT: { entityId: campaignId } } : {}) },
    select: { id: true },
  });
  return !!used;
}

/** The organization's campaigns, drafts included, newest first. */
export function listOrgCampaigns(orgId: string) {
  return db().campaignProfile.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, select: PROFILE_SELECT });
}

/** One of the organization's campaigns, or null (another organization's reads as missing). */
export function loadOrgCampaign(orgId: string, id: string) {
  if (!UUID_RE.test(id)) return Promise.resolve(null);
  return db().campaignProfile.findFirst({ where: { id, orgId }, select: PROFILE_SELECT });
}

/** A campaign's public profile by handle, or null while it's a draft or its organization isn't approved. */
export function loadPublicCampaign(handle: string) {
  let h: string;
  try {
    h = normalizeHandle(decodeURIComponent(handle));
  } catch {
    return Promise.resolve(null); // a malformed address is simply not found
  }
  return db().campaignProfile.findFirst({ where: { handle: h, publishedAt: { not: null }, org: { approved: true } }, select: PROFILE_SELECT });
}

/** New campaigns and handle changes are rate-limited per organization, whoever calls (page or API). */
async function campaignGate(orgId: string): Promise<{ ok: false; reason: string } | null> {
  const verdict = await check("campaign", orgId);
  if (verdict === "ok") return null;
  if (verdict === "unavailable") return { ok: false, reason: "Saving is briefly unavailable. Try again in a minute." };
  return { ok: false, reason: `Your organization has made many campaign changes today. Try again in ${waitText(await retryAfter("campaign", orgId), "hour")}.` };
}

export async function createCampaign(actor: Actor, input: ProfileInput): Promise<Result<{ id: string }>> {
  const gate = await campaignGate(actor.orgId);
  if (gate) return gate;
  try {
    return await db().$transaction(async (tx) => {
      await lock(tx, `campaigns:${actor.orgId}`);
      if ((await tx.campaignProfile.count({ where: { orgId: actor.orgId } })) >= MAX_CAMPAIGNS_PER_ORG) {
        return { ok: false as const, reason: `An organization runs up to ${MAX_CAMPAIGNS_PER_ORG} campaigns. Ask Turfcut if you need more.` };
      }
      if (await handleRetired(tx, input.handle, null)) return TAKEN;
      const c = await tx.campaignProfile.create({ data: { orgId: actor.orgId, ...input }, select: { id: true } });
      await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "campaign.created", entityType: "CampaignProfile", entityId: c.id, metadata: { handle: input.handle } } });
      return { ok: true as const, id: c.id };
    });
  } catch (e) {
    if (handleTaken(e)) return TAKEN;
    throw e;
  }
}

/** Edits the profile. The handle is the public address: it can change only while the campaign is a draft. */
export async function updateCampaign(actor: Actor, id: string, input: ProfileInput): Promise<Result> {
  if (!UUID_RE.test(id)) return { ok: false, reason: "Campaign not found." };
  const before = await db().campaignProfile.findFirst({ where: { id, orgId: actor.orgId }, select: { handle: true } });
  if (before && before.handle !== input.handle) {
    const gate = await campaignGate(actor.orgId);
    if (gate) return gate;
  }
  try {
    return await db().$transaction(async (tx) => {
      await lock(tx, `campaign:${id}`);
      const c = await tx.campaignProfile.findFirst({ where: { id, orgId: actor.orgId }, select: { handle: true } });
      if (!c) return { ok: false as const, reason: "Campaign not found." };
      if (c.handle !== input.handle) {
        // Once a campaign has been public its handle is its address for good: links and printed codes point at it.
        const everPublic = await tx.auditEvent.findFirst({ where: { entityType: "CampaignProfile", entityId: id, action: "campaign.published" }, select: { id: true } });
        if (everPublic) return { ok: false as const, reason: "Fix the highlighted fields.", errors: { handle: "The handle can't change once the campaign has been public: links to it would break." } };
        if (await handleRetired(tx, input.handle, id)) return TAKEN;
      }
      await tx.campaignProfile.update({ where: { id }, data: input });
      await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "campaign.updated", entityType: "CampaignProfile", entityId: id, metadata: { handle: input.handle } } });
      return { ok: true as const };
    });
  } catch (e) {
    if (handleTaken(e)) return TAKEN;
    throw e;
  }
}

/**
 * Publishes or unpublishes. A campaign goes public only while Turfcut has
 * approved its organization (the impersonation guard, S1 decision 3).
 */
export async function setCampaignPublished(actor: Actor, id: string, publish: boolean, now = new Date()): Promise<Result> {
  if (!UUID_RE.test(id)) return { ok: false, reason: "Campaign not found." };
  return db().$transaction(async (tx) => {
    await lock(tx, `campaign:${id}`);
    const c = await tx.campaignProfile.findFirst({ where: { id, orgId: actor.orgId }, select: { handle: true, publishedAt: true, org: { select: { approved: true } } } });
    if (!c) return { ok: false as const, reason: "Campaign not found." };
    if (publish && !c.org.approved) return { ok: false as const, reason: "Turfcut hasn't approved your organization yet. A campaign can go public once it has." };
    if (!!c.publishedAt === publish) return { ok: true as const };
    await tx.campaignProfile.update({ where: { id }, data: { publishedAt: publish ? now : null } });
    // The handle goes on the record: once public, it's this campaign's address for good (handleRetired).
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: publish ? "campaign.published" : "campaign.unpublished", entityType: "CampaignProfile", entityId: id, metadata: { handle: c.handle } } });
    return { ok: true as const };
  });
}

/** Replaces the campaign's avatar or header image (the old file is removed once the new one is recorded). */
export async function setCampaignImage(actor: Actor, id: string, kind: MediaKind, bytes: Uint8Array, store: MediaStore): Promise<Result> {
  if (!UUID_RE.test(id)) return { ok: false, reason: "Campaign not found." };
  const img = checkImage(bytes);
  if (!img.ok) return { ok: false, reason: img.reason };
  const owned = await db().campaignProfile.findFirst({ where: { id, orgId: actor.orgId }, select: { id: true } });
  if (!owned) return { ok: false, reason: "Campaign not found." };
  const key = `${id}/${kind}-${crypto.randomUUID()}.${img.ext}`;
  await store.put(key, img.bytes, img.type);
  const field = kind === "avatar" ? "avatarKey" : "headerKey";
  let old: string | null | undefined;
  try {
    old = await db().$transaction(async (tx) => {
    await lock(tx, `campaign:${id}`);
    const c = await tx.campaignProfile.findFirst({ where: { id, orgId: actor.orgId }, select: { avatarKey: true, headerKey: true } });
    if (!c) return undefined;
    await tx.campaignProfile.update({ where: { id }, data: { [field]: key } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: `campaign.${kind}_changed`, entityType: "CampaignProfile", entityId: id } });
    return c[field];
    });
  } catch (e) {
    // Recording failed: the file just stored would be orphaned in a public bucket.
    await store.remove(key);
    throw e;
  }
  if (old === undefined) {
    await store.remove(key);
    return { ok: false, reason: "Campaign not found." };
  }
  if (old) await store.remove(old);
  return { ok: true };
}

/** Takes the image down. */
export async function clearCampaignImage(actor: Actor, id: string, kind: MediaKind, store: MediaStore): Promise<Result> {
  if (!UUID_RE.test(id)) return { ok: false, reason: "Campaign not found." };
  const field = kind === "avatar" ? "avatarKey" : "headerKey";
  const old = await db().$transaction(async (tx) => {
    await lock(tx, `campaign:${id}`);
    const c = await tx.campaignProfile.findFirst({ where: { id, orgId: actor.orgId }, select: { avatarKey: true, headerKey: true } });
    if (!c) return undefined;
    if (c[field]) {
      await tx.campaignProfile.update({ where: { id }, data: { [field]: null } });
      await tx.auditEvent.create({ data: { actorId: actor.profileId, action: `campaign.${kind}_removed`, entityType: "CampaignProfile", entityId: id } });
    }
    return c[field];
  });
  if (old === undefined) return { ok: false, reason: "Campaign not found." };
  if (old) await store.remove(old);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Posts (S1.3)
// ---------------------------------------------------------------------------


/** What an embedded job's card shows: read from the job as it is now, server-side (never the post's word). */
const EMBED_SELECT = {
  id: true, orgId: true, title: true, type: true, status: true, startsAt: true, endsAt: true, compensationMethod: true, payRateCents: true, geography: true, campaignDisclosure: true,
} satisfies Prisma.JobSelect;
const POST_SELECT = {
  id: true, profileId: true, body: true, pinnedAt: true, createdAt: true, editedAt: true, jobId: true,
  job: { select: EMBED_SELECT },
} satisfies Prisma.CampaignPostSelect;
export type PostRow = Prisma.CampaignPostGetPayload<{ select: typeof POST_SELECT }>;
/** A post as the public sees it: an embedded job only while it's still published or paused (a draft or closed job shows as "no longer hiring", without its details). */
export type PublicPost = Omit<PostRow, "job"> & { job: PostRow["job"] | null; jobGone: boolean };
const publicPost = (p: PostRow): PublicPost => {
  const live = p.job && (p.job.status === "PUBLISHED" || p.job.status === "PAUSED");
  return { ...p, job: live ? p.job : null, jobGone: !!p.jobId && !live };
};

type PostInput = { body: string; jobId: string | null };

/** The organization's own published jobs, for the composer's embed picker. */
export function embeddableJobs(orgId: string) {
  return db().job.findMany({ where: { orgId, status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, select: { id: true, title: true }, take: 100 });
}

async function checkEmbed(tx: Prisma.TransactionClient, orgId: string, jobId: string | null): Promise<string | null> {
  if (!jobId) return null;
  if (!UUID_RE.test(jobId)) return "Pick one of your organization's jobs.";
  return embedProblem(await tx.job.findUnique({ where: { id: jobId }, select: { orgId: true, status: true } }), orgId);
}

/** Writes a post on one of the organization's campaigns (its first revision is the post as written). */
export async function createPost(actor: Actor, campaignId: string, input: PostInput, now = new Date()): Promise<Result<{ id: string }>> {
  if (!UUID_RE.test(campaignId)) return { ok: false, reason: "Campaign not found." };
  return db().$transaction(async (tx) => {
    const c = await tx.campaignProfile.findFirst({ where: { id: campaignId, orgId: actor.orgId }, select: { id: true } });
    if (!c) return { ok: false as const, reason: "Campaign not found." };
    const bad = await checkEmbed(tx, actor.orgId, input.jobId);
    if (bad) return { ok: false as const, reason: bad, errors: { jobId: bad } };
    const p = await tx.campaignPost.create({ data: { profileId: c.id, authorId: actor.profileId, body: input.body, jobId: input.jobId, createdAt: now }, select: { id: true } });
    await tx.campaignPostRevision.create({ data: { postId: p.id, body: input.body, jobId: input.jobId, editorId: actor.profileId, createdAt: now } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "campaign.post_created", entityType: "CampaignPost", entityId: p.id, metadata: { campaignId: c.id, jobId: input.jobId }, createdAt: now } });
    return { ok: true as const, id: p.id };
  });
}

/** A live post of the organization's, under its campaign's lock. */
async function ownPost(tx: Prisma.TransactionClient, orgId: string, postId: string) {
  const p = await tx.campaignPost.findFirst({ where: { id: postId, profile: { orgId } }, select: { id: true, profileId: true } });
  if (!p) return null;
  await lock(tx, `campaign:${p.profileId}`);
  return tx.campaignPost.findFirst({ where: { id: postId, deletedAt: null }, select: { id: true, profileId: true, authorId: true, body: true, jobId: true, pinnedAt: true } });
}

/** Why this writer can't change this post, or null: talking points and other people's posts are the managers'. */
function writeProblem(w: Writer, p: { pinnedAt: Date | null; authorId: string }): string | null {
  if (w.manages) return null;
  if (p.pinnedAt) return "This post is a talking point: an owner or publisher changes it.";
  if (p.authorId !== w.profileId) return "Only an owner or publisher changes someone else's post.";
  return null;
}

/**
 * Edits a post: the text and embed are replaced and the new version is
 * recorded as a revision (every earlier one stays). Keeping an embed whose
 * job has since closed is fine; a new embed has to be a published job.
 */
export async function editPost(actor: Writer, postId: string, input: { body: string; jobId?: string | null }, now = new Date()): Promise<Result> {
  if (!UUID_RE.test(postId)) return { ok: false, reason: "Post not found." };
  return db().$transaction(async (tx) => {
    const found = await ownPost(tx, actor.orgId, postId);
    if (!found) return { ok: false as const, reason: "Post not found." };
    const p = found;
    const denied = writeProblem(actor, p);
    if (denied) return { ok: false as const, reason: denied };
    // No jobId given (an API caller sending only the text): the embed stays as it is.
    input = { body: input.body, jobId: input.jobId === undefined ? p.jobId : input.jobId };
    if (p.body === input.body && p.jobId === input.jobId) return { ok: true as const };
    if (input.jobId !== p.jobId) {
      const bad = await checkEmbed(tx, actor.orgId, input.jobId ?? null);
      if (bad) return { ok: false as const, reason: bad, errors: { jobId: bad } };
    }
    await tx.campaignPost.update({ where: { id: p.id }, data: { body: input.body, jobId: input.jobId ?? null, editedAt: now } });
    await tx.campaignPostRevision.create({ data: { postId: p.id, body: input.body, jobId: input.jobId ?? null, editorId: actor.profileId, createdAt: now } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "campaign.post_edited", entityType: "CampaignPost", entityId: p.id, createdAt: now } });
    return { ok: true as const };
  });
}

/** Takes a post down: hidden everywhere, unpinned, and kept with its revisions (who deleted it is recorded). */
export async function deletePost(actor: Writer, postId: string, now = new Date()): Promise<Result> {
  if (!UUID_RE.test(postId)) return { ok: false, reason: "Post not found." };
  return db().$transaction(async (tx) => {
    const p = await ownPost(tx, actor.orgId, postId);
    if (!p) return { ok: false as const, reason: "Post not found." };
    const denied = writeProblem(actor, p);
    if (denied) return { ok: false as const, reason: denied };
    await tx.campaignPost.update({ where: { id: p.id }, data: { deletedAt: now, deletedById: actor.profileId, pinnedAt: null } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "campaign.post_deleted", entityType: "CampaignPost", entityId: p.id, createdAt: now } });
    return { ok: true as const };
  });
}

/**
 * Pins or unpins a post. Pinned posts are the campaign's talking points:
 * at most MAX_PINNED, counted under the campaign's lock.
 */
export async function setPostPinned(actor: Actor, postId: string, pin: boolean, now = new Date()): Promise<Result> {
  if (!UUID_RE.test(postId)) return { ok: false, reason: "Post not found." };
  return db().$transaction(async (tx) => {
    const p = await ownPost(tx, actor.orgId, postId);
    if (!p) return { ok: false as const, reason: "Post not found." };
    if (!!p.pinnedAt === pin) return { ok: true as const };
    if (pin) {
      const pinned = await tx.campaignPost.count({ where: { profileId: p.profileId, deletedAt: null, pinnedAt: { not: null } } });
      if (pinned >= MAX_PINNED) return { ok: false as const, reason: `A campaign pins up to ${MAX_PINNED} talking points. Unpin one first.` };
    }
    await tx.campaignPost.update({ where: { id: p.id }, data: { pinnedAt: pin ? now : null } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: pin ? "campaign.post_pinned" : "campaign.post_unpinned", entityType: "CampaignPost", entityId: p.id, createdAt: now } });
    return { ok: true as const };
  });
}

/** Live posts of a campaign, newest first (time is the only order), a page at a time. */
export async function loadPosts(campaignId: string, cursor?: string | null): Promise<{ posts: PublicPost[]; next: string | null }> {
  const after = decodeCursor(cursor);
  const rows = await db().campaignPost.findMany({
    where: {
      profileId: campaignId,
      deletedAt: null,
      ...(after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    select: POST_SELECT,
  });
  const page = rows.slice(0, PAGE_SIZE);
  return { posts: page.map(publicPost), next: rows.length > PAGE_SIZE ? encodeCursor(page[page.length - 1]) : null };
}

/** The campaign's pinned talking points, in the order they were pinned. */
export async function loadPinned(campaignId: string): Promise<PublicPost[]> {
  const rows = await db().campaignPost.findMany({ where: { profileId: campaignId, deletedAt: null, pinnedAt: { not: null } }, orderBy: { pinnedAt: "asc" }, take: MAX_PINNED, select: POST_SELECT });
  return rows.map(publicPost);
}

/** One live post on a public campaign, for its permalink. */
export async function loadPublicPost(handle: string, postId: string) {
  if (!UUID_RE.test(postId)) return null;
  const c = await loadPublicCampaign(handle);
  if (!c) return null;
  const p = await db().campaignPost.findFirst({ where: { id: postId, profileId: c.id, deletedAt: null }, select: POST_SELECT });
  return p ? { campaign: c, post: publicPost(p) } : null;
}

/** A post's versions, oldest first, for the organization's own view. */
export function loadRevisions(orgId: string, postId: string) {
  if (!UUID_RE.test(postId)) return Promise.resolve([]);
  return db().campaignPostRevision.findMany({ where: { postId, post: { profile: { orgId } } }, orderBy: { createdAt: "asc" }, select: { id: true, body: true, createdAt: true } });
}

// ---------------------------------------------------------------------------
// Jobs a campaign works for (S1.4): their shifts are briefed with its talking points.
// ---------------------------------------------------------------------------

/** The organization's jobs, with the campaign each works for (for the campaign page's picker). */
export function orgJobsForLinking(orgId: string) {
  return db().job.findMany({
    where: { orgId, status: { not: "CLOSED" } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, title: true, status: true, campaignProfileId: true },
  });
}

/** Links one of the organization's jobs to one of its campaigns, or unlinks it (campaignId null). */
export async function setJobCampaign(actor: Actor, jobId: string, campaignId: string | null): Promise<Result> {
  if (!UUID_RE.test(jobId) || (campaignId !== null && !UUID_RE.test(campaignId))) return { ok: false, reason: "Not found." };
  return db().$transaction(async (tx) => {
    await lock(tx, `job:${jobId}`);
    const job = await tx.job.findFirst({ where: { id: jobId, orgId: actor.orgId }, select: { campaignProfileId: true } });
    if (!job) return { ok: false as const, reason: "Job not found." };
    if (campaignId && !(await tx.campaignProfile.findFirst({ where: { id: campaignId, orgId: actor.orgId }, select: { id: true } }))) return { ok: false as const, reason: "Campaign not found." };
    if (job.campaignProfileId === campaignId) return { ok: true as const };
    await tx.job.update({ where: { id: jobId }, data: { campaignProfileId: campaignId } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "job.campaign_set", entityType: "Job", entityId: jobId, metadata: { from: job.campaignProfileId, to: campaignId } } });
    return { ok: true as const };
  });
}
