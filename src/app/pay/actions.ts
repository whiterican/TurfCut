"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { PAY_ROLES } from "@/lib/access";
import { lineAction, payWorker, recordPartialReversal, resolveDispute, settleTransfer, type PayActor } from "@/lib/pay-data";
import { stripeProvider } from "@/lib/payout-provider";
import { money, parseMoney, type Resolution } from "@/lib/pay";
import type { ActionState } from "@/app/jobs/actions";

/*
 * Server actions are public endpoints: each one authenticates as an owner
 * or finance member and leaves every rule to lib/pay-data.ts.
 */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function actor(): Promise<PayActor | null> {
  const s = await requireRole(PAY_ROLES);
  return s.orgId ? { profileId: s.userId, orgId: s.orgId, role: s.role } : null;
}

const refresh = () => {
  revalidatePath("/pay");
  revalidatePath("/desk");
  revalidatePath("/earnings");
};

export async function approve(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return { ok: false, message: "No organization on this account." };
  const ids = fd.getAll("payoutIds").map(String);
  const r = await lineAction(a, ids, "approve");
  if (!r.ok) return { ok: false, message: r.reason };
  refresh();
  const extra = r.deductions ? ` and applied ${r.deductions} ${r.deductions === 1 ? "deduction" : "deductions"} on those shifts` : "";
  return { ok: true, message: `${r.count === 1 ? "Approved 1 line" : `Approved ${r.count} lines`} for payment${extra}.` };
}

export async function hold(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return { ok: false, message: "No organization on this account." };
  const r = await lineAction(a, [str(fd, "payoutId")], "hold", str(fd, "reason"));
  if (!r.ok) return { ok: false, message: r.reason };
  refresh();
  return { ok: true, message: "On hold. The worker sees the reason." };
}

export async function release(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return { ok: false, message: "No organization on this account." };
  const r = await lineAction(a, [str(fd, "payoutId")], "release");
  if (!r.ok) return { ok: false, message: r.reason };
  refresh();
  return { ok: true, message: "Released." };
}

export async function resolve(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return { ok: false, message: "No organization on this account." };
  const outcome = str(fd, "outcome");
  const response = str(fd, "response");
  let r: Resolution;
  if (outcome === "ADJUSTED") {
    const cents = parseMoney(str(fd, "amount"));
    if (cents === null) return { ok: false, message: "Enter the adjustment in dollars, like 25 or -12.50." };
    r = { outcome, response, amountCents: cents };
  } else if (outcome === "KEPT" || outcome === "REREVIEWED") {
    r = { outcome, response };
  } else {
    return { ok: false, message: "Pick how the dispute was resolved." };
  }
  const res = await resolveDispute(a, str(fd, "disputeId"), r);
  if (!res.ok) return { ok: false, message: res.reason };
  refresh();
  return {
    ok: true,
    message: r.outcome === "ADJUSTED" && r.amountCents > 0 ? "Dispute closed. Someone else on your team approves the extra pay." : "Dispute closed. The worker sees your response.",
  };
}

/** Sends one worker everything approved and unpaid, through Stripe. */
export async function payNow(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return { ok: false, message: "No organization on this account." };
  const raw = str(fd, "expectedCents");
  if (!/^\d+$/.test(raw)) return { ok: false, message: "Reload the page and try again." };
  const r = await payWorker(a, str(fd, "workerId"), stripeProvider(), Number(raw));
  refresh();
  if (!r.ok) return { ok: false, message: r.reason };
  return { ok: r.outcome === "paid", message: r.message };
}

/** Asks Stripe what happened to a payment still marked "sending". */
export async function checkPayment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return { ok: false, message: "No organization on this account." };
  const r = await settleTransfer(a, str(fd, "transferId"), stripeProvider());
  refresh();
  if (!r.ok) return { ok: false, message: r.reason };
  return { ok: r.outcome === "paid", message: r.message };
}

export async function recordReversal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const a = await actor();
  if (!a) return { ok: false, message: "No organization on this account." };
  const repay = fd.get("repay") === "on";
  const r = await recordPartialReversal(a, str(fd, "transferId"), repay);
  if (!r.ok) return { ok: false, message: r.reason };
  refresh();
  return {
    ok: true,
    message: repay
      ? `Recorded ${money(r.cents ?? 0)} returned. Someone else on your team approves paying it again.`
      : `Recorded ${money(r.cents ?? 0)} returned in the ledger.`,
  };
}
