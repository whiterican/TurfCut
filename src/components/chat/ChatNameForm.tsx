"use client";

import { useState } from "react";
import { useSubmit } from "@/components/chat/useSubmit";
import { setChatName } from "@/app/messages/actions";


/** Org staff set the name workers see next to their messages. */
export function ChatNameForm({ current }: { current: string }) {
  const { state, pending, onSubmit } = useSubmit(setChatName);
  const [name, setName] = useState(current); // controlled: survives a failed save
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="displayName">Your name in chat</label>
        <input id="displayName" name="displayName" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Maya Chen" className="field max-w-xs flex-1" autoComplete="name" />
        <button className="btn-secondary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      </div>
      {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </form>
  );
}
