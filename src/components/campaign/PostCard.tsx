import { VerifiedMark } from "@/components/campaign/VerifiedMark";
import Link from "next/link";
import { Pin } from "lucide-react";
import { LocalTime } from "@/components/LocalTime";
import { LinkedText } from "@/components/campaign/LinkedText";
import { JobEmbedCard } from "@/components/campaign/JobEmbedCard";
import { LikeButton } from "@/components/campaign/LikeButton";
import { ShareButton } from "@/components/campaign/ShareButton";
import { FactList } from "@/components/campaign/FactList";
import type { Fact } from "@/lib/campaign-kit-data";
import type { PublicPost } from "@/lib/campaign-social-data";

/**
 * One campaign post (S1), in the campaign's own words: the text verbatim,
 * when it was posted (and edited), and an embedded job if it has one.
 * A worker viewing it gets a Like control (their own, private); the
 * campaign's own view gets the like total (a number, never who). Nothing
 * else Turfcut adds about it.
 */
export function PostCard({
  post,
  handle,
  displayName,
  verified = false,
  signedIn,
  liked,
  likeTotal,
  facts,
  children,
}: {
  post: PublicPost;
  handle: string;
  displayName: string;
  /** Turfcut has verified the campaign's profile (M10.5). */
  verified?: boolean;
  signedIn: boolean;
  /** For a signed-in worker: whether they liked this post (shows the control). */
  liked?: boolean;
  /** For the campaign's own view: how many likes the post has. */
  likeTotal?: number;
  /** A talking point's supporting facts (S4), folded under it. */
  facts?: Fact[];
  /** The organization's own controls (edit, pin, delete). */
  children?: React.ReactNode;
}) {
  return (
    <article className="card space-y-3" aria-label={`Post by ${displayName}`}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="font-semibold text-fg">{displayName}</span>
        {verified && <VerifiedMark compact />}
        <span>@{handle}</span>
        <span aria-hidden>·</span>
        <Link href={`/c/${handle}/p/${post.id}`} className="hover:underline">
          <LocalTime iso={post.createdAt.toISOString()} mode="datetime" />
        </Link>
        {post.editedAt && <span>(edited)</span>}
        {post.pinnedAt && (
          <span className="tag inline-flex items-center gap-1">
            <Pin aria-hidden className="h-3 w-3" />
            Talking point
          </span>
        )}
      </header>
      <LinkedText text={post.body} className="text-[15px] leading-relaxed text-fg" />
      {facts && facts.length > 0 && <FactList facts={facts} />}
      <JobEmbedCard post={post} signedIn={signedIn} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {liked !== undefined && <LikeButton postId={post.id} liked={liked} />}
        <ShareButton path={`/c/${handle}/p/${post.id}`} title={`${displayName} (@${handle}) on Turfcut`} text={post.body} />
        {likeTotal !== undefined && <span className="text-xs text-muted">{likeTotal === 1 ? "1 like" : `${likeTotal} likes`}</span>}
      </div>
      {children}
    </article>
  );
}
