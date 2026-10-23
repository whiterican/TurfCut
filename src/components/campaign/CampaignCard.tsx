import Link from "next/link";
import { mediaUrl } from "@/lib/campaign-media";
import type { FollowState } from "@/lib/campaign-follow-data";
import { FollowButton } from "@/components/campaign/FollowButton";
import { VerifiedMark } from "@/components/campaign/VerifiedMark";

/**
 * The campaign a job works for (S2), on the job's page: name, handle and a
 * Follow control. Shown only while the campaign is public, with the same
 * rule as its page (published, organization approved).
 */
export function CampaignCard({ campaign, follow, viewer, back }: { campaign: { id: string; handle: string; displayName: string; avatarKey: string | null; verifiedAt?: Date | null }; follow: FollowState; viewer: "worker" | "guest" | "other"; back: string }) {
  const avatar = mediaUrl(campaign.avatarKey);
  return (
    <section className="card flex flex-wrap items-center justify-between gap-3" aria-label="Campaign">
      <Link href={`/c/${campaign.handle}`} className="flex min-w-0 items-center gap-3">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span aria-hidden className="h-10 w-10 shrink-0 rounded-full bg-surface-2" />
        )}
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-semibold text-fg">
            <span className="truncate">{campaign.displayName}</span>
            {campaign.verifiedAt && <VerifiedMark compact />}
          </span>
          <span className="block truncate text-sm text-muted">@{campaign.handle} · Campaign page</span>
        </span>
      </Link>
      <FollowButton campaignId={campaign.id} state={follow} viewer={viewer} back={back} />
    </section>
  );
}
