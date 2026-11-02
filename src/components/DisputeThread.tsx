import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { LocalTime } from "@/components/LocalTime";
import { clockParts } from "@/lib/dispute-sla";
import type { Status } from "@/lib/status";
import { StatusBadge } from "@/components/StatusBadge";
import type { ThreadView } from "@/lib/dispute-thread-data";
import type { ActionState } from "@/app/jobs/actions";

const OUTCOME: Record<string, string> = { KEPT: "Pay kept as it was", ADJUSTED: "Pay adjusted", REREVIEWED: "Shift re-reviewed" };

/**
 * A pay dispute's thread (M9): the reason, the clock, every message, and a
 * composer for whoever may write. The same view on both sides; the page
 * around it adds the organization's resolve form.
 */
export function DisputeThread({ t, send, children }: { t: ThreadView; send: (p: ActionState, fd: FormData) => Promise<ActionState>; children?: React.ReactNode }) {
  const worker = t.viewer === "worker";
  const clock = clockParts(t.clock, t.viewer, t.job.orgName);
  const badge: Status = t.resolution ? { label: "Closed", state: "closed" } : t.clock.overdue ? { label: "Overdue", state: "overdue" } : { label: "Open", state: "disputed" };
  const org = t.viewer !== "worker";
  return (
    <div className="space-y-6">
      {/* A record (#116 review): one status badge, the next deadline quieter beside it, then the facts as aligned rows. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusBadge status={badge} />
        {clock && <p className={clock.overdue ? "text-danger-msg" : "text-muted-sm"}>{clock.before} <LocalTime iso={clock.due.toISOString()} />{clock.after}</p>}
      </div>
      <dl className="record-facts">
        <dt>Job</dt>
        <dd>{t.job.title}</dd>
        <dt>Shift</dt>
        <dd><Link href={`/shifts/${t.shift.id}`} className="link"><LocalTime iso={t.shift.startsAt.toISOString()} mode="date" /></Link></dd>
        <dt>{worker ? "Organization" : "Worker"}</dt>
        <dd>{worker ? t.job.orgName : t.worker.name}</dd>
        <dt>{worker ? "You said" : "Reason"}</dt>
        <dd className="record-note text-fg">{t.reason}</dd>
        <dt>Opened</dt>
        <dd><LocalTime iso={t.createdAt.toISOString()} /></dd>
        {/* The organization sees both deadlines as facts, the first reply dated once met; nothing is due once it's resolved. */}
        {org && !t.resolution && (
          <>
            <dt>First reply</dt>
            <dd>{t.clock.firstResponseMetAt ? <>Met <LocalTime iso={t.clock.firstResponseMetAt.toISOString()} /></> : <>Due <LocalTime iso={t.clock.firstResponseDue.toISOString()} /></>}</dd>
            <dt>Resolve by</dt>
            <dd><LocalTime iso={t.clock.resolutionDue.toISOString()} /></dd>
          </>
        )}
        {t.resolution && (
          <>
            <dt>Resolved</dt>
            <dd><LocalTime iso={t.resolution.createdAt.toISOString()} /></dd>
            <dt>Outcome</dt>
            <dd>{OUTCOME[t.resolution.outcome] ?? "Closed"}</dd>
            <dd className="record-note text-fg">{t.resolution.response}</dd>
          </>
        )}
      </dl>
      {org && !t.resolution && <p className="text-hint">Deadlines count business days, Monday to Friday, and show in your own time.</p>}

      <section className="space-y-3" aria-labelledby="dispute-messages-heading">
        <h2 id="dispute-messages-heading" className="section-title">Messages</h2>
        {t.messages.length === 0 && <p className="text-muted-sm">{!t.canWrite ? "No messages." : worker ? `No replies yet. ${t.job.orgName} can write here, and so can you.` : "No messages yet. Ask a question or explain what you found; the worker is told."}</p>}
        {t.messages.length > 0 && (
          <ol className="list-card">
            {t.messages.map((m) => (
              <li key={m.id} className="space-y-1 px-4 py-3">
                <p className="text-muted-sm">{m.mine ? "You" : m.author} · <LocalTime iso={m.createdAt.toISOString()} /></p>
                <p className="text-sm whitespace-pre-wrap text-fg">{m.body}</p>
              </li>
            ))}
          </ol>
        )}
        {t.canWrite ? (
          <ActionButton action={send} fields={{ disputeId: t.id }} label="Send" pendingLabel="Sending…" variant="btn-primary btn-sm">
            <label className="w-full space-y-1.5">
              <span className="label">{worker ? `Write to ${t.job.orgName}` : `Write to ${t.worker.name}`}</span>
              <textarea name="body" className="field min-h-20" required maxLength={2000} placeholder={worker ? "Add anything that helps them check: times, counts, who was there." : "Say what you checked and what you found, or ask what you need to know."} />
            </label>
          </ActionButton>
        ) : (
          !t.resolution && t.viewer === "supervisor" && <p className="text-hint">You can read this thread; only owners and finance write in it.</p>
        )}
      </section>
      {children}
    </div>
  );
}
