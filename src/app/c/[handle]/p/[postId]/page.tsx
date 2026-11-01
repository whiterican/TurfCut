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
    <RecordPage gap={4}>
      <Link href={`/c/${r.campaign.handle}`} className="btn-ghost btn-sm self-start">{r.campaign.displayName}</Link>
      <PostCard post={r.post} handle={r.campaign.handle} displayName={r.campaign.displayName} verified={!!r.campaign.verifiedAt} signedIn={!!session} liked={liked} facts={facts} />
    </RecordPage>
  );
}
