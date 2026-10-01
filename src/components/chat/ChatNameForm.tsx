"use client";

import { useActionState } from "react";
import { setChatName } from "@/app/messages/actions";
import type { ActionState } from "@/app/jobs/actions";

const initial: ActionState = { ok: false, message: "" };

/** Org staff set the name workers see next to their messages. */
export function ChatNameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState(setChatName, initial);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="displayName">Your name in chat</label>
        <input id="displayName" name="displayName" defaultValue={current} maxLength={60} placeholder="e.g. Maya Chen" className="field max-w-xs flex-1" autoComplete="name" />
        <button className="btn-secondary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}
