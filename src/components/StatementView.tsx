import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { money, statusLabel } from "@/lib/pay";
import type { Status } from "@/lib/status";
import { StatusBadge, StatusChip } from "@/components/StatusBadge";
import { DISPUTE_SLA } from "@/lib/dispute-sla";
import type { StatementLine, StatementView as View } from "@/lib/statements-data";

const OUTCOME: Record<string, string> = { KEPT: "Pay kept", ADJUSTED: "Pay adjusted", REREVIEWED: "Shift re-reviewed" };

function Amount({ cents, bold = false }: { cents: number; bold?: boolean }) {
  return <span className={`shrink-0 tabular-nums ${bold ? "font-bold" : ""} text-fg`}>{money(cents)}</span>;
}

/**
 * A statement's lines as a ledger table (#116 review): worker, date with the job under it, basis,
 * pay, fee and the line's current state, read from the live ledger and labelled so; amounts
 * right-aligned, a subtotal under them. The job sits under the date (tablet pass, #136): as its own
 * column it wrapped one word to a line at 768, and no width for it kept Current state in view.
 * On a phone each line stacks into named rows (the DataTable `stack` CSS).
 */
function LinesTable({ lines, caption, total, markUncounted = false }: { lines: StatementLine[]; caption: string; total?: { label: string; grossCents: number; feeCents: number }; markUncounted?: boolean }) {
  return (
    <div className="data-table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table role="table" className="data-table data-table-stack statement-lines">
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">Worker</th>
            <th role="columnheader" scope="col"><span aria-hidden>Date · Job</span><span className="sr-only">Date and job</span></th>
            <th role="columnheader" scope="col">Basis</th>
            <th role="columnheader" scope="col" className="text-right">Pay</th>
            <th role="columnheader" scope="col" className="text-right">Fee</th>
            <th role="columnheader" scope="col">Current state</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {lines.map((l) => {
            const st: Status = l.withdrawnAfterClose ? { label: "Withdrawn after this statement closed", state: "closed" } : statusLabel(l.status, l.amountCents);
            // In the month's own lines, withdrawn while the month was open: listed for the record, not counted, and marked so the column
            // adds up. Not in Corrections, where an earlier month's withdrawal is a credit that is counted (in the Corrections figure).
            const uncounted = markUncounted && l.status === "VOIDED" && !l.withdrawnAfterClose;
            const amount = (cents: number) => (uncounted ? <>({money(cents)})<span className="sr-only">, not counted</span></> : money(cents));
            return (
              <tr key={l.id} role="row">
                <th role="rowheader" scope="row">{l.worker}</th>
                <td role="cell" data-label="Date · Job" className="statement-date-job">
                  {/* One block, so a phone's stacked row (a flex row) keeps the job under the date. */}
                  <span className="block">
                    {l.shiftStartsAt ? (l.shiftId ? <Link href={`/shifts/${l.shiftId}`} className="link"><LocalTime iso={l.shiftStartsAt.toISOString()} mode="fulldate" /></Link> : <LocalTime iso={l.shiftStartsAt.toISOString()} mode="fulldate" />) : "—"}
                    <span className="statement-job">{l.jobTitle ?? "Other pay"}</span>
                  </span>
                </td>
                <td role="cell" data-label="Basis" className="text-muted">
                  {/* A rate stays with its "×", and a reference never breaks at its hyphens. */}
                  {l.formula.replace(/ × /g, "\u00a0×\u00a0")}
                  {l.corrects && <> · <span className="whitespace-nowrap">corrects {l.corrects}</span></>}
                  {l.receipt && <> · <span className="whitespace-nowrap">{l.receipt}</span></>}
                </td>
                <td role="cell" data-label="Pay" className="num">{amount(l.amountCents)}</td>
                <td role="cell" data-label="Fee" className="num">{amount(l.feeCents)}</td>
                <td role="cell" data-label="Current state"><StatusBadge status={st} /></td>
              </tr>
            );
          })}
          {total && (
            <tr role="row" className="statement-subtotal">
              <th role="rowheader" scope="row" colSpan={3} aria-colspan={3}>{total.label}</th>
              <td role="cell" data-label="Pay" className="num">{money(total.grossCents)}</td>
              <td role="cell" data-label="Fee" className="num">{money(total.feeCents)}</td>
              <td role="cell" />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** One month's statement (M9.3) for owners and finance. Printable. */
export function StatementView({ s }: { s: View }) {
  const t = s.totals;
  const NAMES: Record<keyof typeof t, string> = { grossCents: "pay recorded", feeCents: "platform fee", lineCount: "lines", paidCents: "sent to workers", paidCount: "payments", reversedCents: "came back", correctionsCents: "corrections" };
  const drift = s.status === "closed" ? (Object.keys(NAMES) as Array<keyof typeof t>).filter((k) => s.live[k] !== t[k]) : [];
  return (
    <article className="space-y-6">
      <section className="card space-y-4 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-3">
          {/* The page heading names the month and number; the card says where its totals stand. */}
          <div className="space-y-0.5">
            <h2 className="sr-only">Totals for {s.label}</h2>
            <p className="text-muted-sm">
              {s.status === "closed" && s.closedAt ? (
                <>Closed <LocalTime iso={s.closedAt.toISOString()} mode="full" />{s.closedBy ? ` · first opened by ${s.closedBy}` : ""}. Its totals never change.</>
              ) : (
                "This month is still running: totals move until it ends."
              )}
            </p>
          </div>
          <StatusChip state={s.status === "closed" ? "closed" : "pending"} label={s.status === "closed" ? "Closed" : "In progress"} />
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
            {t.reversedCents > 0 && <dd className="text-xs text-muted">A full reversal brings the lines back to pay; a partial one is a deduction line under Pay recorded.</dd>}
          </div>
          <div>
            <dt className="text-muted">Corrections</dt>
            <dd className="text-lg font-bold text-fg tabular-nums">{money(t.correctionsCents)}</dd>
            <dd className="text-xs text-muted">
              to earlier months
              {t.correctionsCents !== 0 || s.corrections.length ? `: ${money(s.parts.adjustmentsToEarlierCents)} adjusted (already in Pay recorded) and ${money(s.parts.withdrawnEarlierCents)} withdrawn (a credit, not in any total above)` : ""}
            </dd>
          </div>
        </dl>
        {drift.length > 0 && (
          <p className="text-hint">
            Since this statement closed, the ledger changed for this month ({drift.map((k) => NAMES[k]).join(", ")}; pay recorded now reads {money(s.live.grossCents)}). The totals above stay as they were; a line withdrawn after close is marked below and carried as a credit on the statement for the month it happened in.
          </p>
        )}
      </section>

      {s.campaigns.length > 0 && (
        <section className="section">
          <h2 className="section-title">By campaign</h2>
          <ul className="list-card text-sm">
            {s.campaigns.map((c) => (
              <li key={c.jobId ?? "other"} className="flex items-center justify-between gap-4 px-4 py-3">
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
          <LinesTable lines={s.lines} caption={`Pay recorded in ${s.label}`} total={{ label: "Recorded", grossCents: t.grossCents, feeCents: t.feeCents }} markUncounted />
        )}
        <p className="text-hint">Current state is each line&apos;s state today; the amounts and the Recorded total are the month&apos;s own. An amount in brackets was withdrawn while the month was open and isn&apos;t counted. Every amount was fixed when it was approved and never changed after; a correction is always a new line. Gross pay: workers receive it in full, and the platform fee is invoiced to you on top.</p>
      </section>

      <section className="section">
        <h2 className="section-title">Payments sent this month</h2>
        {s.payments.length === 0 ? (
          <p className="text-muted-sm">No payments went out this month.</p>
        ) : (
          <ul className="list-card text-sm">
            {s.payments.map((p) => (
              <li key={p.transferId} className="flex items-start justify-between gap-4 px-4 py-3">
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
            <li className="flex items-center justify-between gap-4 bg-surface-2 px-4 py-3">
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
          <LinesTable lines={s.corrections} caption={`Corrections recorded in ${s.label} to earlier statements`} />
          <p className="text-hint">A closed statement never changes. An adjustment or a withdrawal that lands after it closed is recorded here, in the month it happened, naming the statement it corrects. An adjustment is also a line of this month&apos;s Pay recorded; a withdrawn line is a credit against what that earlier statement showed, counted nowhere else.</p>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Disputes</h2>
        {s.disputes.length === 0 ? (
          <p className="text-muted-sm">No pay disputes were open this month.</p>
        ) : (
          <ul className="list-card text-sm">
            {s.disputes.map((d) => (
              <li key={d.id} className="space-y-0.5 px-4 py-3">
                <p className="font-medium text-fg">
                  <Link href={`/pay/disputes/${d.id}`} className="link">{d.worker} · {d.jobTitle}</Link>
                </p>
                <p className="text-xs text-muted">
                  Opened <LocalTime iso={d.openedAt.toISOString()} mode="fulldate" />
                  {d.clock.daysToFirstResponse !== null ? ` · first reply in ${d.clock.daysToFirstResponse} business ${d.clock.daysToFirstResponse === 1 ? "day" : "days"}` : " · no reply yet"}
                  {d.resolvedAt ? ` · resolved in ${d.clock.daysToResolution} business ${d.clock.daysToResolution === 1 ? "day" : "days"} (${OUTCOME[d.outcome ?? ""] ?? d.outcome})` : " · still open"}
                </p>
                <StatusChip
                  state={d.onTime === null ? (d.clock.overdue ? "overdue" : "disputed") : d.onTime ? "approved" : "overdue"}
                  label={d.onTime === null ? (d.clock.overdue ? "Overdue" : "Open") : d.onTime ? "On time" : "Late"}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="text-hint">On time means a first reply within {DISPUTE_SLA.firstResponseDays} business days and a resolution within {DISPUTE_SLA.resolutionDays}, counted from when the worker opened it.</p>
      </section>
    </article>
  );
}
