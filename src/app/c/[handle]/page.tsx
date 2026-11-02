import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { listHiringJobs, loadPinned, loadPosts, loadPublicCampaign } from "@/lib/campaign-social-data";
import { mediaUrl } from "@/lib/campaign-media";
import { followState, likedPostIds } from "@/lib/campaign-follow-data";
import { FollowButton } from "@/components/campaign/FollowButton";
import { CampaignHeader } from "@/components/campaign/CampaignHeader";
import { PostCard } from "@/components/campaign/PostCard";
import { ShareButton } from "@/components/campaign/ShareButton";
import { campaignPreview } from "@/lib/campaign-api";
import { listResources, loadFacts } from "@/lib/campaign-kit-data";
import { ResourceList } from "@/components/campaign/ResourceList";
import { HiringList } from "@/components/campaign/HiringList";
import { ChevronLeft } from "lucide-react";
import { RecordPage } from "@/components/layout/Page";

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ cursor?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await loadPublicCampaign((await params).handle);
  return c ? campaignPreview({ ...c, verified: !!c.verifiedAt }) : { title: "Campaign not found" };
}

/**
 * A campaign's public page (S1, #116 editorial layout): no sign-in needed.
 * The header, then the campaign's open jobs and public resources (beside
 * the posts from 1024, before them on a phone), then the pinned talking
 * points once, then every other post newest first: time is the only order.
 * Everything on it is the campaign's own words; viewing it records nothing.
 */
export default async function PublicCampaignPage({ params, searchParams }: Props) {
  const c = await loadPublicCampaign((await params).handle);
  if (!c) notFound();
  const { cursor } = await searchParams;
  // Talking points show once, above; the post list leaves them out in its query, so Older posts never repeats them.
  const [pinned, feed, session, hiring] = await Promise.all([
    cursor ? Promise.resolve([]) : loadPinned(c.id),
    loadPosts(c.id, cursor, { excludePinned: true }),
    getSessionProfile().catch(() => null),
    cursor ? Promise.resolve({ jobs: [], more: false }) : listHiringJobs(c),
  ]);
  // The briefing kit (S4): the facts behind each talking point, and what the campaign chose to show everyone.
  const [facts, resources] = await Promise.all([loadFacts(pinned.map((p) => p.id)), cursor ? Promise.resolve([]) : listResources(c.id, "PUBLIC")]);
  const signedIn = !!session;
  // Following is a worker's own choice (S2): guests are sent to sign in; organization logins see no control.
  const workerId = session?.role === "WORKER" ? session.workerId : null;
  const viewer = workerId ? "worker" : session ? "other" : "guest";
  const [follow, liked] = workerId
    ? await Promise.all([followState(workerId, c.id), likedPostIds(workerId, [...pinned, ...feed.posts].map((p) => p.id))])
    : [{ following: false, notify: false }, null];
  const likedBy = (id: string) => (liked ? liked.has(id) : undefined);
  const post = (p: (typeof feed.posts)[number], variant: "row" | "point") => (
    <PostCard key={p.id} post={p} handle={c.handle} displayName={c.displayName} verified={!!c.verifiedAt} signedIn={signedIn} liked={likedBy(p.id)} facts={variant === "point" ? facts.get(p.id) ?? [] : undefined} variant={variant} />
  );
  const side = hiring.jobs.length > 0 || resources.length > 0;
  return (
    <RecordPage
      gap={8}
      panelLabel="Jobs and resources"
      head={
        <div className="space-y-4">
          <Link transitionTypes={["nav-back"]} href="/c" className="btn-ghost btn-sm -ml-2"><ChevronLeft aria-hidden className="size-4 shrink-0" />All campaigns</Link>
          <CampaignHeader displayName={c.displayName} handle={c.handle} bio={c.bio} avatarUrl={mediaUrl(c.avatarKey)} headerUrl={mediaUrl(c.headerKey)} verified={!!c.verifiedAt}>
            <div className="flex flex-wrap items-center gap-2">
              <FollowButton campaignId={c.id} state={follow} viewer={viewer} back={`/c/${c.handle}`} />
              <ShareButton path={`/c/${c.handle}`} title={`${c.displayName} (@${c.handle})`} />
            </div>
          </CampaignHeader>
        </div>
      }
      aside={
        side ? (
          <>
            {hiring.jobs.length > 0 && (
              <section className="section" aria-labelledby="hiring-now">
                <h2 id="hiring-now" className="section-title">Hiring now</h2>
                <HiringList jobs={hiring.jobs} more={hiring.more} signedIn={signedIn} />
              </section>
            )}
            {resources.length > 0 && (
              <section className="section" aria-labelledby="from-the-campaign">
                <h2 id="from-the-campaign" className="section-title">From the campaign</h2>
                <ResourceList resources={resources} />
              </section>
            )}
          </>
        ) : undefined
      }
      tail={
        <>
          {pinned.length > 0 && (
            <section className="section" aria-labelledby="talking-points">
              <h2 id="talking-points" className="section-title">Talking points</h2>
              {pinned.map((p) => post(p, "point"))}
            </section>
          )}
          <section className="section" aria-labelledby="posts">
            <h2 id="posts" className="section-title">{cursor ? "Older posts" : "Posts"}</h2>
            {feed.posts.length === 0 ? (
              <p className="text-muted-sm">{cursor ? "No older posts." : pinned.length > 0 ? "No other posts yet." : "No posts yet."}</p>
            ) : (
              <div className="list-card">{feed.posts.map((p) => post(p, "row"))}</div>
            )}
            <div className="flex flex-wrap gap-2">
              {cursor && <Link href={`/c/${c.handle}`} className="btn-ghost">Latest posts</Link>}
              {feed.next && <Link href={`/c/${c.handle}?cursor=${feed.next}`} className="btn-secondary">Older posts</Link>}
            </div>
          </section>
        </>
      }
    >
      {null}
    </RecordPage>
  );
}
