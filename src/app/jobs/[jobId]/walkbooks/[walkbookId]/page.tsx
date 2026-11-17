import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireArea } from "@/lib/employer-session";
import { UUID_RE } from "@/lib/jobs";
import { loadWalkbookForStaff } from "@/lib/walkbooks-data";
import { ReadingPage } from "@/components/layout/Page";
import { Masthead } from "@/components/Masthead";
import { LocalTime } from "@/components/LocalTime";
import { PrintButton } from "@/components/PrintButton";
import { WalkbookStops } from "@/components/WalkbookStops";

/** One walkbook for staff: its stops in walking order, where the addresses came from, and who has held it. */
export default async function WalkbookPage({ params }: { params: Promise<{ jobId: string; walkbookId: string }> }) {
  const { jobId, walkbookId } = await params;
  if (!UUID_RE.test(jobId) || !UUID_RE.test(walkbookId)) notFound();
  const session = await requireArea("field", "read");
  const wb = await loadWalkbookForStaff(session.orgId, walkbookId);
  if (!wb || wb.jobId !== jobId) notFound();

  return (
    <ReadingPage
      org
      head={
        <Masthead eyebrow={wb.job.title} title={wb.name}>
          <Link transitionTypes={["nav-back"]} href={`/jobs/${jobId}/walkbooks`} className="btn-ghost no-print">
            <ChevronLeft aria-hidden className="size-4 shrink-0" />
            Walkbooks
          </Link>
          <PrintButton label="Print walkbook" />
        </Masthead>
      }
    >
      <section className="section">
        <h2 className="section-title">
          {wb.stops.length} {wb.stops.length === 1 ? "stop" : "stops"}
        </h2>
        <WalkbookStops stops={wb.stops} />
      </section>

      <section className="section no-print">
        <h2 className="section-title">Where the addresses came from</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-hint">File</dt>
          <dd className="min-w-0 break-words text-fg">{wb.import.fileName}</dd>
          <dt className="text-hint">Source</dt>
          <dd className="min-w-0 break-words text-fg">{wb.import.recordSource}</dd>
          <dt className="text-hint">Purpose</dt>
          <dd className="min-w-0 break-words text-fg">{wb.import.purpose}</dd>
          <dt className="text-hint">License</dt>
          <dd className="min-w-0 break-words text-fg">{wb.import.license}</dd>
        </dl>
      </section>

      <section className="section no-print">
        <h2 className="section-title">Who has held it</h2>
        {wb.history.length === 0 ? (
          <p className="text-muted-sm">Not handed out yet.</p>
        ) : (
          <ol className="space-y-1 text-sm text-fg">
            {wb.history.map((h) => (
              <li key={h.id}>
                <LocalTime iso={h.at.toISOString()} mode="short" /> · {h.name ? `Handed to ${h.name}` : "Taken back"}
              </li>
            ))}
          </ol>
        )}
      </section>
    </ReadingPage>
  );
}
