import { apiWorker, badId, resultResponse } from "@/lib/api-session";
import { followState, setFollow } from "@/lib/campaign-follow-data";

/** GET /api/feed/follows/:campaignId — whether the signed-in worker follows the campaign, and with notices. */
export async function GET(_req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const bad = badId(campaignId);
  if (bad) return bad;
  const auth = await apiWorker();
  if ("error" in auth) return auth.error;
  return Response.json(await followState(auth.session.workerId, campaignId));
}

/** PUT /api/feed/follows/:campaignId { following, notify? } — follow, unfollow, or change notices. */
export async function PUT(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const bad = badId(campaignId);
  if (bad) return bad;
  const auth = await apiWorker();
  if ("error" in auth) return auth.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as { following?: unknown; notify?: unknown };
  if (typeof b.following !== "boolean" || (b.notify !== undefined && typeof b.notify !== "boolean")) {
    return Response.json({ error: "Send { following: true | false, notify?: true | false }." }, { status: 400 });
  }
  return resultResponse(await setFollow(auth.session.workerId, campaignId, { follow: b.following, notify: b.notify }));
}
