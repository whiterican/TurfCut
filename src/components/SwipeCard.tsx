"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, EyeOff, Undo2 } from "lucide-react";
import { markJobAction } from "@/app/jobs/mark-actions";
import type { ActionState } from "@/app/jobs/actions";
import { haptic } from "@/lib/haptics";
import { duration } from "@/lib/motion";
import { SWIPE_START_PX, swipeOutcome, type Mark } from "@/lib/job-marks";

const initial: ActionState = { ok: false, message: "" };

/**
 * A feed card the worker can swipe (P1.6): right to save, left to hide. The
 * card follows the finger over a lime "Save" or a stone "Hide" underlay and
 * commits past a third of its width (or on a flick); short of that it springs
 * back. The same two actions are buttons under the card, so a keyboard, a
 * mouse or a screen reader needs no gesture. A mark is private to the
 * worker and never ranks jobs or people. The children must stay tap-safe: a
 * drag swallows the click that would open the job.
 */
export function SwipeCard({
  jobId,
  saved,
  hidden,
  children,
  action = markJobAction,
}: {
  jobId: string;
  saved: boolean;
  hidden: boolean;
  children: React.ReactNode;
  /** The server action that records the mark (the real one; a fixture may pass its own). */
  action?: typeof markJobAction;
}) {
  const [isSaved, setSaved] = useState(saved);
  const [gone, setGone] = useState(false);
  const [dx, setDx] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x0: number; y0: number; t0: number; x: number; t: number; moving: boolean } | null>(null);
  /** The card is sliding away: a second Hide while it does is nothing. */
  const leaving = useRef(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await action(prev, fd);
    // The server refused: put the card back the way it was and show why (the optimistic change was wrong).
    if (!result.ok && result.message) {
      leaving.current = false;
      setGone(false);
      setSaved(saved);
    }
    return result;
  }, initial);
  /** When the last swipe ended: the click that follows it (if any does) must not open the job. */
  const swipedAt = useRef(-Infinity);

  function send(mark: Mark) {
    const fd = new FormData();
    fd.set("jobId", jobId);
    fd.set("mark", mark);
    startTransition(() => formAction(fd));
  }
  function save() {
    setSaved(true);
    haptic("success");
    send("save");
  }
  function unsave() {
    setSaved(false);
    haptic("tap");
    send("unsave");
  }
  function hide() {
    if (leaving.current) return;
    leaving.current = true;
    haptic("tap");
    send("hide");
    const el = card.current;
    const ms = duration("base");
    if (!el || !ms) return setGone(true);
    // The card slides off first; it leaves the list once the slide has played (the state change would detach it mid-way).
    const easing = getComputedStyle(document.documentElement).getPropertyValue("--ease-in").trim() || undefined;
    const slide = el.animate([{ translate: `${dx}px 0`, opacity: 1 }, { translate: "-110% 0", opacity: 0 }], { duration: ms, easing, fill: "forwards" });
    slide.finished.then(() => setGone(true), () => setGone(true));
  }
  function unhide() {
    haptic("tap");
    setGone(true);
    send("unhide");
  }

  /** Springs the card back to rest after a short swipe. */
  function settle(from: number) {
    setDx(0);
    const el = card.current;
    const ms = duration("slow");
    if (!el || !ms || !from) return;
    const easing = getComputedStyle(document.documentElement).getPropertyValue("--spring").trim() || undefined;
    el.animate([{ translate: `${from}px 0` }, { translate: "0 0" }], { duration: ms, easing });
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || hidden) return;
    drag.current = { x0: e.clientX, y0: e.clientY, t0: e.timeStamp, x: e.clientX, t: e.timeStamp, moving: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x0;
    const my = e.clientY - d.y0;
    if (!d.moving) {
      // Sideways by a clear margin: a swipe. Otherwise it's a tap or the page scrolling.
      if (Math.abs(mx) < SWIPE_START_PX || Math.abs(mx) < Math.abs(my) * 1.5) return;
      d.moving = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    d.x = e.clientX;
    d.t = e.timeStamp;
    setDx(mx);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moving) return;
    swipedAt.current = e.timeStamp;
    const travel = d.x - d.x0;
    const vx = d.t > d.t0 ? travel / (d.t - d.t0) : 0;
    const width = e.currentTarget.offsetWidth;
    const outcome = swipeOutcome(travel, vx, width);
    if (outcome === "save") {
      settle(travel);
      if (!isSaved) save();
    } else if (outcome === "hide") hide();
    else settle(travel);
  };
  // The browser took the pointer (a system gesture, a palm): nothing is committed, the card springs back.
  const onPointerCancel = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moving) settle(d.x - d.x0);
  };
  // The click that ends a swipe must not open the job. A touch swipe often
  // produces no click at all, so the mark is a time, not a flag: a tap much
  // later is a tap.
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.timeStamp - swipedAt.current < 400) {
      e.preventDefault();
      e.stopPropagation();
      swipedAt.current = -Infinity;
    }
  };

  // The live region is always in the tree, so the text it receives is announced.
  const status = gone ? state.message || (hidden ? "Back in your feed." : "Hidden from your feed.") : "";
  if (gone) {
    return (
      <div className="swipe">
        <p role="status" className="sr-only">{status}</p>
      </div>
    );
  }

  const reveal = Math.min(1, Math.abs(dx) / 120);
  return (
    <div className="swipe">
      <p role="status" className="sr-only">{status}</p>
      {!hidden && (
        <>
          <span className="swipe-under swipe-under-save" style={{ opacity: dx > 0 ? reveal : 0 }} aria-hidden="true">
            <Bookmark className="size-5" />
            Save
          </span>
          <span className="swipe-under swipe-under-hide" style={{ opacity: dx < 0 ? reveal : 0 }} aria-hidden="true">
            <EyeOff className="size-5" />
            Hide
          </span>
        </>
      )}
      <div
        ref={card}
        className="swipe-card"
        style={dx ? { translate: `${dx}px 0` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
      >
        {children}
        <div className="swipe-actions">
          {hidden ? (
            <button type="button" className="btn-ghost btn-sm" onClick={unhide} disabled={pending}>
              <Undo2 aria-hidden className="btn-icon" />
              Unhide
            </button>
          ) : (
            <>
              <button type="button" className={isSaved ? "btn-secondary btn-sm" : "btn-ghost btn-sm"} onClick={isSaved ? unsave : save} disabled={pending && !isSaved}>
                {isSaved ? <BookmarkCheck aria-hidden className="btn-icon" /> : <Bookmark aria-hidden className="btn-icon" />}
                {isSaved ? "Saved" : "Save"}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={hide} disabled={pending}>
                <EyeOff aria-hidden className="btn-icon" />
                Hide
              </button>
            </>
          )}
        </div>
        {state.message && !state.ok && <p role="alert" className="text-danger-msg px-1 pb-1">{state.message}</p>}
      </div>
    </div>
  );
}
