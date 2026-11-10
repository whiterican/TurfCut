"use client";

import { useState, useTransition } from "react";
import { archiveChannel, leaveChannel } from "@/app/messages/actions";
import type { ActionState } from "@/app/jobs/actions";

/** Leave and archive, in a channel's ··· menu. Each asks first: leaving ends new messages for you, archiving ends them for everyone. */
export function ChannelActions({ conversationId, name, canLeave, canArchive }: { conversationId: string; name: string; canLeave: boolean; canArchive: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  const run = (question: string, work: () => Promise<ActionState>) => {
    if (!confirm(question)) return;
    start(async () => {
      try {
        setState(await work());
      } catch (e) {
        // A redirect after leaving arrives as a thrown signal: let it through.
        if (e && typeof e === "object" && "digest" in e) throw e;
        setState({ ok: false, message: "That didn't go through. Try again." });
      }
    });
  };
  if (!canLeave && !canArchive) return null;
  return (
    <div className="space-y-2 border-t border-border p-4">
      <div className="flex flex-wrap gap-2">
        {canLeave && (
          <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(`Leave #${name}? You keep its history up to now, and can join again.`, () => leaveChannel(conversationId))}>
            Leave channel
          </button>
        )}
        {canArchive && (
          <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(`Archive #${name}? Nobody will be able to post in it. Its history stays for its members.`, () => archiveChannel(conversationId))}>
            Archive channel
          </button>
        )}
      </div>
      {state?.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
    </div>
  );
}
