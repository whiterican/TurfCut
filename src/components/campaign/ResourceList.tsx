import { LinkedText } from "@/components/campaign/LinkedText";
import { LocalTime } from "@/components/LocalTime";
import { groupByKind, KIND_LABELS } from "@/lib/campaign-kit";
import type { Resource } from "@/lib/campaign-kit-data";

/**
 * A campaign's scripts, common questions and guides (S4), grouped by kind,
 * each folded under its title. The campaign's own words, verbatim; a
 * "workers only" mark where the campaign kept one off its public page.
 */
export function ResourceList({ resources, showAudience = false, headingLevel = "h3" }: { resources: Resource[]; showAudience?: boolean; headingLevel?: "h2" | "h3" | "h4" }) {
  const groups = groupByKind(resources);
  if (groups.length === 0) return null;
  const H = headingLevel;
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.kind} className="space-y-2" aria-label={KIND_LABELS[g.kind].many}>
          <H className="text-sm font-semibold text-muted">{KIND_LABELS[g.kind].many}</H>
          {g.items.map((r) => (
            <details key={r.id} className="card group p-0">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 font-semibold text-fg">
                <span>{r.title}</span>
                <span className="flex items-center gap-2 text-xs font-normal text-muted">
                  {showAudience && r.audience === "WORKERS" && <span className="tag">Workers only</span>}
                  <span className="group-open:hidden">Open</span>
                  <span className="hidden group-open:inline">Close</span>
                </span>
              </summary>
              <div className="space-y-2 border-t border-border px-4 py-3">
                <LinkedText text={r.body} className="text-[15px] leading-relaxed text-fg" />
                <p className="text-hint">Updated <LocalTime iso={r.updatedAt.toISOString()} mode="datetime" /></p>
              </div>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
