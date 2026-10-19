import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { money, statusLabel } from "@/lib/pay";
import { DISPUTE_SLA } from "@/lib/dispute-sla";
import type { StatementLine, StatementView as View } from "@/lib/statements-data";

const OUTCOME: Record<string, string> = { KEPT: "Pay kept", ADJUSTED: "Pay adjusted", REREVIEWED: "Shift re-reviewed" };

function Amount({ cents, bold = false }: { cents: number; bold?: boolean }) {
  return <span className={`shrink-0 tabular-nums ${bold ? "font-bold" : ""} text-fg`}>{money(cents)}</span>;
}

function LineRow({ l, showStatus = true }: { l: StatementLine; showStatus?: boolean }) {
  const st = l.withdrawnAfterClose ? { label: "Withdrawn after this statement closed", badge: "badge-neutral" } : statusLabel(l.status, l.amountCents);
  return (
    <li className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium text-fg">
          {l.worker}
          {l.shiftStartsAt && (
            <>
              {" · "}
              {l.shiftId ? <Link href={`/shifts/${l.shiftId}`} className="link"><LocalTime iso={l.shiftStartsAt.toISOString()} mode="fulldate" /></Link> : <LocalTime iso={l.shiftStartsAt.toISOString()} mode="fulldate" />}
            </>
          )}
        </p>
        <p className="text-xs text-muted">
          {l.jobTitle ?? "Other pay"} · {l.formula}
          {l.corrects ? ` · corrects ${l.corrects}` : ""}
          {l.receipt ? ` · ${l.receipt}` : ""}
        </p>
        {showStatus && <span className={st.badge}>{st.label}</span>}
      </div>
      <div className="shrink-0 text-right">
        <Amount cents={l.amountCents} />
        {l.feeCents !== 0 && <span className="block text-xs text-muted tabular-nums">+ {money(l.feeCents)} fee</span>}
      </div>
    </li>
  );
}

