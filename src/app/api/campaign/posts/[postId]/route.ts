import { apiOrgRole, badId, resultResponse } from "@/lib/api-session";
import { accessTo, rolesFor } from "@/lib/access";
import { check } from "@/lib/rate-limit";
import { validatePostBody } from "@/lib/campaign-social";
import { deletePost, editPost } from "@/lib/campaign-social-data";

/**
 * PATCH /api/campaign/posts/:postId { body, jobId? } — edits a post (a new
 * revision). Leave jobId out to keep the embed; send null to remove it.
 * Talking points and other people's posts are owners' and publishers'.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const bad = badId(postId);
  if (bad) return bad;
  const auth = await apiOrgRole(rolesFor("campaignPosting", "full"));
  if ("error" in auth) return auth.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const body = validatePostBody(b.body);
  if (!body.ok) return Response.json({ error: body.error }, { status: 400 });
  const jobId = !("jobId" in b) ? undefined : typeof b.jobId === "string" && b.jobId ? b.jobId : null;
  const verdict = await check("post", auth.session.orgId);
  if (verdict !== "ok") return Response.json({ error: "Too many posts this hour." }, { status: verdict === "unavailable" ? 503 : 429 });
  return resultResponse(await editPost({ profileId: auth.session.userId, orgId: auth.session.orgId, manages: accessTo(auth.session.role, "campaigns") === "full" }, postId, { body: body.value, jobId }));
}

/** DELETE /api/campaign/posts/:postId — takes a post down (kept on record). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const bad = badId(postId);
  if (bad) return bad;
  const auth = await apiOrgRole(rolesFor("campaignPosting", "full"));
  if ("error" in auth) return auth.error;
  return resultResponse(await deletePost({ profileId: auth.session.userId, orgId: auth.session.orgId, manages: accessTo(auth.session.role, "campaigns") === "full" }, postId));
}
