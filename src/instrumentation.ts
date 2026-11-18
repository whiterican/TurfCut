import * as Sentry from "@sentry/nextjs";

const NO_COLLECTION: NonNullable<Parameters<typeof Sentry.init>[0]>["dataCollection"] = {
  userInfo: false, // no IP addresses, no user ids
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
};

/** Drops the query string from any URL Sentry might carry (confirmation codes, "next" paths). */
const stripQuery = (u: unknown) => (typeof u === "string" ? u.split("?")[0] : u);

/** The last line of defence after the collection switches: nothing identifying leaves. */
export function scrub<E extends Sentry.ErrorEvent>(event: E): E {
  delete event.user;
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) event.request.url = stripQuery(event.request.url) as string;
  }
  const nextjs = (event.contexts as Record<string, Record<string, unknown> | undefined> | undefined)?.nextjs;
  if (nextjs?.request_path) nextjs.request_path = stripQuery(nextjs.request_path);
  // A database error can quote the row it refused (names, phone numbers, party): keep the error's type and stack, never its text.
  // Prisma's own errors echo the call's arguments, row values included ("Invalid `prisma.x.createMany()` invocation: { data: ... }").
  const DB_TEXT = /Failing row contains|\bDETAIL:|Key \(.+\)=\(|Invalid `prisma\.|invocation:/;
  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === "string" && DB_TEXT.test(ex.value)) ex.value = "Database error (details removed)";
  }
  if (typeof event.message === "string" && DB_TEXT.test(event.message)) event.message = "Database error (details removed)";
  const le = event.logentry as { message?: unknown } | undefined;
  if (le && typeof le.message === "string" && DB_TEXT.test(le.message)) le.message = "Database error (details removed)";
  if (event.extra) delete event.extra;
  // Console lines can carry objects (a Supabase user, an address); keep only navigation and http breadcrumbs, URL-only.
  event.breadcrumbs = event.breadcrumbs?.filter((b) => b.category !== "console").map((b) => (b.data?.url ? { ...b, data: { ...b.data, url: stripQuery(b.data.url) } } : b));
  return event;
}

/**
 * Error reporting (Sentry). Does nothing until SENTRY_DSN is set, so the app
 * boots and runs exactly as before without it (M0 rule). Only the error and
 * its stack are sent: collection of IPs, cookies, headers, bodies and query
 * strings is switched off, and `scrub` removes whatever still slips through.
 */
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    dataCollection: NO_COLLECTION,
    beforeSend: (event) => scrub(event),
  });
}

export const onRequestError = Sentry.captureRequestError;