/** One month's statement (M9.3) for owners and finance. Printable. */
export function StatementView({ s }: { s: View }) {
  const t = s.totals;
  const drift = s.status === "closed" && (s.live.grossCents !== t.grossCents || s.live.lineCount !== t.lineCount);
  return (
    <article className="space-y-6">
      <section className="card space-y-4 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="eyebrow">Statement {s.number}</p>
            <p className="text-2xl font-bold text-fg">{s.label}</p>
            <p className="text-muted-sm">
              {s.status === "closed" && s.closedAt ? (
                <>Closed <LocalTime iso={s.closedAt.toISOString()} mode="full" />{s.closedBy ? ` · first opened by ${s.closedBy}` : ""}. Its totals never change.</>
              ) : (
                "This month is still running: totals move until it ends."
              )}
            </p>
          </div>
          <span className={s.status === "closed" ? "badge-neutral" : "badge-butter"}>{s.status === "closed" ? "Closed" : "In progress"}</span>
        </header>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">Pay recorded</dt>
            <dd className="text-lg font-bold text-fg tabular-nums">{money(t.grossCents)}</dd>
            <dd className="text-xs text-muted">{t.lineCount} {t.lineCount === 1 ? "line" : "lines"} · {money(t.feeCents)} platform fee</dd>
          </div>
          <div>
            <dt className="text-muted">Your cost</dt>
            <dd className="text-lg font-bold text-fg tabular-nums">{money(t.grossCents + t.feeCents)}</dd>
            <dd className="text-xs text-muted">pay plus fee</dd>
          </div>
          <div>
            <dt className="text-muted">Sent to workers</dt>
            <dd className="text-lg font-bold text-fg tabular-nums">{money(t.paidCents)}</dd>
            <dd className="text-xs text-muted">{t.paidCount} {t.paidCount === 1 ? "payment" : "payments"}{t.reversedCents ? ` · ${money(t.reversedCents)} came back` : ""}</dd>
          </div>
          <div>
            <dt className="text-muted">Corrections to earlier months</dt>
            <dd className="text-lg font-bold text-fg tabular-nums">{money(t.correctionsCents)}</dd>
            <dd className="text-xs text-muted">{s.corrections.length ? `${s.corrections.length} ${s.corrections.length === 1 ? "line" : "lines"} below` : "none"}</dd>
          </div>
        </dl>
        {drift && (
          <p className="text-hint">
            Since this statement closed, a line was withdrawn: the ledger now shows {money(s.live.grossCents)} recorded for the month. The withdrawal counts as a correction on the next statement; the totals above stay as they were.
          </p>
        )}
      </section>

      {s.campaigns.length > 0 && (
        <section className="section">
          <h2 className="section-title">By campaign</h2>
          <ul className="card divide-y divide-border text-sm">
            {s.campaigns.map((c) => (
              <li key={c.jobId ?? "other"} className="flex items-center justify-between gap-4 py-2">
                <span className="min-w-0">
                  <span className="block font-medium text-fg">{c.jobId ? <Link href={`/jobs/${c.jobId}`} className="link">{c.title}</Link> : c.title}</span>
                  <span className="block text-xs text-muted">{c.lineCount} {c.lineCount === 1 ? "line" : "lines"} · {money(c.feeCents)} fee</span>
                </span>
                <Amount cents={c.grossCents} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Pay recorded this month</h2>
        {s.lines.length === 0 ? (
          <p className="text-muted-sm">No pay was recorded this month.</p>
        ) : (
          <ul className="card divide-y divide-border text-sm">
            {s.lines.map((l) => <LineRow key={l.id} l={l} />)}
            <li className="flex items-center justify-between gap-4 pt-3">
              <span className="font-semibold text-fg">Recorded</span>
              <Amount cents={t.grossCents} bold />
            </li>
          </ul>
        )}
        <p className="text-hint">Every amount was fixed when it was approved and never changed after; a correction is always a new line. Gross pay: workers receive it in full, and the platform fee is invoiced to you on top.</p>
      </section>

      <section className="section">
        <h2 className="section-title">Payments sent this month</h2>
        {s.payments.length === 0 ? (
          <p className="text-muted-sm">No payments went out this month.</p>
        ) : (
          <ul className="card divide-y divide-border text-sm">
            {s.payments.map((p) => (
              <li key={p.transferId} className="flex items-start justify-between gap-4 py-2">
                <span className="min-w-0 space-y-0.5">
                  <span className="block font-medium text-fg">{p.worker} · {p.receipt}</span>
                  <span className="block text-xs text-muted">
                    <LocalTime iso={p.paidAt.toISOString()} mode="full" />
                    {p.providerRef ? ` · Stripe ${p.providerRef}` : ""}
                    {p.reversedAt ? " · reversed" : ""}
                  </span>
                </span>
                <Amount cents={p.amountCents} />
              </li>
            ))}
            <li className="flex items-center justify-between gap-4 pt-3">
              <span className="font-semibold text-fg">Sent</span>
              <Amount cents={t.paidCents} bold />
            </li>
          </ul>
        )}
        <p className="text-hint">A line recorded one month and paid the next appears on both statements: here with its receipt, there as a payment.</p>
      </section>

      {s.corrections.length > 0 && (
        <section className="section">
          <h2 className="section-title">Corrections to earlier statements</h2>
          <ul className="card divide-y divide-border text-sm">
            {s.corrections.map((l) => <LineRow key={`c-${l.id}`} l={l} />)}
          </ul>
          <p className="text-hint">A closed statement never changes. An adjustment or a withdrawal that lands after it closed is recorded here, in the month it happened, naming the statement it corrects.</p>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Disputes</h2>
        {s.disputes.length === 0 ? (
          <p className="text-muted-sm">No pay disputes were open this month.</p>
        ) : (
          <ul className="card divide-y divide-border text-sm">
            {s.disputes.map((d) => (
              <li key={d.id} className="space-y-0.5 py-2">
                <p className="font-medium text-fg">
                  <Link href={`/pay/disputes/${d.id}`} className="link">{d.worker} · {d.jobTitle}</Link>
                </p>
                <p className="text-xs text-muted">
                  Opened <LocalTime iso={d.openedAt.toISOString()} mode="fulldate" />
                  {d.clock.daysToFirstResponse !== null ? ` · first reply in ${d.clock.daysToFirstResponse} business ${d.clock.daysToFirstResponse === 1 ? "day" : "days"}` : " · no reply yet"}
                  {d.resolvedAt ? ` · resolved in ${d.clock.daysToResolution} business ${d.clock.daysToResolution === 1 ? "day" : "days"} (${OUTCOME[d.outcome ?? ""] ?? d.outcome})` : " · still open"}
                </p>
                <span className={`${d.onTime === null ? (d.clock.overdue ? "badge-coral" : "badge-butter") : d.onTime ? "badge-accent" : "badge-coral"}`}>
                  {d.onTime === null ? (d.clock.overdue ? "Overdue" : "Open") : d.onTime ? "On time" : "Late"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-hint">On time means a first reply within {DISPUTE_SLA.firstResponseDays} business days and a resolution within {DISPUTE_SLA.resolutionDays}, counted from when the worker opened it.</p>
      </section>
    </article>
  );
}
