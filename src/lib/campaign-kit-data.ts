import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { MAX_FACTS, MAX_RESOURCES, nextPosition, type FactInput, type ResourceAudience, type ResourceInput, type ResourceKind } from "@/lib/campaign-kit";

/**
 * The briefing kit (S4), server side: supporting facts behind talking
 * points and campaign resources. Every write is by one of the campaign's
 * managers (owners and publishers), scoped to their organization under the
 * campaign's lock, and audited. Reads give the campaign's own words only;
 * who wrote them stays with the organization.
 */

type Actor = { profileId: string; orgId: string };
type Result<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; reason: string; errors?: Record<string, string> };
const lock = (tx: Prisma.TransactionClient, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

const FACT_SELECT = { id: true, postId: true, body: true, sourceUrl: true, position: true, updatedAt: true } satisfies Prisma.TalkingPointFactSelect;
export type Fact = Prisma.TalkingPointFactGetPayload<{ select: typeof FACT_SELECT }>;
const RESOURCE_SELECT = { id: true, profileId: true, kind: true, audience: true, title: true, body: true, position: true, updatedAt: true } satisfies Prisma.CampaignResourceSelect;
export type Resource = Prisma.CampaignResourceGetPayload<{ select: typeof RESOURCE_SELECT }>;

// ---------------------------------------------------------------------------
// Supporting facts
// ---------------------------------------------------------------------------

/** The live facts behind these posts, in position order, keyed by post. */
export async function loadFacts(postIds: string[]): Promise<Map<string, Fact[]>> {
  const ids = postIds.filter((id) => UUID_RE.test(id));
  const out = new Map<string, Fact[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return out;
  // Live facts of live talking points only, whatever ids a caller passes (the same rule as the Data API's policy).
  const rows = await db().talkingPointFact.findMany({ where: { postId: { in: ids }, deletedAt: null, post: { deletedAt: null, pinnedAt: { not: null } } }, orderBy: [{ position: "asc" }], select: FACT_SELECT });
  for (const r of rows) out.get(r.postId)?.push(r);
  return out;
}

/** The organization's live talking point (a pinned, live post), under its campaign's lock. */
async function ownTalkingPoint(tx: Prisma.TransactionClient, orgId: string, postId: string) {
  const p = await tx.campaignPost.findFirst({ where: { id: postId, profile: { orgId } }, select: { id: true, profileId: true } });
  if (!p) return null;
  await lock(tx, `campaign:${p.profileId}`);
  return tx.campaignPost.findFirst({ where: { id: postId, deletedAt: null, pinnedAt: { not: null } }, select: { id: true, profileId: true } });
}

export async function addFact(actor: Actor, postId: string, input: FactInput, now = new Date()): Promise<Result<{ id: string; campaignId: string }>> {
  if (!UUID_RE.test(postId)) return { ok: false, reason: "Talking point not found." };
  return db().$transaction(async (tx) => {
    const p = await ownTalkingPoint(tx, actor.orgId, postId);
    if (!p) return { ok: false as const, reason: "Facts go with a pinned talking point. Pin the post first." };
    const taken = (await tx.talkingPointFact.findMany({ where: { postId: p.id, deletedAt: null }, select: { position: true } })).map((f) => f.position);
    const position = nextPosition(taken, MAX_FACTS);
    if (position === null) return { ok: false as const, reason: `A talking point carries up to ${MAX_FACTS} supporting facts. Remove one first.` };
    const f = await tx.talkingPointFact.create({ data: { postId: p.id, body: input.body, sourceUrl: input.sourceUrl, position, authorId: actor.profileId, createdAt: now, updatedAt: now }, select: { id: true } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "campaign.fact_added", entityType: "TalkingPointFact", entityId: f.id, metadata: { postId: p.id, campaignId: p.profileId }, createdAt: now } });
    return { ok: true as const, id: f.id, campaignId: p.profileId };
  });
}

/** The organization's live fact, under its campaign's lock. */
async function ownFact(tx: Prisma.TransactionClient, orgId: string, factId: string) {
  const f = await tx.talkingPointFact.findFirst({ where: { id: factId, post: { profile: { orgId } } }, select: { id: true, post: { select: { profileId: true } } } });
  if (!f) return null;
  await lock(tx, `campaign:${f.post.profileId}`);
  return tx.talkingPointFact.findFirst({ where: { id: factId, deletedAt: null }, select: { id: true, postId: true, body: true, sourceUrl: true, post: { select: { profileId: true } } } });
}

export async function editFact(actor: Actor, factId: string, input: FactInput, now = new Date()): Promise<Result<{ campaignId: string }>> {
  if (!UUID_RE.test(factId)) return { ok: false, reason: "Fact not found." };
  return db().$transaction(async (tx) => {
    const f = await ownFact(tx, actor.orgId, factId);
    if (!f) return { ok: false as const, reason: "Fact not found." };
    if (f.body === input.body && f.sourceUrl === input.sourceUrl) return { ok: true as const, campaignId: f.post.profileId };
    await tx.talkingPointFact.update({ where: { id: f.id }, data: { body: input.body, sourceUrl: input.sourceUrl, updatedAt: now } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "campaign.fact_edited", entityType: "TalkingPointFact", entityId: f.id, metadata: { postId: f.postId, campaignId: f.post.profileId, before: { body: f.body, sourceUrl: f.sourceUrl } }, createdAt: now } });
    return { ok: true as const, campaignId: f.post.profileId };
  });
}

