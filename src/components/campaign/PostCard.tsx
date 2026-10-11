import Link from "next/link";
import { Pin } from "lucide-react";
import { LocalTime } from "@/components/LocalTime";
import { LinkedText } from "@/components/campaign/LinkedText";
import { JobEmbedCard } from "@/components/campaign/JobEmbedCard";
import type { PublicPost } from "@/lib/campaign-social-data";

/**
 * One campaign post (S1), in the campaign's own words: the text verbatim,
 * when it was posted (and edited), and an embedded job if it has one.
 * No counts, no reactions, nothing Turfcut adds about it.
 */
export function PostCard({
  post,
  handle,
  displayName,
  signedIn,
  children,
}: {
  post: PublicPost;
  handle: string;
  displayName: string;
  signedIn: boolean;
  /** The organization's own controls (edit, pin, delete). */
  children?: React.ReactNode;
}) {
  return (
    <article className="card space-y-3" aria-label={`Post by ${displayName}`}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="font-semibold text-fg">{displayName}</span>
        <span>@{handle}</span>
        <span aria-hidden>·</span>
        <Link href={`/c/${handle}/p/${post.id}`} className="hover:underline">
          <LocalTime iso={post.createdAt.toISOString()} mode="datetime" />
        </Link>
        {post.editedAt && <span>(edited)</span>}
        {post.pinnedAt && (
          <span className="badge inline-flex items-center gap-1">
            <Pin aria-hidden className="h-3 w-3" />
            Talking point
          </span>
        )}
      </header>
      <LinkedText text={post.body} className="text-[15px] leading-relaxed text-fg" />
      <JobEmbedCard post={post} signedIn={signedIn} />
      {children}
    </article>
  );
}
