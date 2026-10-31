import { db } from "@/lib/db";
import { mediaUrl } from "@/lib/campaign-media";

/**
 * The photographs the job feed shows (#111, screen 2): each job's campaign
 * header, for the jobs whose campaign is published and whose organization
 * Turfcut has approved. Looked up after the feed is built, by the page, so the
 * feed loader (a guarded module: it ranks and filters) never reads the social
 * layer; a picture is never a signal. Jobs with no eligible header are absent
 * from the map and show their category's photograph instead.
 */
export async function jobHeaderUrls(jobIds: string[]): Promise<Map<string, string>> {
  if (jobIds.length === 0) return new Map();
  const rows = await db().job.findMany({
    where: { id: { in: jobIds }, org: { approved: true }, campaignProfile: { publishedAt: { not: null }, headerKey: { not: null } } },
    select: { id: true, campaignProfile: { select: { headerKey: true } } },
  });
  const out = new Map<string, string>();
  for (const r of rows) {
    const url = mediaUrl(r.campaignProfile?.headerKey ?? null);
    if (url) out.set(r.id, url);
  }
  return out;
}
