import { failureResponse } from "@/lib/api-errors";
import { apiArea, badId, resultResponse } from "@/lib/api-session";
import { validateProfile } from "@/lib/campaign-social";
import { setCampaignPublished, updateCampaign } from "@/lib/campaign-social-data";

/**
 * PUT /api/campaign/:id { handle, displayName, bio, published? } — edits one
 * of the organization's campaigns (owners and publishers). `published`
 * publishes or unpublishes it (publishing needs Turfcut's approval).
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bad = badId(id);
  if (bad) return bad;
  const auth = await apiArea("campaigns");
  if ("error" in auth) return auth.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const actor = { profileId: auth.session.userId, orgId: auth.session.orgId };
  const v = validateProfile(b);
  if (!v.ok) return Response.json({ error: "Fix the fields.", errors: v.errors }, { status: 400 });
  const r = await updateCampaign(actor, id, v.value);
  if (!r.ok) return failureResponse(r);
  if (typeof b.published === "boolean") return resultResponse(await setCampaignPublished(actor, id, b.published));
  return Response.json({ ok: true });
}
