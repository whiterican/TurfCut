import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { loadPinned, loadPosts, loadPublicCampaign } from "@/lib/campaign-social-data";
import { mediaUrl } from "@/lib/campaign-media";
import { followState, likedPostIds } from "@/lib/campaign-follow-data";
import { FollowButton } from "@/components/campaign/FollowButton";
import { CampaignHeader } from "@/components/campaign/CampaignHeader";
import { PostCard } from "@/components/campaign/PostCard";
import { ShareButton } from "@/components/campaign/ShareButton";
import { campaignPreview } from "@/lib/campaign-api";

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ cursor?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await loadPublicCampaign((await params).handle);
  return c ? campaignPreview(c) : { title: "Campaign not found" };
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
  const [pinned, feed, session] = await Promise.all([cursor ? Promise.resolve([]) : loadPinned(c.id), loadPosts(c.id, cursor), getSessionProfile().catch(() => null)]);
  const signedIn = !!session;
  // Following is a worker's own choice (S2): guests are sent to sign in; organization logins see no control.
  const workerId = session?.role === "WORKER" ? session.workerId : null;
  const viewer = workerId ? "worker" : session ? "other" : "guest";
  const [follow, liked] = workerId
    ? await Promise.all([followState(workerId, c.id), likedPostIds(workerId, [...pinned, ...feed.posts].map((p) => p.id))])
    : [{ following: false, notify: false }, null];
  const likedBy = (id: string) => (liked ? liked.has(id) : undefined);
  return (
    <main className="page max-w-2xl space-y-6">
      <Link transitionTypes={["nav-back"]} href="/c" className="btn-ghost btn-sm">← All campaigns</Link>
      <CampaignHeader displayName={c.displayName} handle={c.handle} bio={c.bio} avatarUrl={mediaUrl(c.avatarKey)} headerUrl={mediaUrl(c.headerKey)}>
        <span className="flex flex-wrap items-center justify-end gap-2">
          <ShareButton path={`/c/${c.handle}`} title={`${c.displayName} (@${c.handle})`} />
          <FollowButton campaignId={c.id} state={follow} viewer={viewer} back={`/c/${c.handle}`} />
        </span>
      </CampaignHeader>
      {pinned.length > 0 && (
        <section className="section" aria-labelledby="talking-points">
          <h2 id="talking-points" className="section-title">Talking points</h2>
          {pinned.map((p) => <PostCard key={p.id} post={p} handle={c.handle} displayName={c.displayName} signedIn={signedIn} liked={likedBy(p.id)} />)}
        </section>
      )}
      <section className="section" aria-labelledby="posts">
        <h2 id="posts" className="section-title">Posts</h2>
        {feed.posts.length === 0 && <p className="card text-muted-sm">{cursor ? "No older posts." : "No posts yet."}</p>}
        {feed.posts.map((p) => <PostCard key={p.id} post={p} handle={c.handle} displayName={c.displayName} signedIn={signedIn} liked={likedBy(p.id)} />)}
        {feed.next && <Link href={`/c/${c.handle}?cursor=${feed.next}`} className="btn-secondary">Older posts</Link>}
      </section>
    </main>
  );
}
