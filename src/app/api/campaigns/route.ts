import type { NextRequest } from "next/server";
import { listPublicCampaigns } from "@/lib/campaign-social-data";
import { directoryJson } from "@/lib/campaign-api";

/** GET /api/campaigns?q=&cursor= — the public directory: campaigns that posted most recently first, 20 a page; `q` matches a name or handle. Public. */
export async function GET(req: NextRequest) {
  const { campaigns, next, q } = await listPublicCampaigns({ cursor: req.nextUrl.searchParams.get("cursor"), q: req.nextUrl.searchParams.get("q") });
  return Response.json({ campaigns: campaigns.map(directoryJson), next, q });
}
