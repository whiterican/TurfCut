import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { listOpenReports } from "@/lib/chat-data";
import { ReportActions } from "@/components/chat/ReportActions";
import { LocalTime } from "@/components/LocalTime";

export const metadata = { title: "Message reports · Turfcut" };

/** The org owner's queue of reported messages. Every decision is audited. */
export default async function ReportsPage() {
  const session = await requireAuth();
  if (session.role !== "OWNER" || !session.orgId) redirect("/messages");
  const reports = await listOpenReports({ userId: session.userId, role: session.role, orgId: session.orgId });

  return (
    <main className="page max-w-2xl">
      <header className="space-y-1">
        <Link href="/messages" className="link text-sm">← Messages</Link>
        <h1 className="page-title">Message reports</h1>
        <p className="text-muted-sm">
          Messages people in your organization reported. Remove one to replace it with &ldquo;Message deleted&rdquo; for everyone — the original stays in the audit trail — or dismiss the report.
        </p>
      </header>
      {reports.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No open reports</p>
          <p className="empty-state-body">When someone reports a message, it shows up here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="card space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="eyebrow">{r.conversationTitle}</p>
                <p className="text-xs text-subtle">
                  Reported <LocalTime iso={r.reportedAt.toISOString()} />
                </p>
              </div>
              <blockquote className="card-flat whitespace-pre-wrap text-sm text-fg">{r.bodySnapshot || "(attachment only)"}</blockquote>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="kv"><dt>Sent by</dt><dd>{r.senderName} · <LocalTime iso={r.sentAt.toISOString()} /></dd></div>
                <div className="kv"><dt>Reported by</dt><dd>{r.reporterName}</dd></div>
              </dl>
              <p className="text-sm text-fg"><span className="font-semibold">Reason:</span> {r.reason}</p>
              <ReportActions reportId={r.id} messageId={r.messageId} conversationId={r.conversationId} deleted={r.deleted} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
