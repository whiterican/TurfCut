"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/app/jobs/actions";

/**
 * Submits a form to a server action from onSubmit, inside a transition.
 * Unlike <form action>, React doesn't auto-reset the form afterwards — so a
 * failed send keeps its text, ticked boxes and chosen file. Callers reset
 * what they need on success. The clicked button's name/value is included
 * (quick replies).
 */
export function useSubmit(
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>,
  after?: (r: ActionState, form: HTMLFormElement) => void
) {
  const [state, setState] = useState<ActionState>({ ok: false, message: "" });
  const [pending, start] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const fd = new FormData(form, (e.nativeEvent as SubmitEvent).submitter);
    start(async () => {
      const r = await action(state, fd);
      setState(r);
      after?.(r, form);
    });
  };
  return { state, pending, onSubmit };
}