export async function removeFact(actor: Actor, factId: string, now = new Date()): Promise<Result<{ campaignId: string }>> {
  if (!UUID_RE.test(factId)) return { ok: false, reason: "Fact not found." };
  return db().$transaction(async (tx) => {
    const f = await ownFact(tx, actor.orgId, factId);
    if (!f) return { ok: false as const, reason: "Fact not found." };
    await tx.talkingPointFact.update({ where: { id: f.id }, data: { deletedAt: now, updatedAt: now } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "campaign.fact_removed", entityType: "TalkingPointFact", entityId: f.id, metadata: { postId: f.postId, campaignId: f.post.profileId, body: f.body, sourceUrl: f.sourceUrl }, createdAt: now } });
    return { ok: true as const, campaignId: f.post.profileId };
  });
}

// ---------------------------------------------------------------------------
// Resources: scripts, common questions, guides
// ---------------------------------------------------------------------------

/** A campaign's live resources for an audience: PUBLIC ones only, or every one (for the campaign's own workers and staff). */
export function listResources(campaignId: string, audience: "PUBLIC" | "ALL"): Promise<Resource[]> {
  if (!UUID_RE.test(campaignId)) return Promise.resolve([]);
  return db().campaignResource.findMany({
    where: { profileId: campaignId, deletedAt: null, ...(audience === "PUBLIC" ? { audience: "PUBLIC" } : {}) },
    orderBy: [{ kind: "asc" }, { position: "asc" }],
    select: RESOURCE_SELECT,
  });
}

/** The organization's own campaign, under its lock. */
async function ownCampaign(tx: Prisma.TransactionClient, orgId: string, campaignId: string) {
  const c = await tx.campaignProfile.findFirst({ where: { id: campaignId, orgId }, select: { id: true } });
  if (!c) return null;
  await lock(tx, `campaign:${c.id}`);
  return c;
}

export async function createResource(actor: Actor, campaignId: string, input: ResourceInput, now = new Date()): Promise<Result<{ id: string; campaignId: string }>> {
  if (!UUID_RE.test(campaignId)) return { ok: false, reason: "Campaign not found." };
  return db().$transaction(async (tx) => {
    const c = await ownCampaign(tx, actor.orgId, campaignId);
    if (!c) return { ok: false as const, reason: "Campaign not found." };
    const live = await tx.campaignResource.findMany({ where: { profileId: c.id, deletedAt: null }, select: { kind: true, position: true } });
    if (live.length >= MAX_RESOURCES) return { ok: false as const, reason: `A campaign keeps up to ${MAX_RESOURCES} scripts, questions and guides. Remove one first.` };
    const position = nextPosition(live.filter((r) => r.kind === input.kind).map((r) => r.position), 100);
    if (position === null) return { ok: false as const, reason: "Too many of that kind. Remove one first." };
    const r = await tx.campaignResource.create({ data: { profileId: c.id, kind: input.kind, audience: input.audience, title: input.title, body: input.body, position, authorId: actor.profileId, createdAt: now, updatedAt: now }, select: { id: true } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "campaign.resource_created", entityType: "CampaignResource", entityId: r.id, metadata: { campaignId: c.id, kind: input.kind, audience: input.audience }, createdAt: now } });
    return { ok: true as const, id: r.id, campaignId: c.id };
  });
}

async function ownResource(tx: Prisma.TransactionClient, orgId: string, resourceId: string) {
  const r = await tx.campaignResource.findFirst({ where: { id: resourceId, profile: { orgId } }, select: { id: true, profileId: true } });
  if (!r) return null;
  await lock(tx, `campaign:${r.profileId}`);
  return tx.campaignResource.findFirst({ where: { id: resourceId, deletedAt: null }, select: RESOURCE_SELECT });
}

export async function editResource(actor: Actor, resourceId: string, input: ResourceInput, now = new Date()): Promise<Result<{ campaignId: string }>> {
  if (!UUID_RE.test(resourceId)) return { ok: false, reason: "Not found." };
  return db().$transaction(async (tx) => {
    const r = await ownResource(tx, actor.orgId, resourceId);
    if (!r) return { ok: false as const, reason: "Not found." };
    const same = r.kind === input.kind && r.audience === input.audience && r.title === input.title && r.body === input.body;
    if (same) return { ok: true as const, campaignId: r.profileId };
    // A kind change moves it to the end of its new kind.
    let position = r.position;
    if (r.kind !== input.kind) {
      const taken = (await tx.campaignResource.findMany({ where: { profileId: r.profileId, deletedAt: null, kind: input.kind }, select: { position: true } })).map((x) => x.position);
      const next = nextPosition(taken, 100);
      if (next === null) return { ok: false as const, reason: "Too many of that kind. Remove one first." };
      position = next;
    }
    await tx.campaignResource.update({ where: { id: r.id }, data: { kind: input.kind, audience: input.audience, title: input.title, body: input.body, position, updatedAt: now } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "campaign.resource_edited", entityType: "CampaignResource", entityId: r.id, metadata: { campaignId: r.profileId, before: { kind: r.kind, audience: r.audience, title: r.title, body: r.body } }, createdAt: now } });
    return { ok: true as const, campaignId: r.profileId };
  });
}

export async function removeResource(actor: Actor, resourceId: string, now = new Date()): Promise<Result<{ campaignId: string }>> {
  if (!UUID_RE.test(resourceId)) return { ok: false, reason: "Not found." };
  return db().$transaction(async (tx) => {
    const r = await ownResource(tx, actor.orgId, resourceId);
    if (!r) return { ok: false as const, reason: "Not found." };
    await tx.campaignResource.update({ where: { id: r.id }, data: { deletedAt: now, updatedAt: now } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "campaign.resource_removed", entityType: "CampaignResource", entityId: r.id, metadata: { campaignId: r.profileId, kind: r.kind, audience: r.audience, title: r.title, body: r.body }, createdAt: now } });
    return { ok: true as const, campaignId: r.profileId };
  });
}

export type { ResourceAudience, ResourceKind };
