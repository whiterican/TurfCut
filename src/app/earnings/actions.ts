"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorker } from "@/lib/worker-session";
import { db } from "@/lib/db";
import { siteOrigin } from "@/lib/site-origin";
import { ensurePayoutAccount, openDispute } from "@/lib/pay-data";
import { stripeProvider } from "@/lib/payout-provider";
import type { ActionState } from "@/app/jobs/actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** The worker disputes their pay for one shift. */
export async function dispute(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const shiftId = str(fd, "shiftId").trim();
  const r = await openDispute({ workerId, profileId: userId }, shiftId, str(fd, "reason"));
  if (!r.ok) return { ok: false, message: r.reason };
  revalidatePath("/earnings");
  revalidatePath(`/shifts/${shiftId}`);
  return {
    ok: true,
    message: r.paymentWaits ? "Dispute sent. Payment for this shift waits until it's resolved." : "Dispute sent. You'll see the response here.",
  };
}

/** Opens Stripe's own page to enter bank and tax details (created on first use). */
export async function setUpPayouts(): Promise<void> {
  const { workerId } = await requireWorker();
  const provider = stripeProvider();
  if (!provider.configured()) redirect("/earnings?payouts=unavailable");
  const origin = await siteOrigin();
  if (!origin) redirect("/earnings?payouts=unavailable");
  let url: string;
  try {
    const account = await ensurePayoutAccount(workerId, provider);
    url = await provider.onboardingLink(account, { refresh: `${origin}/earnings/payouts`, return: `${origin}/earnings?payouts=done` });
  } catch {
    redirect("/earnings?payouts=error");
  }
  redirect(url);
}

/** Opens the worker's Stripe dashboard (payout details, tax forms). */
export async function managePayouts(): Promise<void> {
  const { workerId } = await requireWorker();
  const provider = stripeProvider();
  const w = await db().worker.findUnique({ where: { id: workerId }, select: { stripeAccountId: true } });
  if (!provider.configured() || !w?.stripeAccountId) redirect("/earnings?payouts=unavailable");
  let url: string;
  try {
    url = await provider.dashboardLink(w.stripeAccountId);
  } catch {
    redirect("/earnings?payouts=error");
  }
  redirect(url);
}
