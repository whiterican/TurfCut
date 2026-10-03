import * as Sentry from "@sentry/nextjs";

/** Browser error reporting; silent until NEXT_PUBLIC_SENTRY_DSN is set. No IPs, no replays, no tracing. */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    beforeSend(event) {
      delete event.user;
      if (event.request?.url) event.request.url = event.request.url.split("?")[0];
      event.breadcrumbs = event.breadcrumbs?.filter((b) => b.category !== "console");
      return event;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
