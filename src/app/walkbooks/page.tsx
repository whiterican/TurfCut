import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadWorkerWalkbooks } from "@/lib/walkbooks-data";
import { ReadingPage } from "@/components/layout/Page";
import { Masthead } from "@/components/Masthead";
import { WalkbookStops } from "@/components/WalkbookStops";

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
          <section key={b.id} id={`book-${b.id}`} className="section">
            <p className="eyebrow">
              <Link href={`/jobs/${b.job.id}`} className="underline-offset-2 hover:underline">
                {b.job.title}
              </Link>
            </p>
            <h2 className="section-title">
              {b.name} · {b.stops.length} {b.stops.length === 1 ? "stop" : "stops"}
            </h2>
            <WalkbookStops stops={b.stops} />
          </section>
        ))
      )}
    </ReadingPage>
  );
}
