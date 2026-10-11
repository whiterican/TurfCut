import { db } from "@/lib/db";
import { MAX_PINNED } from "@/lib/campaign-social";

/**
 * The shift brief's talking points (S1): the pinned posts of the campaign a
 * job works for, verbatim, each with when it was last written, so a worker
 * reads the campaign's own words before they knock. Nothing else about the
 * campaign, and nothing about the worker, is read or recorded here.
 */
export async function loadTalkingPoints(jobId: string) {
  const job = await db().job.findUnique({
    where: { id: jobId },
    select: {
      campaignProfile: {
        select: {
          handle: true,
          displayName: true,
          publishedAt: true,
          posts: { where: { deletedAt: null, pinnedAt: { not: null } }, orderBy: { pinnedAt: "asc" }, take: MAX_PINNED, select: { id: true, body: true, createdAt: true, editedAt: true } },
        },
      },
    },
  });
  const c = job?.campaignProfile;
  if (!c) return null;
  return {
    displayName: c.displayName,
    handle: c.handle,
    isPublic: !!c.publishedAt,
    points: c.posts.map((p) => ({ id: p.id, body: p.body, writtenAt: p.editedAt ?? p.createdAt })),
  };
}
