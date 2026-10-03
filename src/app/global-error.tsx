"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** The last-resort error page: reports the crash (when Sentry is configured) and offers a reload. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", padding: "32px 16px", maxWidth: "32rem", margin: "auto" }}>
        <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
        <p>The page hit an error. Reloading usually fixes it; your field entries are safe on this phone until they sync.</p>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: "10px 16px", fontSize: 16 }}>Reload</button>
      </body>
    </html>
  );
}
