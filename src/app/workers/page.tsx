import Link from "next/link";
import { db } from "@/lib/db";
import { requireEmployer } from "@/lib/employer-session";

/**
 * Worker directory for approved organizations. Alphabetical — not ranked.
 * Matching and ranking (with their explanations) arrive in M3.
 */
export default async function WorkersPage() {
  const { orgApproved } = await requireEmployer();
  if (!orgApproved) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p>Your organization is awaiting approval. Worker profiles unlock once Turfcut approves it.</p>
      </main>
    );
  }
  const workers = await db().worker.findMany({
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Workers</h1>
        <Link href="/dashboard" className="text-sm underline">Dashboard</Link>
      </header>
      <p className="text-sm text-neutral-500">Listed alphabetically. There is no overall worker score.</p>
      <ul className="divide-y rounded-lg border">
        {workers.map((w) => (
          <li key={w.id}>
            <Link href={`/workers/${w.id}`} className="block p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900">
              {w.displayName}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
