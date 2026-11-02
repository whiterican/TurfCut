import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { loadPublicPost } from "@/lib/campaign-social-data";
import { likedPostIds } from "@/lib/campaign-follow-data";
import { loadFacts } from "@/lib/campaign-kit-data";
import { PostCard } from "@/components/campaign/PostCard";
import { campaignPreview } from "@/lib/campaign-api";
import { RecordPage } from "@/components/layout/Page";
import { mediaUrl } from "@/lib/campaign-media";
import { VerifiedMark } from "@/components/campaign/VerifiedMark";

type Props = { params: Promise<{ handle: string; postId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, postId } = await params;
  const r = await loadPublicPost(handle, postId);
  return r ? campaignPreview(r.campaign, r.post) : { title: "Post not found" };
}

/** One post's own page (S1), public: the link a campaign shares. */
export default async function PostPage({ params }: Props) {
  const { handle, postId } = await params;
  const [r, session] = await Promise.all([loadPublicPost(handle, postId), getSessionProfile().catch(() => null)]);
  if (!r) notFound();
  const workerId = session?.role === "WORKER" ? session.workerId : null;
  const liked = workerId ? (await likedPostIds(workerId, [r.post.id])).has(r.post.id) : undefined;
  const facts = r.post.pinnedAt ? (await loadFacts([r.post.id])).get(r.post.id) ?? [] : [];
  return (
    <RecordPage gap={6}>
      <h1 className="sr-only">Post by {r.campaign.displayName}</h1>
      <CampaignLine campaign={r.campaign} />
      <PostCard post={r.post} handle={r.campaign.handle} displayName={r.campaign.displayName} verified={!!r.campaign.verifiedAt} signedIn={!!session} liked={liked} facts={facts} variant="page" size="lg" />
      <Link href={`/c/${r.campaign.handle}`} className="link self-start text-sm font-medium">More from {r.campaign.displayName}</Link>
    </RecordPage>
  );
}

/** Who posted it, first: the campaign's avatar (or initials), name and handle, linking to its page. */
function CampaignLine({ campaign: c }: { campaign: { handle: string; displayName: string; avatarKey: string | null; verifiedAt: Date | null } }) {
  const avatar = mediaUrl(c.avatarKey);
  const initials = c.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]?.toUpperCase() ?? "").join("");
  return (
    <Link href={`/c/${c.handle}`} className="group flex items-center gap-3 self-start">
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-sm font-semibold text-fg">
        {/* eslint-disable-next-line @next/next/no-img-element -- a public storage URL; no optimizer route for it */}
        {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <span aria-hidden>{initials}</span>}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-fg group-hover:underline">{c.displayName}</span>
        <span className="flex flex-wrap items-center gap-2 text-sm text-muted">@{c.handle}{c.verifiedAt && <VerifiedMark compact />}</span>
      </span>
    </Link>
  );
}
