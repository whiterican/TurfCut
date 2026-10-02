"use client";

import Link from "next/link";

/** Messages couldn't load (database or network). Nothing is lost; try again. */
export default function MessagesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page max-w-2xl">
      <div className="empty-state" role="alert">
        <p className="empty-state-title">Messages didn&apos;t load</p>
        <p className="empty-state-body">Check your connection and try again. Nothing you sent was lost.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn-primary" onClick={reset}>Try again</button>
          <Link href="/messages" className="btn-secondary">All messages</Link>
        </div>
      </div>
    </main>
  );
}
