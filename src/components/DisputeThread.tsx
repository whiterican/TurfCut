import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { LocalTime } from "@/components/LocalTime";
import { clockParts } from "@/lib/dispute-sla";
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
  const badge = t.resolution ? { label: "Closed", badge: "badge-neutral" } : t.clock.overdue ? { label: "Overdue", badge: "badge-coral" } : { label: "Open", badge: "badge-butter" };
  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="eyebrow">Pay dispute</p>
            <p className="font-bold text-fg">{t.job.title}</p>
            <p className="text-muted-sm">
              Shift on{" "}
              <Link href={`/shifts/${t.shift.id}`} className="link"><LocalTime iso={t.shift.startsAt.toISOString()} mode="date" /></Link>
              {worker ? ` · ${t.job.orgName}` : ` · ${t.worker.name}`}
            </p>
          </div>
          <span className={badge.badge}>{badge.label}</span>
        </div>
        <blockquote className="border-l-2 border-border pl-3 text-sm text-fg">{t.reason}</blockquote>
        <p className="text-xs text-muted">
          Opened <LocalTime iso={t.createdAt.toISOString()} />
          {clock && (
            <>
              {" · "}{clock.before} <LocalTime iso={clock.due.toISOString()} />{clock.after}
            </>
          )}
        </p>
        {!t.resolution && (
          <p className="text-xs text-muted">
            Deadlines, in your own time: first reply by <LocalTime iso={t.clock.firstResponseDue.toISOString()} />
            {t.clock.firstResponseMetAt ? " (met)" : ""}, resolution by <LocalTime iso={t.clock.resolutionDue.toISOString()} />. Counted in business days, Monday to Friday.
          </p>
        )}
        {t.resolution && (
          <div className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-fg">
            <p className="font-semibold">{OUTCOME[t.resolution.outcome] ?? "Closed"} · <LocalTime iso={t.resolution.createdAt.toISOString()} mode="date" /></p>
            <p>{t.resolution.response}</p>
          </div>
        )}
      </section>

      <section className="space-y-3" aria-label="Messages">
        {t.messages.length === 0 && <p className="text-muted-sm">{worker ? `No replies yet. ${t.job.orgName} can write here, and so can you.` : "No messages yet. Ask a question or explain what you found; the worker is told."}</p>}
        <ol className="space-y-3">
          {t.messages.map((m) => (
            <li key={m.id} className={`max-w-[85%] space-y-1 ${m.mine ? "ml-auto" : ""}`}>
              <div className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${m.mine ? "bg-[var(--accent)] text-[var(--ink)]" : "bg-surface-2 text-fg"}`}>{m.body}</div>
              <p className={`text-xs text-muted ${m.mine ? "text-right" : ""}`}>
                {m.author} · <LocalTime iso={m.createdAt.toISOString()} />
              </p>
            </li>
          ))}
        </ol>
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
