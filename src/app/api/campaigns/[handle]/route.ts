import { loadPinned, loadPublicCampaign } from "@/lib/campaign-social-data";
import { listResources, loadFacts } from "@/lib/campaign-kit-data";
import { factJson, postJson, profileJson, resourceJson } from "@/lib/campaign-api";

/** GET /api/campaigns/:handle — a published campaign's profile, its pinned talking points with their supporting facts, and the resources it shows everyone. Public. */
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const c = await loadPublicCampaign((await params).handle);
  if (!c) return Response.json({ error: "Not found." }, { status: 404 });
  const pinned = await loadPinned(c.id);
  const [facts, resources] = await Promise.all([loadFacts(pinned.map((p) => p.id)), listResources(c.id, "PUBLIC")]);
  return Response.json({
    campaign: profileJson(c),
    pinned: pinned.map((p) => ({ ...postJson(p), facts: (facts.get(p.id) ?? []).map(factJson) })),
    resources: resources.map(resourceJson),
  });
}
