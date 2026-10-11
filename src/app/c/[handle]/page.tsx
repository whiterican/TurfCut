import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicCampaign } from "@/lib/campaign-social-data";
import { mediaUrl } from "@/lib/campaign-media";
import { CampaignHeader } from "@/components/campaign/CampaignHeader";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await loadPublicCampaign((await params).handle);
  return c ? { title: `${c.displayName} (@${c.handle})` } : { title: "Campaign not found" };
}

/**
 * A campaign's public page (S1): no sign-in needed. Everything on it is the
 * campaign's own words; viewing it records nothing about the viewer.
 */
export default async function PublicCampaignPage({ params }: Props) {
  const c = await loadPublicCampaign((await params).handle);
  if (!c) notFound();
  return (
    <main className="page max-w-2xl space-y-6">
      <CampaignHeader displayName={c.displayName} handle={c.handle} bio={c.bio} avatarUrl={mediaUrl(c.avatarKey)} headerUrl={mediaUrl(c.headerKey)} />
    </main>
  );
}
