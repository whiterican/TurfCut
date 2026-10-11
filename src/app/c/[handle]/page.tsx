import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { loadPinned, loadPosts, loadPublicCampaign } from "@/lib/campaign-social-data";
import { mediaUrl } from "@/lib/campaign-media";
import { CampaignHeader } from "@/components/campaign/CampaignHeader";
import { PostCard } from "@/components/campaign/PostCard";

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ cursor?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await loadPublicCampaign((await params).handle);
  return c ? { title: `${c.displayName} (@${c.handle})` } : { title: "Campaign not found" };
}

/**
 * A campaign's public page (S1): no sign-in needed. The bio, the pinned
 * talking points, then every post newest first: time is the only order.
 * Everything on it is the campaign's own words; viewing it records nothing.
 */
export default async function PublicCampaignPage({ params, searchParams }: Props) {
  const c = await loadPublicCampaign((await params).handle);
  if (!c) notFound();
  const { cursor } = await searchParams;
  const [pinned, feed, session] = await Promise.all([cursor ? Promise.resolve([]) : loadPinned(c.id), loadPosts(c.id, cursor), getSessionProfile()]);
  const signedIn = !!session;
  return (
    <main className="page max-w-2xl space-y-6">
      <CampaignHeader displayName={c.displayName} handle={c.handle} bio={c.bio} avatarUrl={mediaUrl(c.avatarKey)} headerUrl={mediaUrl(c.headerKey)} />
      {pinned.length > 0 && (
        <section className="section" aria-labelledby="talking-points">
          <h2 id="talking-points" className="section-title">Talking points</h2>
          {pinned.map((p) => <PostCard key={p.id} post={p} handle={c.handle} displayName={c.displayName} signedIn={signedIn} />)}
        </section>
      )}
      <section className="section" aria-labelledby="posts">
        <h2 id="posts" className="section-title">Posts</h2>
        {feed.posts.length === 0 && <p className="card text-muted-sm">{cursor ? "No older posts." : "No posts yet."}</p>}
        {feed.posts.map((p) => <PostCard key={p.id} post={p} handle={c.handle} displayName={c.displayName} signedIn={signedIn} />)}
        {feed.next && <Link href={`/c/${c.handle}?cursor=${feed.next}`} className="btn-secondary">Older posts</Link>}
      </section>
    </main>
  );
}
