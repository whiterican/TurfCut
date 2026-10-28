"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowLeft, Bookmark, BookmarkCheck, Check, Share } from "lucide-react";
import { markJobAction } from "@/app/jobs/mark-actions";
import type { ActionState } from "@/app/jobs/actions";
import { haptic } from "@/lib/haptics";

/**
 * The controls over a job's photograph (#111, screen 3): back, save and
 * share, each a 44px round button. Save is the same mark the feed's swipe
 * records (private to the worker, never a ranking input); share uses the
 * phone's share sheet and falls back to copying the link.
 */
export function JobHeadActions({ jobId, back, saved, canSave, title }: { jobId: string; back: string; saved: boolean; canSave: boolean; title: string }) {
  return (
    <div className="job-head-actions">
      <Link transitionTypes={["nav-back"]} href={back} className="job-head-btn" aria-label="Back to jobs">
        <ArrowLeft aria-hidden className="size-5" />
      </Link>
      <span className="flex gap-2">
        {canSave && <SaveButton jobId={jobId} saved={saved} />}
        <ShareButton title={title} />
      </span>
    </div>
  );
}

function SaveButton({ jobId, saved }: { jobId: string; saved: boolean }) {
  const [isSaved, setSaved] = useState(saved);
  const [, act, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const next = fd.get("mark") === "save";
    setSaved(next);
    const r = await markJobAction(prev, fd);
    if (!r.ok) setSaved(!next);
    else haptic("tap");
    return r;
  }, { ok: true } as ActionState);
  return (
    <form action={act}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="mark" value={isSaved ? "unsave" : "save"} />
      <button type="submit" className="job-head-btn" aria-pressed={isSaved} aria-label={isSaved ? "Saved (tap to unsave)" : "Save this job"} disabled={pending}>
        {isSaved ? <BookmarkCheck aria-hidden className="size-5" /> : <Bookmark aria-hidden className="size-5" />}
      </button>
    </form>
  );
}

function ShareButton({ title }: { title: string }) {
  const [done, setDone] = useState(false);
  async function share() {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }
    } catch {
      // The person closed the share sheet: nothing to say.
    }
  }
  return (
    <button type="button" className="job-head-btn" onClick={share} aria-label={done ? "Link copied" : "Share this job"}>
      {done ? <Check aria-hidden className="size-5" /> : <Share aria-hidden className="size-5" />}
    </button>
  );
}
