import type { Metadata } from "next";
import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadHomeFeed, type FeedPost } from "@/lib/campaign-follow-data";
import { PostCard } from "@/components/campaign/PostCard";

export const metadata: Metadata = { title: "Feed" };

type Props = { searchParams: Promise<{ cursor?: string }> };

/**
 * A worker's home feed (S2): the posts of the campaigns they follow and of
 * the campaigns whose jobs hired them, newest first. Time is the only
 * order — nothing is ranked, suggested or filtered — and nothing read here
 * goes anywhere else (C1-Q14).
 */
export default async function FeedPage({ searchParams }: Props) {
  const { workerId } = await requireWorker();
  const { cursor } = await searchParams;
  const feed = await loadHomeFeed(workerId, cursor);
  return (
    <main className="page max-w-2xl space-y-6">
      <header className="page-header">
        <div className="space-y-1.5">
          <p className="eyebrow">Feed</p>
          <h1 className="page-title">From your campaigns</h1>
          <p className="text-muted-sm">Posts from campaigns you follow and campaigns you work for, newest first.</p>
        </div>
      </header>
      {feed.sources === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Nothing here yet</p>
          <p className="empty-state-body">Follow a campaign from its page, or from a job you take, and its posts show up here. Who you follow is yours alone to see.</p>
          <Link href="/jobs" className="btn-secondary">Find work</Link>
        </div>
      ) : (
        <section className="section" aria-label="Posts">
          {feed.posts.length === 0 && <p className="card text-muted-sm">{cursor ? "No older posts." : "Your campaigns haven't posted yet."}</p>}
          {feed.posts.map((p) => <FeedItem key={p.id} post={p} />)}
          {feed.next && <Link href={`/feed?cursor=${feed.next}`} className="btn-secondary">Older posts</Link>}
        </section>
      )}
    </main>
  );
}

function FeedItem({ post }: { post: FeedPost }) {
  return (
    <div className="space-y-1">
      <p className="px-1 text-xs text-muted">
        <Link href={`/c/${post.campaign.handle}`} className="font-medium hover:underline">{post.reason === "hired" ? "A campaign you work for" : "Following"}</Link>
      </p>
      <PostCard post={post} handle={post.campaign.handle} displayName={post.campaign.displayName} signedIn />
    </div>
  );
}
