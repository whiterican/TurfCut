import { apiArea, badId } from "@/lib/api-session";
import { validatePostBody } from "@/lib/campaign-social";
import { createPost } from "@/lib/campaign-social-data";
import { check } from "@/lib/rate-limit";

/** POST /api/campaign/:id/posts { body, jobId? } — writes a post (owners, publishers, recruiters). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bad = badId(id);
  if (bad) return bad;
  const auth = await apiArea("campaignPosting");
  if ("error" in auth) return auth.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const body = validatePostBody(b.body);
  if (!body.ok) return Response.json({ error: body.error }, { status: 400 });
  const verdict = await check("post", auth.session.orgId);
  if (verdict !== "ok") return Response.json({ error: "Too many posts this hour." }, { status: verdict === "unavailable" ? 503 : 429 });
  const jobId = typeof b.jobId === "string" && b.jobId ? b.jobId : null;
  const r = await createPost({ profileId: auth.session.userId, orgId: auth.session.orgId }, id, { body: body.value, jobId });
  if (!r.ok) return Response.json({ error: r.reason }, { status: /not found/i.test(r.reason) ? 404 : 409 });
  return Response.json({ id: r.id }, { status: 201 });
}
