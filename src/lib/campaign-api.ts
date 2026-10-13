import { mediaUrl } from "@/lib/campaign-media";
import type { CampaignProfileRow, DirectoryRow, PublicPost } from "@/lib/campaign-social-data";
import { excerpt } from "@/lib/campaign-social";
import { getSiteUrl } from "@/lib/env";
import type { Metadata } from "next";

/**
 * The campaign layer's JSON (S1): exactly what the public pages show, no
 * more (never organization ids, authors or who deleted what). An embedded
 * job is its public card: title, place, dates, type, pay, and whether it's
 * open.
 */
export function profileJson(c: CampaignProfileRow) {
  return { handle: c.handle, displayName: c.displayName, bio: c.bio, avatarUrl: mediaUrl(c.avatarKey), headerUrl: mediaUrl(c.headerKey), publishedAt: c.publishedAt };
}

export function postJson(p: PublicPost) {
  const geo = (p.job?.geography ?? {}) as { city?: string; state?: string };
  return {
    id: p.id,
    body: p.body,
    pinned: !!p.pinnedAt,
    createdAt: p.createdAt,
    editedAt: p.editedAt,
    job: p.job
      ? { id: p.job.id, title: p.job.title, type: p.job.type, status: p.job.status, startsAt: p.job.startsAt, endsAt: p.job.endsAt, city: geo.city ?? null, state: geo.state ?? null, compensationMethod: p.job.compensationMethod, payRateCents: p.job.payRateCents }
      : null,
    jobNoLongerHiring: p.jobGone,
  };
}

/** A directory row (S3): the public profile fields, when it last posted, and how many of its jobs are hiring. */
export function directoryJson(c: DirectoryRow) {
  return { handle: c.handle, displayName: c.displayName, bio: excerpt(c.bio), avatarUrl: mediaUrl(c.avatarKey), lastPostAt: c.lastPostAt, hiring: c.hiring };
}

/**
 * What a shared link shows before it's opened (S3): the campaign's own name
 * and words, and its own image. Turfcut adds nothing of its own about it.
 * Absolute URLs need SITE_URL; without it (development) the images are left
 * out rather than pointed at the wrong host.
 */
export function campaignPreview(c: { handle: string; displayName: string; bio: string; avatarKey: string | null; headerKey: string | null }, post?: { id: string; body: string }) {
  const site = getSiteUrl();
  const path = post ? `/c/${c.handle}/p/${post.id}` : `/c/${c.handle}`;
  const title = post ? `${c.displayName} (@${c.handle}) on Turfcut` : `${c.displayName} (@${c.handle})`;
  const description = excerpt(post ? post.body : c.bio) || `A campaign on Turfcut.`;
  const image = mediaUrl(c.headerKey) ?? mediaUrl(c.avatarKey);
  const type = post ? ("article" as const) : ("profile" as const);
  const card = image ? ("summary_large_image" as const) : ("summary" as const);
  return {
    title,
    description,
    ...(site ? { alternates: { canonical: `${site}${path}` } } : {}),
    openGraph: { title, description, type, siteName: "Turfcut", ...(site ? { url: `${site}${path}` } : {}), ...(image ? { images: [{ url: image }] } : {}) },
    twitter: { card, title, description, ...(image ? { images: [image] } : {}) },
  } satisfies Metadata;
}

