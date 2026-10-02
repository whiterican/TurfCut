import Stripe from "stripe";
import { getStripeSecretKey, getStripeWebhookSecrets, hasStripeConfig } from "@/lib/env";

/**
 * Where money actually moves (M5): Stripe Connect, Express accounts.
 * Workers enter bank and tax details on Stripe's own pages; Turfcut keeps
 * only the account id. Transfers go from Turfcut's Stripe balance (funded
 * by organizations' invoices) to the worker's account; Stripe pays out to
 * their bank. Everything else in the app talks to this interface, so tests
 * use a fake.
 */
export interface PayoutProvider {
  configured(): boolean;
  /** Creates the worker's connected account. Idempotent per worker. */
  createAccount(input: { workerId: string }): Promise<string>;
  /** A one-time Stripe-hosted link to enter or update payout details. */
  onboardingLink(accountId: string, urls: { refresh: string; return: string }): Promise<string>;
  /** A one-time link to the worker's Stripe Express dashboard. */
  dashboardLink(accountId: string): Promise<string>;
  /** Whether Stripe can send money to this account now. `quick`: one short try (page loads). */
  payoutsEnabled(accountId: string, quick?: boolean): Promise<boolean>;
  /** The transfer made for a Turfcut transfer id, if one exists. */
  findTransfer(group: string): Promise<{ id: string } | null>;
  /** Sends money. `key` is the Turfcut transfer id: idempotency key and group. */
  transfer(input: { amountCents: number; destination: string; key: string; workerId: string }): Promise<{ id: string }>;
  /** Verifies a webhook's signature and returns the event. Throws when invalid. */
  parseWebhook(rawBody: string, signature: string): ProviderEvent;
}

export interface ProviderEvent {
  id: string;
  type: string;
  /** When Stripe created the event. */
  createdAt?: Date;
  /** For transfer events. */
  transfer?: { id: string; group: string | null; amountCents: number; reversedCents: number };
  /** For account.updated. */
  account?: { id: string; payoutsEnabled: boolean };
}

/**
 * A provider call that failed. `definitive`: Stripe refused it (nothing
 * moved, safe to record as failed). Otherwise the outcome is unknown — a
 * timeout or server error — and the transfer is checked again later with
 * the same idempotency key, never re-sent under a new one.
 */
export class ProviderError extends Error {
  constructor(message: string, readonly definitive: boolean) {
    super(message);
  }
}

let client: Stripe | null = null;
const stripe = () => (client ??= new Stripe(getStripeSecretKey(), { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "Turfcut" } }));

function wrap(e: unknown): ProviderError {
  if (e instanceof Stripe.errors.StripeError) {
    const definitive =
      e instanceof Stripe.errors.StripeInvalidRequestError ||
      e instanceof Stripe.errors.StripePermissionError ||
      e instanceof Stripe.errors.StripeAuthenticationError ||
      e instanceof Stripe.errors.StripeCardError;
    if (e.code === "balance_insufficient") {
      return new ProviderError("Turfcut's Stripe balance is too low to send this payment. Add funds in Stripe, then try again.", true);
    }
    return new ProviderError(definitive ? `Stripe refused the request: ${e.message}` : `Stripe didn't answer clearly (${e.type}). Check again shortly.`, definitive);
  }
  return new ProviderError("Couldn't reach Stripe. Check again shortly.", false);
}

async function call<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    throw wrap(e);
  }
}

export function stripeProvider(): PayoutProvider {
  return {
    configured: hasStripeConfig,
    // Stripe asks for the email during onboarding; leaving it out keeps the
    // request identical for every retry under the same idempotency key.
    createAccount: ({ workerId }) =>
      call(async () => {
        const acct = await stripe().accounts.create(
          {
            type: "express",
            country: "US",
            business_type: "individual",
            capabilities: { transfers: { requested: true } },
            metadata: { turfcutWorkerId: workerId },
          },
          { idempotencyKey: `turfcut-account-${workerId}` }
        );
        return acct.id;
      }),
    onboardingLink: (account, urls) =>
      call(async () => (await stripe().accountLinks.create({ account, refresh_url: urls.refresh, return_url: urls.return, type: "account_onboarding" })).url),
    dashboardLink: (account) => call(async () => (await stripe().accounts.createLoginLink(account)).url),
    payoutsEnabled: (account, quick) =>
      call(async () => {
        const a = await stripe().accounts.retrieve(account, {}, quick ? { timeout: 5_000, maxNetworkRetries: 0 } : {});
        return Boolean(a.payouts_enabled) && a.capabilities?.transfers === "active";
      }),
    findTransfer: (group) =>
      call(async () => {
        const list = await stripe().transfers.list({ transfer_group: group, limit: 1 });
        return list.data[0] ? { id: list.data[0].id } : null;
      }),
    transfer: ({ amountCents, destination, key, workerId }) =>
      call(async () => {
        const t = await stripe().transfers.create(
          {
            amount: amountCents,
            currency: "usd",
            destination,
            transfer_group: key,
            description: "Turfcut field pay",
            metadata: { turfcutTransferId: key, turfcutWorkerId: workerId },
          },
          { idempotencyKey: `turfcut-transfer-${key}` }
        );
        return { id: t.id };
      }),
    parseWebhook(rawBody, signature) {
      // Platform events and connected-account events come from two endpoints
      // with their own signing secrets; either may sign.
      let e: Stripe.Event | null = null;
      for (const secret of getStripeWebhookSecrets()) {
        try {
          e = stripe().webhooks.constructEvent(rawBody, signature, secret);
          break;
        } catch {
          // try the next secret
        }
      }
      if (!e) throw new Error("invalid webhook signature");
      const out: ProviderEvent = { id: e.id, type: e.type, createdAt: new Date(e.created * 1000) };
      if (e.type.startsWith("transfer.")) {
        const t = e.data.object as Stripe.Transfer;
        out.transfer = { id: t.id, group: t.transfer_group ?? null, amountCents: t.amount, reversedCents: t.amount_reversed };
      } else if (e.type === "account.updated") {
        const a = e.data.object as Stripe.Account;
        out.account = { id: a.id, payoutsEnabled: Boolean(a.payouts_enabled) && a.capabilities?.transfers === "active" };
      }
      return out;
    },
  };
}
