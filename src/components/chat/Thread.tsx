"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { useSubmit } from "@/components/chat/useSubmit";
import { edit, remove, report, send } from "@/app/messages/actions";
import type { ActionState } from "@/app/jobs/actions";
import { MAX_ATTACHMENT_BYTES, MAX_BODY, PETITION_NOTICE } from "@/lib/chat";
import { LocalTime } from "@/components/LocalTime";

export interface ClientMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderIsManager: boolean;
  mine: boolean;
  body: string | null;
  edited: boolean;
  deleted: boolean;
  createdAt: string;
  attachment: { name: string; type: string; size: number } | null;
  canEdit: boolean;
  canDelete: boolean;
}

const IMAGE_FILE = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?|svg)$/i;
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function MessageActions({ m, conversationId }: { m: ClientMessage; conversationId: string }) {
  const [mode, setMode] = useState<"menu" | "edit" | "report" | null>(null);
  const [text, setText] = useState(m.body ?? "");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<ActionState | null>(null);
  const [pending, start] = useTransition();
  const toggle = useRef<HTMLButtonElement>(null);
  const canReport = !m.mine && !m.deleted;
  if (!m.canEdit && !m.canDelete && !canReport) return null;
  // Closing returns focus to the ··· button it came from.
  const close = () => {
    setMode(null);
    requestAnimationFrame(() => toggle.current?.focus());
  };

  const run = (p: Promise<ActionState>, after?: () => void) =>
    start(async () => {
      const r = await p;
      setMsg(r);
      if (r.ok) after?.();
    });

  return (
    <div className={`flex flex-col gap-1 ${m.mine ? "items-end" : "items-start"}`}>
      {mode === null && (
        <button
          ref={toggle}
          type="button"
          className="-mt-1 rounded px-1.5 text-sm font-bold leading-none text-subtle hover:text-fg"
          onClick={() => { setMsg(null); setMode("menu"); }}
          aria-label="Message options"
          aria-haspopup="true"
        >
          ···
        </button>
      )}
      {mode === "menu" && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Message options">
          {m.canEdit && <button type="button" className="btn-ghost btn-sm" autoFocus onClick={() => setMode("edit")}>Edit</button>}
          {m.canDelete && (
            <button type="button" className="btn-ghost btn-sm" disabled={pending}
              onClick={() => confirm("Delete this message? Everyone will see “Message deleted”.") && run(remove(conversationId, m.id), close)}>
              Delete
            </button>
          )}
          {canReport && <button type="button" className="btn-ghost btn-sm" autoFocus={!m.canEdit} onClick={() => setMode("report")}>Report</button>}
          <button type="button" className="btn-ghost btn-sm" onClick={close}>Close</button>
        </div>
      )}
      {mode === "edit" && (
        <form className="w-full max-w-md space-y-2" onSubmit={(e) => { e.preventDefault(); run(edit(conversationId, m.id, text), close); }}>
          <label className="sr-only" htmlFor={`edit-${m.id}`}>Edit message</label>
          <textarea id={`edit-${m.id}`} autoFocus className="field" rows={3} maxLength={MAX_BODY} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={close}>Cancel</button>
            <button className="btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : "Save edit"}</button>
          </div>
        </form>
      )}
      {mode === "report" && (
        <form className="w-full max-w-md space-y-2" onSubmit={(e) => { e.preventDefault(); run(report(m.id, reason), close); }}>
          <label className="label text-xs" htmlFor={`report-${m.id}`}>What&apos;s wrong with this message?</label>
          <input id={`report-${m.id}`} autoFocus className="field" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. harassment, pressure about politics" required />
          <p className="text-hint">The organization&apos;s owner reviews reports. The sender isn&apos;t told who reported it.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={close}>Cancel</button>
            <button className="btn-secondary btn-sm" disabled={pending}>{pending ? "Sending…" : "Report"}</button>
          </div>
        </form>
      )}
      {msg?.message && <p role="status" className={`text-xs ${msg.ok ? "text-success-msg" : "text-danger-msg"}`}>{msg.message}</p>}
    </div>
  );
}

