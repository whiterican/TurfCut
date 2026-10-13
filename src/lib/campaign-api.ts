import { mediaUrl } from "@/lib/campaign-media";
import type { CampaignProfileRow, PublicPost } from "@/lib/campaign-social-data";

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
