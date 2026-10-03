import * as Sentry from "@sentry/nextjs";

/** Browser error reporting; silent until NEXT_PUBLIC_SENTRY_DSN is set. */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0, replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0 });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
