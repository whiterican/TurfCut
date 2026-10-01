"use client";

import { useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/app/jobs/actions";

/**
 * Submits a form to a server action from onSubmit, inside a transition.
 * Unlike <form action>, React doesn't auto-reset the form afterwards — so a
 * failed send keeps its text, ticked boxes and chosen file. Callers reset
 * what they need on success. The clicked button's name/value is included
 * (quick replies). A network or server failure becomes a message, never the
 * error page (which would lose the draft); Next's own redirects pass through.
 */
export function useSubmit(
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>,
  after?: (r: ActionState, form: HTMLFormElement) => void
) {
  const [state, setState] = useState<ActionState>({ ok: false, message: "" });
  const [pending, start] = useTransition();
  // A ref, not `pending`: two submits in one frame (Cmd+Enter and a tap) must not both send.
  const inFlight = useRef(false);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const form = e.currentTarget;
    const fd = new FormData(form, (e.nativeEvent as SubmitEvent).submitter);
    start(async () => {
      try {
        const r = await action(state, fd);
        setState(r);
        after?.(r, form);
      } catch (err) {
        unstable_rethrow(err); // redirect() after creating a team chat, etc.
        setState({ ok: false, message: "Couldn't reach Turfcut, so this may not have gone through. Your text is still here — check the conversation before sending again." });
      } finally {
        inFlight.current = false;
      }
    });
  };
  return { state, pending, onSubmit };
}
