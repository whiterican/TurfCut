import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadWorkerEarnings, type EarningShift } from "@/lib/pay-data";
import { PayBadge } from "@/components/Moments";
import { money, statusLabel } from "@/lib/pay";
import { LocalTime } from "@/components/LocalTime";
import { clockParts } from "@/lib/dispute-sla";
import { ActionButton } from "@/components/ActionButton";
import { dispute, managePayouts, setUpPayouts } from "./actions";
import { payoutSetup } from "@/lib/pay-data";
import { stripeProvider } from "@/lib/payout-provider";
import { EmptyArt } from "@/components/EmptyState";

const SETUP_NOTE: Record<string, string> = {
  done: "Thanks — Stripe is checking your details. This can take a minute.",
  error: "Stripe didn't respond. Try again in a moment.",
  unavailable: "In-app payouts aren't switched on yet.",
};

/** Where the worker's payouts go, and the button to set them up. */
type PayoutState = Awaited<ReturnType<typeof payoutSetup>>;

async function PayoutSetup({ w, note }: { w: PayoutState; note: string | null }) {
  const provider = stripeProvider();
  return (
    <section className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold text-fg">Payouts</p>
          <p className="text-muted-sm"><Link href="/earnings/receipts" className="link">Receipts</Link> · one for every payment sent to you.</p>
          <p className="text-muted-sm">
            {!provider.configured()
              ? "In-app payouts aren't switched on yet. Approved pay is kept and sent once they are."
              : w.payoutsEnabled
                ? "Approved pay goes to your bank account through Stripe."
                : w.stripeAccountId
                  ? "Finish setting up with Stripe so you can be paid."
                  : "Set up payouts once and approved pay goes straight to your bank. Stripe collects your bank and tax details — Turfcut never sees them."}
          </p>
        </div>
        {w.payoutsEnabled && <span className="badge-solid shrink-0">Ready</span>}
      </div>
      {provider.configured() &&
        (w.payoutsEnabled ? (
          <form action={managePayouts}>
            <button className="btn-secondary btn-sm">Payout details and tax forms</button>
          </form>
        ) : (
          <form action={setUpPayouts}>
            <button className="btn-primary">{w.stripeAccountId ? "Finish setup with Stripe" : "Set up payouts"}</button>
          </form>
        ))}
      {note && SETUP_NOTE[note] && !(note === "done" && w.payoutsEnabled) && <p role="status" className="text-hint">{SETUP_NOTE[note]}</p>}
    </section>
  );
}

const OUTCOME: Record<string, string> = {
  KEPT: "Pay kept as it was",
  ADJUSTED: "Pay adjusted",
  REREVIEWED: "Shift re-reviewed",
};

/** The dispute's deadline in the worker's own time. */
function Clock({ parts }: { parts: ReturnType<typeof clockParts> }) {
  if (!parts) return null;
  return (
    <>
      {parts.before} <LocalTime iso={parts.due.toISOString()} />{parts.after}
    </>
  );
}

function ShiftRow({ s, orgName, payouts }: { s: EarningShift; orgName: string; payouts: boolean }) {
  const main = s.lines.find((l) => l.kind === "SHIFT");
  const adjustments = s.lines.filter((l) => l.kind === "ADJUSTMENT");
  const open = s.disputes.find((d) => !d.resolution);
  const last = s.disputes.at(-1);
  const badge = main ? statusLabel(main.state.status, main.amountCents, { payouts }) : s.review?.status === "REJECTED" ? { label: "Not approved", badge: "badge-coral" } : null;
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-fg">
            <Link href={`/shifts/${s.shiftId}`} className="link">
              <LocalTime iso={s.startsAt.toISOString()} mode="date" />
            </Link>
          </p>
          {main?.formula && <p className="text-xs text-muted">{main.formula}</p>}
          {s.corrections.map((c, i) => (
            <p key={i} className="text-xs text-muted">Corrected by your supervisor: {c.reason}</p>
          ))}
          {!main && s.review?.status === "REJECTED" && <p className="text-xs text-muted">{s.review.reason ? `Reason: ${s.review.reason}` : "No reason given."}</p>}
          {!main && s.review?.status === "APPROVED" && <p className="text-xs text-muted">Approved before in-app pay — no pay line recorded. Ask {orgName} if you&apos;re missing pay.</p>}
        </div>
        <div className="shrink-0 space-y-1 text-right">
          {s.lines.length > 0 && <p className="font-bold text-fg">{money(s.totalCents)}</p>}
          {main ? <PayBadge lineId={main.id} status={main.state.status} amountCents={main.amountCents} payouts={payouts} /> : badge && <span className={badge.badge}>{badge.label}</span>}
        </div>
      </div>
      {main?.state.status === "PAID" && main.state.paidAt && (
        <p className="text-xs text-muted">
          Sent to your Stripe account <LocalTime iso={main.state.paidAt.toISOString()} mode="date" />
        </p>
      )}
      {main?.state.heldReason && <p className="text-xs text-muted">On hold: {main.state.heldReason}</p>}
      {adjustments.map((a) => (
        <p key={a.id} className="text-xs text-muted">
          Adjustment {money(a.amountCents)} · {statusLabel(a.state.status, a.amountCents, { payouts }).label}
          {a.reason ? ` — ${a.reason}` : ""}
        </p>
      ))}
      {open ? (
        <p className="text-xs text-muted">
          You disputed this on <LocalTime iso={open.createdAt.toISOString()} mode="date" />.{" "}
          <Clock parts={clockParts(open.clock, "worker", orgName)} />
          {main && main.state.status === "DISPUTED" ? " Payment waits for the outcome." : ""}{" "}
          <Link href={`/earnings/disputes/${open.id}`} className="link font-semibold">
            {open.messages ? `Open the thread (${open.messages})` : "Open the thread"}
          </Link>
          {open.clock.overdue && <span className="badge-coral ml-2">Overdue</span>}
        </p>
      ) : (
        last?.resolution && (
          <p className="text-xs text-muted">
            {OUTCOME[last.resolution.outcome] ?? "Dispute closed"}: {last.resolution.response}{" "}
            <Link href={`/earnings/disputes/${last.id}`} className="link">Thread</Link>
          </p>
        )
      )}
      {s.canDispute && (
        <details className="group">
          <summary className="link cursor-pointer list-none text-xs font-semibold">
            <span className="group-open:hidden">{s.disputes.length ? "Dispute again" : "Something wrong? Dispute this pay"}</span>
            <span className="hidden group-open:inline">Never mind</span>
          </summary>
          <div className="pt-3">
            <ActionButton action={dispute} fields={{ shiftId: s.shiftId }} label="Send dispute" variant="btn-secondary btn-sm">
              <label className="w-full space-y-1.5">
                <span className="label">What&apos;s wrong?</span>
                <textarea name="reason" className="field min-h-20" required minLength={10} maxLength={1000} placeholder="For example: I checked out at 5:30, not 4:30." />
              </label>
            </ActionButton>
          </div>
        </details>
      )}
    </li>
  );
}

