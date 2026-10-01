"use client";

import { useState, useTransition } from "react";
import { dismissReport, remove } from "@/app/messages/actions";
import type { ActionState } from "@/app/jobs/actions";

export function ReportActions({ reportId, messageId, conversationId, deleted }: { reportId: string; messageId: string; conversationId: string; deleted: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!deleted && (
          <button type="button" className="btn-primary btn-sm" disabled={pending}
            onClick={() => confirm("Remove this message for everyone? It's replaced with “Message deleted”; the original stays in the audit trail.") && start(async () => setMsg(await remove(conversationId, messageId)))}>
            Remove message
          </button>
        )}
        <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => setMsg(await dismissReport(reportId)))}>
          {deleted ? "Close report" : "Dismiss"}
        </button>
      </div>
      {msg?.message && <p role="status" className={msg.ok ? "text-success-msg" : "text-danger-msg"}>{msg.message}</p>}
    </div>
  );
}
