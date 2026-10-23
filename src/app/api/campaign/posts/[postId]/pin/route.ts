import { apiArea, badId, resultResponse } from "@/lib/api-session";
import { setPostPinned } from "@/lib/campaign-social-data";

/** POST /api/campaign/posts/:postId/pin { pinned } — pins or unpins a talking point (owners and publishers). */
export async function POST(req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const bad = badId(postId);
  if (bad) return bad;
  const auth = await apiArea("campaigns");
  if ("error" in auth) return auth.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as { pinned?: unknown };
  if (typeof b.pinned !== "boolean") return Response.json({ error: "Send { pinned: true | false }." }, { status: 400 });
  return resultResponse(await setPostPinned({ profileId: auth.session.userId, orgId: auth.session.orgId }, postId, b.pinned));
}
