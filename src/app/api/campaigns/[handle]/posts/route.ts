import type { NextRequest } from "next/server";
import { loadPosts, loadPublicCampaign } from "@/lib/campaign-social-data";
import { postJson } from "@/lib/campaign-api";

/** GET /api/campaigns/:handle/posts?cursor= — live posts, newest first, 20 a page. Public. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ handle: string }> }) {
  const c = await loadPublicCampaign((await params).handle);
  if (!c) return Response.json({ error: "Not found." }, { status: 404 });
  const { posts, next } = await loadPosts(c.id, req.nextUrl.searchParams.get("cursor"));
  return Response.json({ posts: posts.map(postJson), next });
}
