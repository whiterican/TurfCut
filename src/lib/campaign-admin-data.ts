import { db } from "@/lib/db";

/**
 * The organizations behind campaign profiles whose handle starts with `q`
 * (M10.4, the console's people lookup). Reads the handle only; nothing here
 * ranks or feeds matching.
 */
export async function orgIdsByCampaignHandle(q: string, limit = 10): Promise<string[]> {
  const handle = q.replace(/^@/, "").trim().toLowerCase();
  if (!handle) return [];
  const rows = await db().campaignProfile.findMany({ where: { handle: { startsWith: handle } }, select: { orgId: true }, take: limit });
  return [...new Set(rows.map((r) => r.orgId))];
}
