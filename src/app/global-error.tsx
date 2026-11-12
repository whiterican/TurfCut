"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/*
 * Drawn with no app stylesheet, font or provider: this page shows when the root
 * layout itself failed (a database outage, say), so it depends on nothing that
 * could have failed with it. The values are the design tokens' light and dark
 * page, card, type, border and Forest action (globals.css), copied here.
 */
const css = `
:root { color-scheme: light dark; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 32px 16px; box-sizing: border-box;
  background: #faf9f4; color: #0f172a; font: 16px/1.5 Figtree, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.ge-card { max-width: 32rem; width: 100%; box-sizing: border-box; background: #ffffff; border: 1px solid #d7d2e0; border-radius: 14px; padding: 24px; }
.ge-card h1 { margin: 0 0 8px; font-size: 20px; line-height: 28px; font-weight: 600; }
.ge-card p { margin: 0 0 20px; color: #475569; }
.ge-card button { min-height: 44px; padding: 0 20px; border: 0; border-radius: 10px; background: #157a46; color: #ffffff; font: inherit; font-weight: 600; cursor: pointer; }
.ge-card button:focus-visible { outline: 2px solid #157a46; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  body { background: #140a22; color: #f4f2f8; }
  .ge-card { background: #231538; border-color: #3d2c57; }
  .ge-card p { color: #c9c2d6; }
  .ge-card button { box-shadow: 0 0 0 1px #cbbdd8; }
  .ge-card button:focus-visible { outline-color: #5ed39b; }
}`;

/** The last-resort error page: reports the crash (when Sentry is configured) and offers a reload. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <head>
        <title>Something went wrong</title>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main className="ge-card">
          <h1>Something went wrong</h1>
          <p>The page hit an error. Reloading usually fixes it. Field entries saved on this phone are kept and still get sent. Entries that were only on this page, because the phone&apos;s storage was full or blocked, are lost when you reload.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload</button>
        </main>
      </body>
    </html>
  );
}
