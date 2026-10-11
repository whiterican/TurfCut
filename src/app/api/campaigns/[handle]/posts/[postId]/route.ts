import { loadPublicPost } from "@/lib/campaign-social-data";
import { postJson } from "@/lib/campaign-api";

/** GET /api/campaigns/:handle/posts/:postId — one live post. Public. */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string; postId: string }> }) {
  const { handle, postId } = await params;
  const r = await loadPublicPost(handle, postId);
  return r ? Response.json({ post: postJson(r.post) }) : Response.json({ error: "Not found." }, { status: 404 });
}
