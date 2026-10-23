"use client";

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";

/**
 * A submit button's three faces (P1.2): its label, a spinner while the action
 * runs, and a check once it has landed. All three sit in one grid cell, so the
 * button is as wide as its widest face and never jumps; the faces cross-fade
 * on the motion tokens, and under "Less motion" they simply swap. Hidden faces
 * are aria-hidden and invisible, so the button's name is always the face shown.
 */
export type ButtonPhase = "idle" | "pending" | "done";

/** How long the check stays before the label comes back. A dwell, not a motion: it holds under "Less motion" too. */
export const DONE_HOLD_MS = 1600;

export function ButtonFaces({
  phase,
  label,
  pendingLabel,
  doneLabel = "Done",
  icon,
}: {
  phase: ButtonPhase;
  label: React.ReactNode;
  pendingLabel: React.ReactNode;
  doneLabel?: React.ReactNode;
  /** A glyph before the label (decorative). */
  icon?: React.ReactNode;
}) {
  const face = (name: ButtonPhase, body: React.ReactNode) => (
    <span className="btn-face" data-on={phase === name || undefined} aria-hidden={phase !== name || undefined}>
      {body}
    </span>
  );
  return (
    <span className="btn-faces">
      {face("idle", <>{icon}{label}</>)}
      {face("pending", <><span className="btn-spinner" aria-hidden="true" />{pendingLabel}</>)}
      {face(
        "done",
        <>
          <svg className="btn-check" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8.5l3.2 3L13 4.5" pathLength={1} />
          </svg>
          {doneLabel}
        </>,
      )}
    </span>
  );
}

/**
 * The phase for a button driven by an action's result. `result` is the
 * action's latest state object: a new object that is `ok` shows the check for
 * a moment (with a success haptic), a new one that isn't gives a warning
 * haptic and goes straight back to the label. The same object twice does
 * nothing, so a re-render never replays the check.
 */
export function useButtonPhase(pending: boolean, result: { ok: boolean } | null | undefined): ButtonPhase {
  // The result whose check has run its course. A result already there on the
  // first render is old news, so it starts out spent.
  const [spent, setSpent] = useState(result);
  const felt = useRef(result);
  useEffect(() => {
    if (!result || result === felt.current) return;
    felt.current = result;
    haptic(result.ok ? "success" : "warning");
    if (!result.ok) return;
    const t = setTimeout(() => setSpent(result), DONE_HOLD_MS);
    return () => clearTimeout(t);
  }, [result]);
  if (pending) return "pending";
  return result?.ok && result !== spent ? "done" : "idle";
}

/** A polite announcement beside the button: "working" while the action runs. The result itself is announced by the form's own message. */
export function PendingAnnouncement({ pending, text }: { pending: boolean; text: string }) {
  return (
    <span className="sr-only" role="status">
      {pending ? text : ""}
    </span>
  );
}
