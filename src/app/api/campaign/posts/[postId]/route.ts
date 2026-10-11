import { apiOrgRole, badId, resultResponse } from "@/lib/api-session";
import { rolesFor } from "@/lib/access";
import { validatePostBody } from "@/lib/campaign-social";
import { deletePost, editPost } from "@/lib/campaign-social-data";

/** PATCH /api/campaign/posts/:postId { body, jobId? } — edits a post (a new revision). */
export async function PATCH(req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const bad = badId(postId);
  if (bad) return bad;
  const auth = await apiOrgRole(rolesFor("campaignPosting", "full"));
  if ("error" in auth) return auth.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const body = validatePostBody(b.body);
  if (!body.ok) return Response.json({ error: body.error }, { status: 400 });
  const jobId = typeof b.jobId === "string" && b.jobId ? b.jobId : null;
  return resultResponse(await editPost({ profileId: auth.session.userId, orgId: auth.session.orgId }, postId, { body: body.value, jobId }));
}

/** DELETE /api/campaign/posts/:postId — takes a post down (kept on record). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const bad = badId(postId);
  if (bad) return bad;
  const auth = await apiOrgRole(rolesFor("campaignPosting", "full"));
  if ("error" in auth) return auth.error;
  return resultResponse(await deletePost({ profileId: auth.session.userId, orgId: auth.session.orgId }, postId));
}
