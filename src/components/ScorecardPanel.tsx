import type { MetricExplanation, Scorecard } from "@/lib/scorecard";

const ROWS: Array<{ key: keyof Scorecard["metrics"]; label: string; pct?: boolean }> = [
  { key: "doorsPerActiveHour", label: "Doors per active hour" },
  { key: "doorsPerCompletedShift", label: "Doors per completed shift" },
  { key: "contactRate", label: "Contact rate", pct: true },
  { key: "signaturesPerActiveHour", label: "Signatures per active hour" },
  { key: "acceptanceRate", label: "Signature acceptance rate", pct: true },
  { key: "showRate", label: "Show rate", pct: true },
];

function fmt(m: MetricExplanation, pct?: boolean): string {
  if (m.value === null) return "No data yet";
  return pct ? `${(m.value * 100).toFixed(1)}%` : m.value.toFixed(2);
}

/**
 * Six separate metrics, each with its formula and evidence. Deliberately no
 * overall score (CLAUDE.md #5).
 */
export function ScorecardPanel({ scorecard }: { scorecard: Scorecard }) {
  return (
    <div className="space-y-2">
      <ul className="grid gap-2 sm:grid-cols-2">
        {ROWS.map(({ key, label, pct }) => {
          const m = scorecard.metrics[key];
          return (
            <li key={key} className="rounded-lg border p-3">
              <p className="text-sm text-neutral-500">{label}</p>
              <p className="text-xl font-semibold tabular-nums">{fmt(m, pct)}</p>
              <p className="text-xs text-neutral-500">{m.formula}</p>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">{m.evidence}</p>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-neutral-500">
        Derived from {scorecard.eventCount} recorded work events. Paused time is
        excluded from active hours. No overall score is computed.
      </p>
    </div>
  );
}
