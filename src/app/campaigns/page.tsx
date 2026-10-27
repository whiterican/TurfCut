import Link from "next/link";
import { requireArea } from "@/lib/employer-session";
import { canUse } from "@/lib/access";
import { listOrgCampaigns } from "@/lib/campaign-social-data";
import { CampaignProfileForm } from "@/components/campaign/CampaignProfileForm";
import { saveCampaign } from "./actions";
import { Masthead } from "@/components/Masthead";

/** The organization's campaigns: their public profiles and posts (S1). */
export default async function CampaignsPage() {
  const session = await requireArea("campaignPosting");
  const canEdit = canUse(session, "campaigns");
  const campaigns = await listOrgCampaigns(session.orgId);
  return (
    <main className="page max-w-3xl">
      <Masthead title="Your campaigns" meta="Each campaign has a public page: your bio, your posts, and your pinned talking points, which brief your workers before each shift." />

      {campaigns.length > 0 ? (
        <ul className="list-card">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/campaigns/${c.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-fg">{c.displayName}</span>
                  <span className="block text-xs text-muted">@{c.handle}</span>
                </span>
                <span className={c.publishedAt ? "badge-solid" : "badge"}>{c.publishedAt ? "Public" : "Draft"}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="card text-muted-sm">No campaigns yet.{canEdit ? " Create one below." : " An owner or publisher creates them."}</p>
      )}

      {canEdit && (
        <section className="section">
          <h2 className="section-title">New campaign</h2>
          <div className="card">
            <CampaignProfileForm action={saveCampaign} />
          </div>
        </section>
      )}
    </main>
  );
}
