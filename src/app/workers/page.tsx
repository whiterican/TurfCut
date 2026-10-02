import Link from "next/link";
import { db } from "@/lib/db";
import { requireEmployer } from "@/lib/employer-session";

/**
 * Worker directory for approved organizations. Alphabetical — not ranked.
 * Matching and ranking (with their explanations) come later.
 */
export default async function WorkersPage() {
  const { orgApproved } = await requireEmployer();
  if (!orgApproved) {
    return (
      <main className="page max-w-2xl">
        <div className="empty-state">
          <span className="badge-butter">Awaiting approval</span>
          <p className="empty-state-title mt-3">Your organization is being reviewed</p>
          <p className="empty-state-body">Worker profiles unlock once Turfcut approves it.</p>
        </div>
      </main>
    );
  }
  const workers = await db().worker.findMany({
    where: { closedAt: null },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  return (
    <main className="page max-w-2xl space-y-6">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">People</p>
          <h1 className="page-title">Workers</h1>
          <p className="text-muted-sm">Listed alphabetically. There is no overall worker score.</p>
        </div>
      </header>
      {workers.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No workers yet</p>
          <p className="empty-state-body">Worker profiles will appear here as people join.</p>
        </div>
      ) : (
        <ul className="list-card">
          {workers.map((w) => (
            <li key={w.id}>
              <Link
                href={`/workers/${w.id}`}
                className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-fg transition hover:bg-surface-2"
              >
                <span className="font-medium">{w.displayName}</span>
                <span aria-hidden className="text-subtle">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
