"use client";

import Link from "next/link";

/**
 * A page or a form on it failed (Turfcut or its database couldn't be
 * reached). Keeps the nav, says nothing was lost on the phone's side, and
 * offers a retry and a page that doesn't depend on this one.
 */
export function PageError({ title, retry, href, label }: { title: string; retry: () => void; href: string; label: string }) {
  return (
    <main className="page max-w-2xl">
      <div className="empty-state" role="alert">
        <p className="empty-state-title">{title}</p>
        <p className="empty-state-body">Something went wrong on our side. Try again in a minute; if you were saving something, check it went through.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" className="btn-primary" onClick={() => retry()}>Try again</button>
          <Link href={href} className="btn-secondary">{label}</Link>
        </div>
      </div>
    </main>
  );
}
