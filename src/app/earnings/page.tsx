import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadWorkerEarnings, type EarningShift } from "@/lib/pay-data";
import { PayBadge } from "@/components/Moments";
import { approvedPhrase, money, payoutReadiness, statusLabel, type PayoutReadiness } from "@/lib/pay";
import { StatusChip } from "@/components/StatusBadge";
import { LocalTime } from "@/components/LocalTime";
import { clockParts } from "@/lib/dispute-sla";
import { ActionButton } from "@/components/ActionButton";
import { dispute, managePayouts, setUpPayouts } from "./actions";
import { payoutSetup } from "@/lib/pay-data";
import { stripeProvider } from "@/lib/payout-provider";
import { EmptyArt } from "@/components/EmptyState";
import { Masthead } from "@/components/Masthead";
import { ReadingPage } from "@/components/layout/Page";
import { PayoutSetupCta } from "@/components/PayoutSetupCta";

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
    // `#payouts`: where every "Set up payouts" link on Earnings, Today and a shift page lands (scroll margin clears the header).
    <section id="payouts" className="card scroll-mt-24 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-semibold text-fg">Payouts</p>
          <p className="text-muted-sm"><Link href="/earnings/receipts" className="link">Receipts</Link></p>
          <p className="text-muted-sm">
            {!provider.configured()
              ? "Payouts aren't switched on yet. Approved pay is kept until they are."
              : w.payoutsEnabled
                ? "Approved pay goes to your bank through Stripe."
                : w.stripeAccountId
                  ? "Finish setting up with Stripe so you can be paid."
                  : "Stripe pays your bank directly. Turfcut never sees your bank or tax details."}
          </p>
        </div>
        {w.payoutsEnabled && <StatusChip state="approved" label="Ready" className="shrink-0" />}
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

function ShiftRow({ s, orgName, payouts }: { s: EarningShift; orgName: string; payouts: PayoutReadiness }) {
  const main = s.lines.find((l) => l.kind === "SHIFT");
  const adjustments = s.lines.filter((l) => l.kind === "ADJUSTMENT");
  const open = s.disputes.find((d) => !d.resolution);
  const last = s.disputes.at(-1);
  const rejected = !main && s.review?.status === "REJECTED";
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
          {main ? <PayBadge lineId={main.id} status={main.state.status} amountCents={main.amountCents} payouts={payouts} /> : rejected && <StatusChip state="blocked" label="Not approved" />}
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
          {open.clock.overdue && <StatusChip state="overdue" label="Overdue" className="ml-2" />}
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
  const payouts = payoutReadiness(stripeProvider().configured(), w.payoutsEnabled);
  return (
    <ReadingPage gap={6} head={<Masthead title="Earnings" meta="Approved gross pay. Turfcut takes no cut." />}>
      {/* One compact band (#114 Earnings): each figure a real sum in its own pay state, never merged; the Payouts card right under it is the way to unblock approved pay. */}
      <section aria-labelledby="earnings-totals-heading">
        <h2 id="earnings-totals-heading" className="sr-only">All campaigns</h2>
        <dl className="summary-band">
          <div><dt>paid to your account</dt><dd>{money(totals.paid)}</dd></div>
          <div><dt>{approvedPhrase(payouts)}</dt><dd>{money(totals.onTheWay)}</dd></div>
          <div><dt>awaiting a supervisor&apos;s approval</dt><dd>{money(totals.awaiting)}</dd></div>
          {totals.stopped !== 0 && <div><dt>on hold or disputed</dt><dd>{money(totals.stopped)}</dd></div>}
        </dl>
      </section>

      <PayoutSetup w={w} note={note} />

      {campaigns.length === 0 ? (
        <div className="empty-state">
          <EmptyArt kind="earnings" />
          <p className="empty-state-title">No pay yet</p>
          <p className="empty-state-body">Pay appears here once a supervisor approves a shift.</p>
          <Link href="/shifts" className="btn-primary mt-4">My schedule</Link>
        </div>
      ) : (
        campaigns.map((c) => (
          <section key={c.jobId} className="section">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="section-title">{c.title}</h2>
              <span className="text-xs text-subtle">{c.orgName}</span>
            </div>
            <p className="text-muted-sm">
              {money(c.totals.paid)} paid · {money(c.totals.onTheWay)} {approvedPhrase(payouts)} · {money(c.totals.awaiting)} awaiting approval
              {c.totals.onTheWay > 0 && payouts === "setup" && (
                <>
                  {" · "}
                  <PayoutSetupCta readiness={payouts} stripeAccountId={w.stripeAccountId} href="#payouts" className="link" />
                </>
              )}
            </p>
            <ul className="list-card">
              {c.shifts.map((s) => (
                <ShiftRow key={s.shiftId} s={s} orgName={c.orgName} payouts={payouts} />
              ))}
            </ul>
          </section>
        ))
      )}
      <p className="text-hint">Amounts never change after approval. <Link href="/guide#pay" className="link">How pay works</Link></p>
    </ReadingPage>
  );
}
