import { NextResponse } from "next/server";
import { handleProviderEvent } from "@/lib/pay-data";
import { stripeProvider, type ProviderEvent } from "@/lib/payout-provider";

/**
 * Stripe webhooks (transfer.created, transfer.reversed, account.updated).
 * Only events with a valid signature are read; each is applied once
 * (ProviderEvent), and an error returns 500 so Stripe retries it.
 */
export async function POST(req: Request) {
  const provider = stripeProvider();
  if (!provider.configured() || !process.env.STRIPE_WEBHOOK_SECRET) return new NextResponse("Payouts aren't configured.", { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Missing signature.", { status: 400 });
  const raw = await req.text();
  let event: ProviderEvent;
  try {
    event = provider.parseWebhook(raw, signature);
  } catch {
    return new NextResponse("Invalid signature.", { status: 400 });
  }
  try {
    const result = await handleProviderEvent(event);
    return NextResponse.json({ received: true, result });
  } catch (e) {
    console.error("[turfcut] stripe webhook failed", event.id, e instanceof Error ? e.message : e);
    return new NextResponse("Couldn't apply the event; Stripe will retry.", { status: 500 });
  }
}
