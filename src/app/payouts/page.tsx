import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { FIELD_ROLES, PAY_ROLES } from "@/lib/access";
import { loadOrgDisputes, loadOrgPay, partialReversals, pendingTransfers, type OrgLine } from "@/lib/pay-data";
import { stripeProvider } from "@/lib/payout-provider";
import { money, PLATFORM_FEE_BPS, statusLabel } from "@/lib/pay";
import { LocalTime } from "@/components/LocalTime";
import { ActionButton } from "@/components/ActionButton";
import { ApproveLines, HoldLine, ResolveDispute } from "@/components/PayForms";
import { approve, checkPayment, hold, payNow, release, resolve } from "./actions";

const day = (d: Date) => d.toISOString().slice(0, 10);

function LineText({ l, names }: { l: OrgLine; names: Map<string, string> }) {
  const reviewer = l.line.validation?.reviewerId ? names.get(l.line.validation.reviewerId) : null;
  return (
    <span className="block text-xs text-muted">
      {l.line.engagement?.job.title ?? "Pay"}
      {l.line.shift && (
        <>
          {" · "}
          <LocalTime iso={l.line.shift.startsAt.toISOString()} mode="date" />
        </>
      )}
      {l.formula ? ` · ${l.formula}` : ""}
      {reviewer ? ` · approved by ${reviewer}` : ""}
    </span>
  );
}

