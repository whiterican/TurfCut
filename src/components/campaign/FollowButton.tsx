"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Bell, BellOff, Check, Plus } from "lucide-react";
import type { ActionState } from "@/app/jobs/actions";
import { followCampaign } from "@/app/feed/actions";
import type { FollowState } from "@/lib/campaign-follow-data";

const initial: ActionState = { ok: false, message: "" };

/**
 * Follow a campaign (S2): a worker's own choice, private to them. While
 * following, a second control turns notices of new posts on or off. Anyone
 * not signed in is sent to sign in and brought back; organization logins
 * see nothing (following is for workers).
 */
export function FollowButton({ campaignId, state, viewer, back }: { campaignId: string; state: FollowState; viewer: "worker" | "guest" | "other"; back: string }) {
  const [result, act, pending] = useActionState(followCampaign, initial);
  if (viewer === "other") return null;
  if (viewer === "guest") {
    return (
      <Link href={`/login?next=${encodeURIComponent(back)}`} className="btn-secondary btn-sm inline-flex items-center gap-1.5">
        <Plus aria-hidden className="h-4 w-4" />
        Follow
      </Link>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <form action={act}>
          <input type="hidden" name="campaignId" value={campaignId} />
          <input type="hidden" name="follow" value={state.following ? "0" : "1"} />
          <button className={`${state.following ? "btn-secondary" : "btn-primary"} btn-sm inline-flex items-center gap-1.5`} disabled={pending} aria-pressed={state.following}>
            {state.following ? <Check aria-hidden className="h-4 w-4" /> : <Plus aria-hidden className="h-4 w-4" />}
            {pending ? "Saving…" : state.following ? "Following" : "Follow"}
          </button>
        </form>
        {state.following && (
          <form action={act}>
            <input type="hidden" name="campaignId" value={campaignId} />
            <input type="hidden" name="follow" value="1" />
            <input type="hidden" name="notify" value={state.notify ? "0" : "1"} />
            <button className="btn-ghost btn-sm inline-flex items-center gap-1.5" disabled={pending} aria-pressed={state.notify} title={state.notify ? "Turn off notices of new posts" : "Get a notice when this campaign posts (up to 3 a day)"}>
              {state.notify ? <Bell aria-hidden className="h-4 w-4" /> : <BellOff aria-hidden className="h-4 w-4" />}
              {state.notify ? "Notices on" : "Notices off"}
            </button>
          </form>
        )}
      </div>
      {result.message && <p role="status" className="text-danger-msg text-sm">{result.message}</p>}
    </div>
  );
}