export function MessageList({
  messages,
  conversationId,
  group,
  hasOlder,
  canPost,
}: {
  messages: ClientMessage[];
  conversationId: string;
  group: boolean;
  hasOlder: boolean;
  canPost: boolean;
}) {
  const last = messages.at(-1);
  const first = useRef(true);
  const atBottom = useRef(true);
  // Where the reader is, measured before new messages render.
  useEffect(() => {
    const root = document.scrollingElement ?? document.documentElement;
    const onScroll = () => {
      atBottom.current = root.scrollHeight - root.scrollTop - root.clientHeight < 240;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Layout effect: runs before paint (and before a page transition takes its
  // snapshot), so the thread slides in already at the newest message.
  useLayoutEffect(() => {
    const root = document.scrollingElement ?? document.documentElement;
    // Open at the newest message (composer in view); afterwards follow new
    // messages if the reader was at the bottom, or if they sent it.
    if (first.current || atBottom.current || last?.mine) root.scrollTo({ top: root.scrollHeight });
    first.current = false;
  }, [last?.id, last?.mine]);

  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">No messages yet</p>
        <p className="empty-state-body">{canPost ? "Say hello — or tap a quick reply below." : "Nothing was sent here."}</p>
      </div>
    );
  }
  return (
    <ol className="space-y-3" aria-label="Messages">
      {hasOlder && <li className="text-hint text-center">Showing the latest 200 messages.</li>}
      {messages.map((m, i) => {
        // Name (and Manager badge) whenever the sender changes.
        const showName = !m.mine && messages[i - 1]?.senderId !== m.senderId;
        return (
          <li key={m.id} className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
            {showName && (group || m.senderIsManager) && (
              <span className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted">
                {m.senderName}
                {m.senderIsManager && <span className="badge-neutral">Manager</span>}
              </span>
            )}
            <div className={`bubble ${m.deleted ? "bubble-deleted" : m.mine ? "bubble-mine" : "bubble-theirs"}`}>
              {m.deleted ? "Message deleted" : m.body}
              {m.attachment && !m.deleted && (
                <a href={`/messages/attachment/${m.id}`} className="link mt-1 flex items-center gap-2 text-sm" download>
                  <span aria-hidden>📄</span>
                  <span className="truncate">{m.attachment.name}</span>
                  <span className="shrink-0 text-xs opacity-75">{kb(m.attachment.size)}</span>
                </a>
              )}
            </div>
            <div className={`mt-0.5 flex items-start gap-1 px-1 ${m.mine ? "flex-row-reverse" : ""}`}>
              <span className="text-[0.75rem] text-subtle">
                <LocalTime iso={m.createdAt} mode="time" />
                {m.edited && " · edited"}
              </span>
              <MessageActions m={m} conversationId={conversationId} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const WORKER_REPLIES = ["On my way", "Running about 10 min late", "At staging", "Packet returned", "Can't make it — calling you"];
const MANAGER_REPLIES = ["Thanks!", "Where are you?", "See you at staging", "Great work today"];

export function Composer({ conversationId, manager }: { conversationId: string; manager: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const typing = body.trim().length > 0;
  // A failed send keeps the text and the file (no auto-reset); success clears both.
  const { state, pending, onSubmit } = useSubmit(send, (r, f) => {
    if (!r.ok) return;
    f.reset();
    setBody("");
    setFile(null);
  });

  function pick(f: File | undefined) {
    setFileError(null);
    if (!f) return setFile(null);
    // The server enforces all of this; checking here saves a wasted upload.
    if (f.type.startsWith("image/") || IMAGE_FILE.test(f.name)) {
      setFileError(`Photos can't be shared in Turfcut chats. ${PETITION_NOTICE}`);
    } else if (f.size > MAX_ATTACHMENT_BYTES) {
      setFileError("Files can be up to 4 MB.");
    } else {
      return setFile(f);
    }
    if (fileInput.current) fileInput.current.value = "";
    setFile(null);
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="card space-y-3" aria-label="Send a message">
      <input type="hidden" name="conversationId" value={conversationId} />
      {/* One tap for the common field updates; hidden once you start typing so a draft is never replaced. */}
      {!typing && !file && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Quick replies">
          {(manager ? MANAGER_REPLIES : WORKER_REPLIES).map((q) => (
            <button key={q} name="quick" value={q} className="quick-reply" disabled={pending}>{q}</button>
          ))}
        </div>
      )}
      <label className="sr-only" htmlFor="chat-body">Message</label>
      <textarea
        id="chat-body"
        name="body"
        className="field min-h-20"
        rows={2}
        maxLength={MAX_BODY}
        placeholder="Write a message…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !pending) form.current?.requestSubmit();
        }}
      />
      {file && (
        <p className="flex items-center gap-2 text-sm text-fg">
          <span aria-hidden>📄</span>
          <span className="truncate">{file.name}</span>
          <span className="text-xs text-subtle">{kb(file.size)}</span>
          <button type="button" className="btn-ghost btn-sm" onClick={() => { if (fileInput.current) fileInput.current.value = ""; setFile(null); }}>
            Remove
          </button>
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <label className="btn-ghost btn-sm cursor-pointer">
          <input ref={fileInput} type="file" name="file" className="sr-only" accept=".pdf,.docx,.xlsx,.txt,.csv" onChange={(e) => pick(e.target.files?.[0])} />
          Attach document
        </label>
        <button className="btn-primary" disabled={pending}>{pending ? "Sending…" : "Send"}</button>
      </div>
      {/* Persistent custody reminder (spec): always visible in the composer. */}
      <p className="alert alert-warning text-xs" role="note">
        <strong>{PETITION_NOTICE.split(". ")[0]}.</strong> {PETITION_NOTICE.split(". ").slice(1).join(". ")} Documents only: PDF, Word, Excel or text, up to 4 MB.
      </p>
      {fileError && <p role="alert" className="text-danger-msg">{fileError}</p>}
      {state.message && !state.ok && <p role="alert" className="text-danger-msg">{state.message}</p>}
    </form>
  );
}
