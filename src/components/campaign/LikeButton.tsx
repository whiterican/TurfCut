"use client";

import { useActionState } from "react";
import { Heart } from "lucide-react";
import type { ActionState } from "@/app/jobs/actions";
import { likePost } from "@/app/feed/actions";

const initial: ActionState = { ok: false, message: "" };

/**
 * Like a post (S2): private to the worker. No count is shown to anyone
 * here; the campaign sees only how many likes a post has, never who.
 */
export function LikeButton({ postId, liked }: { postId: string; liked: boolean }) {
  const [result, act, pending] = useActionState(likePost, initial);
  return (
    <form action={act} className="inline-flex flex-col gap-1">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="liked" value={liked ? "0" : "1"} />
      <button className="btn-ghost btn-sm inline-flex items-center gap-1.5" disabled={pending} aria-pressed={liked}>
        <Heart aria-hidden className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
        {liked ? "Liked" : "Like"}
      </button>
      {result.message && <p role="status" className="text-danger-msg text-sm">{result.message}</p>}
    </form>
  );
}
