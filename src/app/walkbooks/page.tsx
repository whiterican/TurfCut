import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadWorkerWalkbooks } from "@/lib/walkbooks-data";
import { ReadingPage } from "@/components/layout/Page";
import { Masthead } from "@/components/Masthead";
import { hasMapPoints, WalkbookMap, WalkbookStops } from "@/components/WalkbookStops";

/**
 * The walkbooks a worker holds now (W1), on jobs they're hired on: numbered
 * stops in walking order. A book handed to someone else, or taken back,
 * leaves this page.
 */
export default async function MyWalkbooksPage() {
  const { workerId } = await requireWorker();
  const books = await loadWorkerWalkbooks(workerId);

  return (
    <ReadingPage head={<Masthead title="Walkbooks" />}>
      {books.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No walkbooks right now</p>
          <p className="empty-state-body">When a campaign you work for hands you a walkbook, its stops show up here, in the order to walk them.</p>
        </div>
      ) : (
        books.map((b) => (
          <section key={b.id} id={`book-${b.id}`} className="section scroll-mt-20">
            <div className="space-y-0.5">
              <p className="eyebrow">
                <Link href={`/jobs/${b.job.id}`} className="underline-offset-2 hover:underline">
                  {b.job.title}
                </Link>
              </p>
              <h2 className="section-title">{b.name}</h2>
              <p className="text-muted-sm">
                {b.stops.length} {b.stops.length === 1 ? "stop" : "stops"}, in the order to walk them
              </p>
            </div>
            <div className={hasMapPoints(b.stops) ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start" : "max-w-2xl"}>
              {hasMapPoints(b.stops) && (
                <div className="lg:sticky lg:top-4 lg:order-2">
                  <WalkbookMap stops={b.stops} className="h-56 lg:h-96" />
                </div>
              )}
              <div className="lg:order-1">
                <WalkbookStops stops={b.stops} />
              </div>
            </div>
          </section>
        ))
      )}
    </ReadingPage>
  );
}
