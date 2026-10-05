import { Prisma } from "@prisma/client";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";

/**
 * Supabase Auth or the database can't be reached: an outage, not a
 * signed-out visitor. Thrown rather than read as "signed out", so field pages
 * answer with a real 500 (the offline brief then serves its saved copy
 * instead of wiping it) and the phone's sync retries instead of asking the
 * worker to sign in again.
 */
export class ServiceUnavailableError extends Error {
  constructor(what: "auth" | "database", cause?: unknown) {
    super(`[turfcut] ${what === "auth" ? "Supabase Auth" : "the database"} can't be reached`, { cause });
    this.name = "ServiceUnavailableError";
  }
}

/** Prisma couldn't reach or open the database (as opposed to a query failing). */
const UNREACHABLE = new Set(["P1001", "P1002", "P1008", "P1017"]);
export function isDatabaseUnreachable(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientInitializationError) return true;
  const code = (e as { code?: unknown })?.code;
  return typeof code === "string" && UNREACHABLE.has(code);
}

/**
 * A Supabase Auth error that means the service failed, not that the session
 * is bad: a network failure or 5xx, a body that isn't Auth's own (a gateway
 * page), or rate limiting.
 */
export function isAuthOutage(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  if ((error as { name?: unknown })?.name === "AuthUnknownError") return true;
  const status = (error as { status?: unknown })?.status;
  return typeof status === "number" && (status >= 500 || status === 429);
}

/**
 * A setting the app can't run without is missing or unusable (lib/env.ts):
 * that reads as signed out (the M0 rule), and sign-in names the setting.
 * Note that a DATABASE_URL Prisma accepts but can't log in with (a wrong
 * password) is an outage until it's fixed.
 */
export function isConfigError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : "";
  return m.startsWith("[turfcut] Missing environment variable") || m.startsWith("[turfcut] DATABASE_URL can't be used");
}
