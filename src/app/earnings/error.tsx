"use client";

import Link from "next/link";

/** Pay couldn't load. Nothing about your pay changed; try again. */
export default function EarningsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page max-w-2xl">
      <div className="empty-state" role="alert">
        <p className="empty-state-title">Your pay didn&apos;t load</p>
        <p className="empty-state-body">Check your connection and try again. Nothing about your pay has changed.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn-primary" onClick={reset}>Try again</button>
          <Link href="/shifts" className="btn-secondary">My shifts</Link>
        </div>
      </div>
    </main>
  );
}