/** The worker's pay: gross, per campaign, with each shift's status. */
export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ payouts?: string | string[] }> }) {
  const { workerId } = await requireWorker();
  const q = (await searchParams).payouts;
  const note = typeof q === "string" ? q : null;
  // One read of the payout state (refreshed from Stripe when just back or stale), so the hero, the rows and the setup card agree (P0).
  const [{ campaigns, totals }, w] = await Promise.all([loadWorkerEarnings(workerId), payoutSetup(workerId, stripeProvider(), note === "done")]);
  const payouts = w.payoutsEnabled;
  const onTheWay = payouts ? "On the way" : "Approved · payout setup needed";
  return (
    <main className="page max-w-2xl">
      <header className="space-y-1">
        <p className="eyebrow">Earnings</p>
        <h1 className="page-title">Your pay</h1>
        <p className="text-muted-sm">Gross pay for shifts your supervisors approved. Turfcut never takes a cut of your pay — campaigns pay the platform fee.</p>
      </header>

      <div className={`hero-card space-y-4 ${campaigns.length === 0 ? "hero-card-quiet" : "hero-card-accent"}`}>
        <p className="eyebrow">All campaigns</p>
        <p className="hero-title">{money(totals.paid)} paid</p>
        <p className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            <span className="block font-bold">{money(totals.onTheWay)}</span>
            <span className="hero-muted">{onTheWay}</span>
          </span>
          <span>
            <span className="block font-bold">{money(totals.awaiting)}</span>
            <span className="hero-muted">Awaiting approval</span>
          </span>
          {totals.stopped !== 0 && (
            <span>
              <span className="block font-bold">{money(totals.stopped)}</span>
              <span className="hero-muted">On hold or disputed</span>
            </span>
          )}
        </p>
      </div>

      <PayoutSetup w={w} note={note} />

      {campaigns.length === 0 ? (
        <div className="empty-state">
          <EmptyArt kind="earnings" />
          <p className="empty-state-title">No pay yet</p>
          <p className="empty-state-body">Pay shows up here as soon as a supervisor approves one of your shifts, with how it was worked out.</p>
          <Link href="/shifts" className="btn-primary mt-4">My shifts</Link>
        </div>
      ) : (
        campaigns.map((c) => (
          <section key={c.jobId} className="section">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="section-title">{c.title}</h2>
              <span className="text-xs text-subtle">{c.orgName}</span>
            </div>
            <p className="text-muted-sm">
              {money(c.totals.paid)} paid · {money(c.totals.onTheWay)} {payouts ? "on the way" : "approved, payout setup needed"} · {money(c.totals.awaiting)} awaiting approval
            </p>
            <ul className="list-card">
              {c.shifts.map((s) => (
                <ShiftRow key={s.shiftId} s={s} orgName={c.orgName} payouts={payouts} />
              ))}
            </ul>
          </section>
        ))
      )}
      <p className="text-hint">Every amount is worked out from your verified hours or accepted work at the job&apos;s posted rate, and never changed afterwards — corrections show up as adjustments.</p>
    </main>
  );
}
