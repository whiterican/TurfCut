import Link from "next/link";
import { LinkedText } from "@/components/campaign/LinkedText";
import { LocalTime } from "@/components/LocalTime";
import type { loadTalkingPoints } from "@/lib/job-brief-data";
import { FactList } from "@/components/campaign/FactList";
import { ResourceList } from "@/components/campaign/ResourceList";

/**
 * The campaign's talking points on a shift's brief (S1), each with its
 * supporting facts, and its scripts, common questions and guides (S4):
 * exactly as it wrote them. Turfcut doesn't summarize, label or add to them.
 */
export function TalkingPoints({ brief, asOf = new Date() }: { brief: NonNullable<Awaited<ReturnType<typeof loadTalkingPoints>>>; asOf?: Date }) {
  return (
    <section className="section" aria-labelledby="talking-points">
      <h2 id="talking-points" className="section-title">Talking points</h2>
      <p className="text-muted-sm">
        From {brief.isPublic ? <Link className="link" href={`/c/${brief.handle}`}>{brief.displayName}</Link> : brief.displayName}, in the campaign&apos;s own words. Use them as you see fit.
      </p>
      {/* The offline brief is a saved copy of this page: the time it was loaded tells the worker how fresh these are. */}
      <p className="text-hint">As of <LocalTime iso={asOf.toISOString()} mode="datetime" />. With signal, reload for the latest.</p>
      {brief.points.length === 0 ? (
        <p className="card text-muted-sm">The campaign hasn&apos;t pinned any talking points yet.</p>
      ) : (
        <ol className="space-y-3">
          {brief.points.map((p) => (
            <li key={p.id} className="card space-y-2">
              <LinkedText text={p.body} className="text-[15px] leading-relaxed text-fg" />
              <FactList facts={p.facts} />
              <p className="text-hint">Written <LocalTime iso={p.writtenAt.toISOString()} mode="datetime" /></p>
            </li>
          ))}
        </ol>
      )}
      {brief.resources.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="font-semibold text-fg">Scripts, questions and guides</h3>
          <p className="text-muted-sm">From the campaign, for the people on its jobs. Saved with this brief for the field.</p>
          <ResourceList resources={brief.resources} showAudience />
        </div>
      )}
    </section>
  );
}
