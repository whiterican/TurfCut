import { loadPinned, loadPublicCampaign } from "@/lib/campaign-social-data";
import { postJson, profileJson } from "@/lib/campaign-api";

/** GET /api/campaigns/:handle — a published campaign's profile and pinned talking points. Public. */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const c = await loadPublicCampaign((await params).handle);
  if (!c) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json({ campaign: profileJson(c), pinned: (await loadPinned(c.id)).map(postJson) });
}
