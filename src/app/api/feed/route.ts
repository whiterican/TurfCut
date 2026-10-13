import type { NextRequest } from "next/server";
import { apiWorker } from "@/lib/api-session";
import { loadHomeFeed } from "@/lib/campaign-follow-data";
import { postJson } from "@/lib/campaign-api";

/** GET /api/feed?cursor= — the signed-in worker's home feed, newest first, 20 a page; `sources` is how many campaigns it draws from. */
export async function GET(req: NextRequest) {
  const auth = await apiWorker();
  if ("error" in auth) return auth.error;
  const { posts, next, sources } = await loadHomeFeed(auth.session.workerId, req.nextUrl.searchParams.get("cursor"));
  return Response.json({ posts: posts.map((p) => ({ ...postJson(p), campaign: { handle: p.campaign.handle, displayName: p.campaign.displayName }, reason: p.reason, liked: p.liked })), next, sources });
}
