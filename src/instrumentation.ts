import * as Sentry from "@sentry/nextjs";

/**
 * Error reporting (Sentry). Does nothing until SENTRY_DSN is set, so the app
 * boots and runs exactly as before without it (M0 rule). No request bodies,
 * no cookies, no user identifiers are sent: only the error and its stack.
 */
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) delete event.request.data;
      if (event.request?.cookies) delete event.request.cookies;
      if (event.request?.headers) delete event.request.headers;
      return event;
    },
  });
}

export const onRequestError = Sentry.captureRequestError;
