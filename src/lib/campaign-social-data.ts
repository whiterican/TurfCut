import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { checkImage, type MediaKind, type MediaStore } from "@/lib/campaign-media";
import type { ProfileInput } from "@/lib/campaign-social";

/**
 * Campaign profiles (S1), server side. Every write is scoped to the actor's
 * organization here (the pages and actions check the role first, through
 * the access map) and audited. The public loaders return a profile only
 * while it's published and its organization is approved by Turfcut, the
 * same rule the database's read policy applies.
 */

type Actor = { profileId: string; orgId: string };
type Result<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; reason: string; errors?: Record<string, string> };

const PROFILE_SELECT = {
  id: true, orgId: true, handle: true, displayName: true, bio: true, avatarKey: true, headerKey: true, publishedAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.CampaignProfileSelect;
export type CampaignProfileRow = Prisma.CampaignProfileGetPayload<{ select: typeof PROFILE_SELECT }>;

const lock = (tx: Prisma.TransactionClient, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
const handleTaken = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const TAKEN = { ok: false as const, reason: "Fix the highlighted fields.", errors: { handle: "That handle is taken. Pick another." } };

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
  return db().campaignProfile.findFirst({ where: { handle: handle.toLowerCase(), publishedAt: { not: null }, org: { approved: true } }, select: PROFILE_SELECT });
}

export async function createCampaign(actor: Actor, input: ProfileInput): Promise<Result<{ id: string }>> {
  try {
    return await db().$transaction(async (tx) => {
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
  try {
    return await db().$transaction(async (tx) => {
      await lock(tx, `campaign:${id}`);
      const c = await tx.campaignProfile.findFirst({ where: { id, orgId: actor.orgId }, select: { handle: true, publishedAt: true } });
      if (!c) return { ok: false as const, reason: "Campaign not found." };
      if (c.publishedAt && c.handle !== input.handle) {
        return { ok: false as const, reason: "Fix the highlighted fields.", errors: { handle: "The handle can't change once the campaign is public: links to it would break. Unpublish to change it." } };
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
    const c = await tx.campaignProfile.findFirst({ where: { id, orgId: actor.orgId }, select: { publishedAt: true, org: { select: { approved: true } } } });
    if (!c) return { ok: false as const, reason: "Campaign not found." };
    if (publish && !c.org.approved) return { ok: false as const, reason: "Turfcut hasn't approved your organization yet. A campaign can go public once it has." };
    if (!!c.publishedAt === publish) return { ok: true as const };
    await tx.campaignProfile.update({ where: { id }, data: { publishedAt: publish ? now : null } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: publish ? "campaign.published" : "campaign.unpublished", entityType: "CampaignProfile", entityId: id } });
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
  await store.put(key, bytes, img.type);
  const field = kind === "avatar" ? "avatarKey" : "headerKey";
  const old = await db().$transaction(async (tx) => {
    await lock(tx, `campaign:${id}`);
    const c = await tx.campaignProfile.findFirst({ where: { id, orgId: actor.orgId }, select: { avatarKey: true, headerKey: true } });
    if (!c) return undefined;
    await tx.campaignProfile.update({ where: { id }, data: { [field]: key } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: `campaign.${kind}_changed`, entityType: "CampaignProfile", entityId: id } });
    return c[field];
  });
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
