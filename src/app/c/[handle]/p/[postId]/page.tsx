import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { loadPublicPost } from "@/lib/campaign-social-data";
import { PostCard } from "@/components/campaign/PostCard";

type Props = { params: Promise<{ handle: string; postId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, postId } = await params;
  const r = await loadPublicPost(handle, postId);
  return r ? { title: `${r.campaign.displayName} on Turfcut` } : { title: "Post not found" };
}

/** One post's own page (S1), public: the link a campaign shares. */
export default async function PostPage({ params }: Props) {
  const { handle, postId } = await params;
  const [r, session] = await Promise.all([loadPublicPost(handle, postId), getSessionProfile().catch(() => null)]);
  if (!r) notFound();
  return (
    <main className="page max-w-2xl space-y-4">
      <Link href={`/c/${r.campaign.handle}`} className="btn-ghost btn-sm">{r.campaign.displayName}</Link>
      <PostCard post={r.post} handle={r.campaign.handle} displayName={r.campaign.displayName} signedIn={!!session} />
    </main>
  );
}