/** Owners and finance: approve pay, resolve disputes, pay workers, export the ledger. */
export default async function PayoutsPage() {
  const s = await requireRole(PAY_ROLES);
  if (!s.orgId) {
    return (
      <main className="page max-w-2xl">
        <div className="empty-state">
          <p className="empty-state-title">No organization yet</p>
          <p className="empty-state-body">Pay is managed by an organization&apos;s owner or finance team.</p>
        </div>
      </main>
    );
  }
  const actor = { profileId: s.userId, orgId: s.orgId, role: s.role };
  const canOpenShifts = FIELD_ROLES.includes(s.role);
  const [pay, disputes, closed, pending, partial] = await Promise.all([
    loadOrgPay(actor),
    loadOrgDisputes(actor, true),
    loadOrgDisputes(actor, false),
    pendingTransfers(actor),
    partialReversals(actor),
  ]);
  const stripeOn = stripeProvider().configured();
  const sum = (ls: OrgLine[]) => ls.reduce((n, l) => n + l.line.amountCents, 0);
  const readyTotal = pay.toPay.reduce((n, w) => n + Math.max(0, w.amountCents), 0);
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86_400_000);
  const nothing = !pay.awaiting.length && !pay.toPay.length && !pay.held.length && !pending.length && !pay.paid.length && !disputes.length;

  return (
    <main className="page max-w-3xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Pay</p>
          <h1 className="page-title">Payouts</h1>
          <p className="text-muted-sm">
            Supervisors approve the work; you approve the pay. Workers receive the full gross amount — the {PLATFORM_FEE_BPS / 100}% platform fee is invoiced to your organization.
          </p>
          {!stripeOn && <p className="text-hint">Stripe isn&apos;t connected yet: you can approve pay, and it&apos;s sent once Stripe is set up.</p>}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="stat">
          <p className="stat-value">{money(sum(pay.awaiting))}</p>
          <p className="stat-label">Awaiting approval</p>
        </div>
        <div className="stat">
          <p className="stat-value">{money(readyTotal)}</p>
          <p className="stat-label">Ready to pay</p>
        </div>
        <div className="stat">
          <p className="stat-value">{disputes.length}</p>
          <p className="stat-label">Open disputes</p>
        </div>
        <div className="stat">
          <p className="stat-value">{money(sum(pay.paid.filter((l) => (l.state.paidAt ?? today) >= monthAgo)))}</p>
          <p className="stat-label">Paid, last 30 days</p>
        </div>
      </div>

      {pay.conflicts.length > 0 && (
        <div className="card space-y-2 border-[var(--danger)]" role="alert">
          <p className="font-semibold text-fg">Possible double payment</p>
          {pay.conflicts.map((l) => (
            <p key={l.line.id} className="text-sm text-muted">
              {l.line.worker.displayName}: {l.state.note}
            </p>
          ))}
        </div>
      )}

      {partial.length > 0 && (
        <div className="card space-y-2" role="alert">
          <p className="font-semibold text-fg">Partly reversed in Stripe</p>
          {partial.map((r) => {
            const m = r.metadata as { reversedCents?: number; amountCents?: number; providerRef?: string };
            return (
              <p key={r.id} className="text-sm text-muted">
                {money(m.reversedCents ?? 0)} of {money(m.amountCents ?? 0)} ({m.providerRef}) was reversed on <LocalTime iso={r.createdAt.toISOString()} mode="date" />. Settle the difference with a pay adjustment.
              </p>
            );
          })}
        </div>
      )}

      {pending.length > 0 && (
        <section className="section">
          <h2 className="section-title">Waiting for Stripe</h2>
          {pending.map((t) => (
            <div key={t.id} className="card flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-fg">
                {t.worker.displayName} · {money(t.amountCents)} · started <LocalTime iso={t.createdAt.toISOString()} mode="datetime" />
              </p>
              <ActionButton action={checkPayment} fields={{ transferId: t.id }} label="Check status" pendingLabel="Checking…" variant="btn-secondary btn-sm" />
            </div>
          ))}
        </section>
      )}

      {nothing && (
        <div className="empty-state">
          <p className="empty-state-title">No pay to handle yet</p>
          <p className="empty-state-body">When a supervisor approves a shift, its pay appears here for you to approve.</p>
        </div>
      )}

      {disputes.length > 0 && (
        <section className="section">
          <h2 className="section-title">Open disputes</h2>
          {disputes.map((d) => (
            <div key={d.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="font-semibold text-fg">{d.worker}</p>
                  <p className="text-xs text-muted">
                    {d.jobTitle} ·{" "}
                    {canOpenShifts ? (
                      <Link href={`/shifts/${d.shiftId}`} className="link"><LocalTime iso={d.shiftStartsAt.toISOString()} mode="date" /></Link>
                    ) : (
                      <LocalTime iso={d.shiftStartsAt.toISOString()} mode="date" />
                    )}
                    {d.line ? ` · now ${money(d.line.amountCents)} (${d.line.formula})` : d.review?.status === "REJECTED" ? ` · not approved${d.review.reason ? `: ${d.review.reason}` : ""}` : ""}
                  </p>
                </div>
                <span className="badge-coral shrink-0">Disputed</span>
              </div>
              <blockquote className="border-l-2 border-border pl-3 text-sm text-fg">{d.reason}</blockquote>
              <ResolveDispute action={resolve} disputeId={d.id} reReviewed={!!d.review && d.review.at > d.createdAt} />
            </div>
          ))}
        </section>
      )}

      {pay.awaiting.length > 0 && (
        <section className="section">
          <h2 className="section-title">Approve pay</h2>
          <p className="text-muted-sm">Each line was calculated from verified work when a supervisor approved the shift.</p>
          <ApproveLines
            action={approve}
            rows={pay.awaiting.map((l) => ({
              id: l.line.id,
              worker: l.line.worker.displayName,
              detail: [l.line.engagement?.job.title, l.line.shift ? day(l.line.shift.startsAt) : null, l.formula].filter(Boolean).join(" · "),
              amount: money(l.line.amountCents),
              flag: l.wageFlag,
            }))}
          />
          <details className="card">
            <summary className="link cursor-pointer text-sm font-semibold">Hold a line instead</summary>
            <ul className="mt-2 divide-y divide-border">
              {pay.awaiting.map((l) => (
                <li key={l.line.id} className="space-y-1 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg">{l.line.worker.displayName}</span>
                      <LineText l={l} names={pay.names} />
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-fg">{money(l.line.amountCents)}</span>
                  </div>
                  <HoldLine action={hold} payoutId={l.line.id} />
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {pay.toPay.length > 0 && (
        <section className="section">
          <h2 className="section-title">Ready to pay</h2>
          {pay.toPay.map((w) => (
            <div key={w.workerId} className="card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-fg">{w.name}</p>
                  <p className="text-xs text-muted">
                    {w.lines} {w.lines === 1 ? "line" : "lines"} · fee {money(w.feeCents)} invoiced to you
                  </p>
                </div>
                <p className="text-lg font-bold text-fg">{money(w.amountCents)}</p>
              </div>
              {w.blocked ? (
                <p className="text-muted-sm">{w.blocked}</p>
              ) : !stripeOn ? (
                <p className="text-muted-sm">Stripe isn&apos;t connected yet, so pay can&apos;t be sent. Approved pay is kept until it is.</p>
              ) : (
                <ActionButton action={payNow} fields={{ workerId: w.workerId, expectedCents: String(w.amountCents) }} label={`Pay ${money(w.amountCents)}`} pendingLabel="Sending…" />
              )}
              <details>
                <summary className="link cursor-pointer text-xs font-semibold">Lines</summary>
                <ul className="mt-2 divide-y divide-border">
                  {w.items.map((l) => (
                    <li key={l.line.id} className="space-y-1 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <LineText l={l} names={pay.names} />
                        <span className="shrink-0 text-sm font-semibold text-fg">{money(l.line.amountCents)}</span>
                      </div>
                      {l.state.note && <p className="text-xs text-muted">{l.state.note}</p>}
                      <HoldLine action={hold} payoutId={l.line.id} />
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </section>
      )}

      {pay.held.length > 0 && (
        <section className="section">
          <h2 className="section-title">On hold</h2>
          <ul className="list-card">
            {pay.held.map((l) => (
              <li key={l.line.id} className="space-y-1 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg">{l.line.worker.displayName}</span>
                    <LineText l={l} names={pay.names} />
                    <span className="block text-xs text-muted">Reason: {l.state.heldReason}</span>
                  </span>
                  <span className="shrink-0 font-bold text-fg">{money(l.line.amountCents)}</span>
                </div>
                <ActionButton action={release} fields={{ payoutId: l.line.id }} label="Release" variant="btn-secondary btn-sm" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {pay.paid.length > 0 && (
        <section className="section">
          <h2 className="section-title">Recently paid</h2>
          <ul className="list-card">
            {pay.paid.map((l) => (
              <li key={l.line.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">{l.line.worker.displayName}</span>
                  <LineText l={l} names={pay.names} />
                  <span className="block text-xs text-subtle">
                    {l.state.paidAt && <LocalTime iso={l.state.paidAt.toISOString()} mode="date" />}
                    {l.state.paidRef ? ` · ${l.state.paidRef}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-bold text-fg">{money(l.line.amountCents)}</span>
                  <span className={statusLabel(l.state.status, l.line.amountCents).badge}>{statusLabel(l.state.status, l.line.amountCents).label}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Export</h2>
        <form action="/payouts/export" method="get" className="card flex flex-wrap items-end gap-3">
          <label className="space-y-1.5">
            <span className="label">From (UTC)</span>
            <input type="date" name="from" className="field" required defaultValue={day(monthAgo)} />
          </label>
          <label className="space-y-1.5">
            <span className="label">To (UTC)</span>
            <input type="date" name="to" className="field" required defaultValue={day(today)} />
          </label>
          <button className="btn-secondary">Download CSV</button>
          <p className="text-hint w-full">One row per pay line: payee, date, amount, fee, purpose, project, shift, who reviewed and approved it, and the Stripe reference.</p>
        </form>
      </section>

      {closed.length > 0 && (
        <section className="section">
          <h2 className="section-title">Recently closed disputes</h2>
          <ul className="list-card">
            {closed.map((d) => (
              <li key={d.id} className="space-y-0.5 px-4 py-3 text-sm">
                <p className="font-semibold text-fg">{d.worker} · {d.jobTitle}</p>
                <p className="text-xs text-muted">{d.reason}</p>
                <p className="text-xs text-muted">Response: {d.resolution?.response}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
