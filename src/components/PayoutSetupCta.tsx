import Link from "next/link";
import { payoutCta, type PayoutReadiness } from "@/lib/pay";

/**
 * The way to unblock approved pay, wherever pay is shown as blocked on payout
 * setup (P0: "Set up payout" wherever payout is blocked). It leads to the
 * Payouts card on Earnings, the one place with the Stripe button and the
 * words about what Stripe collects, so a worker never lands on Stripe from a
 * card that didn't say what it's for. Renders nothing when in-app payouts are
 * off (nothing to set up) or the worker is already set up.
 */
export function PayoutSetupCta({
  readiness,
  stripeAccountId,
  href = "/earnings#payouts",
  className = "btn-secondary btn-sm",
}: {
  readiness: PayoutReadiness;
  stripeAccountId: string | null | undefined;
  href?: string;
  className?: string;
}) {
  const cta = payoutCta(readiness, !!stripeAccountId);
  if (!cta) return null;
  return (
    <Link href={href} className={className}>
      {cta.label}
    </Link>
  );
}
