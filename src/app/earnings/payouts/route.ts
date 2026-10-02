import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { db } from "@/lib/db";
import { siteOrigin } from "@/lib/site-origin";
import { stripeProvider } from "@/lib/payout-provider";

/**
 * Stripe sends a worker here when their setup link expired or was already
 * used: make a fresh one for their existing account and send them back.
 * Never creates an account (that only happens from the Earnings button).
 */
export async function GET() {
  const s = await getSessionProfile();
  const origin = await siteOrigin();
  if (!origin) return new NextResponse("Payout setup isn't available on this site yet.", { status: 503 });
  const back = (q: string) => NextResponse.redirect(`${origin}/earnings?payouts=${q}`, 303);
  if (!s || s.role !== "WORKER" || !s.workerId) return back("error");
  const provider = stripeProvider();
  const w = await db().worker.findUnique({ where: { id: s.workerId }, select: { stripeAccountId: true } });
  if (!provider.configured() || !w?.stripeAccountId) return back("unavailable");
  try {
    const url = await provider.onboardingLink(w.stripeAccountId, { refresh: `${origin}/earnings/payouts`, return: `${origin}/earnings?payouts=done` });
    return NextResponse.redirect(url, 303);
  } catch {
    return back("error");
  }
}
