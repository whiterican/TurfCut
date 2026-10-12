"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Link2, Share2 } from "lucide-react";

const noop = () => () => {};
/** Whether this browser has a share sheet (false on the server, so the first paint matches). */
const useCanShare = () => useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);

/**
 * Share a campaign or a post (S3): the device's own share sheet where there
 * is one, otherwise the link goes to the clipboard. Nothing is recorded —
 * sharing is the reader's act, on their own device, with whoever they choose.
 */
export function ShareButton({ path, title, text, className = "btn-ghost btn-sm" }: { path: string; title: string; text?: string; className?: string }) {
  const canShare = useCanShare();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (reset.current) clearTimeout(reset.current); }, []);
  const flash = (next: "copied" | "failed") => {
    setState(next);
    if (reset.current) clearTimeout(reset.current);
    reset.current = setTimeout(() => setState("idle"), 2500);
  };
  const share = async () => {
    const url = new URL(path, location.origin).toString();
    if (canShare) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // the reader closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      flash("copied");
    } catch {
      flash("failed");
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className={`${className} inline-flex items-center gap-1.5`} onClick={share}>
        {state === "copied" ? <Check aria-hidden className="h-4 w-4" /> : canShare ? <Share2 aria-hidden className="h-4 w-4" /> : <Link2 aria-hidden className="h-4 w-4" />}
        {state === "copied" ? "Link copied" : canShare ? "Share" : "Copy link"}
      </button>
      {/* Always present, so screen readers announce the change. */}
      <span role="status" className={state === "failed" ? "text-danger-msg text-sm" : "sr-only"}>
        {state === "copied" ? "Link copied" : state === "failed" ? "Couldn't copy. Open the post and copy its address." : ""}
      </span>
    </span>
  );
}
