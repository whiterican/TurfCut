import { EVENT_LABELS, NOT_SELECTED_REASONS, type EngagementEventType } from "@/lib/engagements";

const when = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * An engagement's dated history (C3), shown the same way to the worker and
 * the organization: each step, the reason when someone wasn't selected, and
 * any note written to the worker.
 */
export function EngagementHistory({
  events,
}: {
  events: Array<{ id: string; type: EngagementEventType; reasonCode: string | null; note: string | null; createdAt: Date }>;
}) {
  if (events.length === 0) return null;
  return (
    <ol className="space-y-1.5 border-l border-border pl-4 text-sm" aria-label="History">
      {events.map((e) => (
        <li key={e.id} className="space-y-0.5">
          <p className="text-fg">
            {EVENT_LABELS[e.type]} <span className="text-muted">· {when(e.createdAt)}</span>
          </p>
          {e.reasonCode && <p className="text-muted-sm">{NOT_SELECTED_REASONS.find((r) => r.value === e.reasonCode)?.label ?? "Another reason"}</p>}
          {e.note && <p className="text-muted-sm whitespace-pre-line">&ldquo;{e.note}&rdquo;</p>}
        </li>
      ))}
    </ol>
  );
}
