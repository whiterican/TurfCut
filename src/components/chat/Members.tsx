"use client";

import { useActionState, useState, useTransition } from "react";
import { addMembers, block, removeMember, unblock } from "@/app/messages/actions";
import type { ActionState } from "@/app/jobs/actions";
import { Avatar } from "@/components/chat/Avatar";

export interface ClientMember {
  profileId: string;
  name: string;
  role: "WORKER" | "MANAGER";
  removed: boolean;
  isMe: boolean;
  blockedByMe: boolean;
}
export interface ClientCandidate {
  profileId: string;
  name: string;
  role: "WORKER" | "MANAGER";
  detail: string;
}

const initial: ActionState = { ok: false, message: "" };

/** Block / unblock a manager (workers only). Blocking hides their new messages and stops their direct messages. */
export function BlockButton({ conversationId, member }: { conversationId: string; member: ClientMember }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);
  const go = () =>
    start(async () => {
      if (!member.blockedByMe && !confirm(`Block ${member.name}? You won't see their new messages, and they can't message you directly. Your history stays.`)) return;
      setMsg(await (member.blockedByMe ? unblock : block)(conversationId, member.profileId));
    });
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={go}>
        {member.blockedByMe ? "Unblock" : "Block"}
      </button>
      {msg?.message && <span role="status" className={`text-xs ${msg.ok ? "text-success-msg" : "text-danger-msg"}`}>{msg.message}</span>}
    </span>
  );
}

function RemoveButton({ conversationId, member }: { conversationId: string; member: ClientMember }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-ghost btn-sm"
        disabled={pending}
        onClick={() =>
          confirm(`Remove ${member.name} from this team chat? They keep read-only history up to now.`) &&
          start(async () => setMsg(await removeMember(conversationId, member.profileId)))
        }
      >
        Remove
      </button>
      {msg && !msg.ok && <span role="status" className="text-xs text-danger-msg">{msg.message}</span>}
    </span>
  );
}

export function Members({
  conversationId,
  members,
  canManage,
  canBlock,
  candidates,
}: {
  conversationId: string;
  members: ClientMember[];
  canManage: boolean;
  canBlock: boolean;
  candidates: ClientCandidate[];
}) {
  const [state, action, pending] = useActionState(addMembers, initial);
  const active = members.filter((m) => !m.removed);
  const removed = members.filter((m) => m.removed);
  const addable = candidates.filter((c) => !active.some((m) => m.profileId === c.profileId));
  const row = (m: ClientMember) => (
    <li key={m.profileId} className="flex items-center gap-3 px-4 py-2.5">
      <Avatar name={m.name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold ${m.removed ? "text-subtle" : "text-fg"}`}>
          {m.name}
          {m.isMe && " (you)"}
        </span>
      </span>
      <span className={m.role === "MANAGER" && !m.removed ? "badge-sky" : "badge-neutral"}>{m.removed ? "Removed" : m.role === "MANAGER" ? "Manager" : "Worker"}</span>
      {!m.isMe && !m.removed && canBlock && m.role === "MANAGER" && <BlockButton conversationId={conversationId} member={m} />}
      {!m.isMe && !m.removed && canManage && <RemoveButton conversationId={conversationId} member={m} />}
    </li>
  );

  return (
    <details className="card p-0">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-fg">
        Members · {active.length}
        <span className="ml-2 text-xs font-medium text-subtle">Tap to {canManage ? "manage" : "see"}</span>
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {active.map(row)}
        {removed.map(row)}
      </ul>
      {canManage && (
        <form action={action} className="space-y-3 border-t border-border p-4">
          <input type="hidden" name="conversationId" value={conversationId} />
          <p className="label">Add people</p>
          {addable.length === 0 ? (
            <p className="text-hint">Everyone eligible is already here. Workers must be hired on one of this team&apos;s jobs.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {addable.map((c) => (
                <label key={c.profileId} className="chip">
                  <input type="checkbox" name="memberIds" value={c.profileId} className="sr-only" />
                  {c.name}
                  <span className="text-xs text-subtle">{c.role === "MANAGER" ? c.detail : "Worker"}</span>
                </label>
              ))}
            </div>
          )}
          {addable.length > 0 && <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Adding…" : "Add selected"}</button>}
          {state.message && <p role="status" className={state.ok ? "text-success-msg" : "text-danger-msg"}>{state.message}</p>}
        </form>
      )}
    </details>
  );
}
