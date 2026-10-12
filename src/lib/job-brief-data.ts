import { db } from "@/lib/db";
import { MAX_PINNED } from "@/lib/campaign-social";
import { loadFacts, listResources, type Fact, type Resource } from "@/lib/campaign-kit-data";

/**
 * The shift brief (S1, S4): the pinned posts of the campaign a job works
 * for, verbatim, each with when it was last written and its supporting
 * facts, plus the campaign's scripts, common questions and guides (every
 * audience: the brief is for the workers on the job and their field staff).
 * Nothing else about the campaign, and nothing about the worker, is read or
 * recorded here.
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
          id: true,
          posts: { where: { deletedAt: null, pinnedAt: { not: null } }, orderBy: { pinnedAt: "asc" }, take: MAX_PINNED, select: { id: true, body: true, createdAt: true, editedAt: true } },
        },
      },
    },
  });
  const c = job?.campaignProfile;
  if (!c) return null;
  const [facts, resources] = await Promise.all([loadFacts(c.posts.map((p) => p.id)), listResources(c.id, "ALL")]);
  return {
    displayName: c.displayName,
    handle: c.handle,
    isPublic: !!c.publishedAt,
    points: c.posts.map((p) => ({ id: p.id, body: p.body, writtenAt: p.editedAt ?? p.createdAt, facts: (facts.get(p.id) ?? []) as Fact[] })),
    resources: resources as Resource[],
  };
}
