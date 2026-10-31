"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowLeft, Bookmark, BookmarkCheck, Check, Share } from "lucide-react";
import { markJobAction } from "@/app/jobs/mark-actions";
import type { ActionState } from "@/app/jobs/actions";
import { haptic } from "@/lib/haptics";
import { isShareCancelled, LINK_COPIED, saveFailureText, SHARE_FAILED } from "@/lib/job-head-feedback";

/**
 * The controls over a job's photograph (#111, screen 3): back, save and
 * share, each a 44px round button. Save is the same mark the feed's swipe
 * records (private to the worker, never a ranking input); share uses the
 * phone's share sheet and falls back to copying the link.
 */
export function JobHeadActions({ jobId, back, saved, canSave, title }: { jobId: string; back: string; saved: boolean; canSave: boolean; title: string }) {
  // One column of notes under the controls (#113 review, P2): a failed save and a failed share never cover each other.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareFailedUrl, setShareFailedUrl] = useState<string | null>(null);
  return (
    <div className="job-head-actions">
      <Link transitionTypes={["nav-back"]} href={back} className="job-head-btn" aria-label="Back to jobs">
        <ArrowLeft aria-hidden className="size-5" />
      </Link>
      <span className="flex gap-2">
        {canSave && <SaveButton jobId={jobId} saved={saved} error={saveError} onError={setSaveError} />}
        <ShareButton title={title} onFailed={setShareFailedUrl} />
      </span>
      <div className="job-head-notes">
        <div role="alert" className={saveError ? "job-head-note" : "sr-only"}>
          <span id="job-save-error">{saveError ?? ""}</span>
          {saveError && <button type="button" className="job-head-dismiss" onClick={() => setSaveError(null)}>Dismiss</button>}
        </div>
        <div role="alert" className={shareFailedUrl ? "job-head-note" : "sr-only"}>
          {shareFailedUrl && (
            <>
              {SHARE_FAILED}
              <input readOnly value={shareFailedUrl} aria-label="Link to this job" className="field mt-2 w-full text-sm" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="job-head-dismiss" onClick={() => setShareFailedUrl(null)}>Dismiss</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveButton({ jobId, saved, error, onError }: { jobId: string; saved: boolean; error: string | null; onError: (m: string | null) => void }) {
  const [isSaved, setSaved] = useState(saved);
  // The action's result is kept (#113 review, P2): a refused or failed mark keeps the previous state, says so, and the button stays usable for a retry.
  const [, act, pending] = useActionState(async (prev: ActionState, fd: FormData): Promise<ActionState> => {
    const next = fd.get("mark") === "save";
    setSaved(next);
    onError(null);
    let r: ActionState;
    try {
      r = await markJobAction(prev, fd);
    } catch {
      r = { ok: false, message: "" };
    }
    if (!r.ok) {
      setSaved(!next);
      onError(saveFailureText(next));
      return { ok: false, message: saveFailureText(next) };
    }
    haptic("tap");
    return { ok: true, message: "" };
  }, { ok: true, message: "" } as ActionState);
  return (
    <form action={act}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="mark" value={isSaved ? "unsave" : "save"} />
      <button type="submit" className="job-head-btn" aria-pressed={isSaved} aria-label={isSaved ? "Saved (tap to unsave)" : "Save this job"} disabled={pending} aria-describedby={error ? "job-save-error" : undefined}>
        {isSaved ? <BookmarkCheck aria-hidden className="size-5" /> : <Bookmark aria-hidden className="size-5" />}
      </button>
    </form>
  );
}

function ShareButton({ title, onFailed }: { title: string; onFailed: (url: string | null) => void }) {
  const [copied, setCopied] = useState(false);
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard denied or unavailable: the link itself, to copy by hand.
      onFailed(url);
    }
  }
  async function share() {
    const url = location.href;
    onFailed(null);
    setCopied(false);
    if (!navigator.share) return copy(url);
    try {
      await navigator.share({ title, url });
    } catch (e) {
      // Closing the share sheet is not a failure; anything else falls back to the clipboard (#113 review, P2).
      if (!isShareCancelled(e)) await copy(url);
    }
  }
  return (
    <>
      <button type="button" className="job-head-btn" onClick={share} aria-label="Share this job">
        {copied ? <Check aria-hidden className="size-5" /> : <Share aria-hidden className="size-5" />}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? LINK_COPIED : ""}</span>
    </>
  );
}
