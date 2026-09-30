import type { MetricExplanation, Period, Scorecard, ScorecardSegment } from "@/lib/scorecard";

const WORK_TYPE_LABELS = { PETITION: "Petition circulation", CANVASS: "Door-to-door canvass" } as const;
const PERIOD_LABELS: Record<Period, string> = { lifetime: "Lifetime", "12m": "Last 12 months", "90d": "Last 90 days" };

const AVERAGES: Array<{ key: keyof ScorecardSegment["averages"]; label: string; pct?: boolean }> = [
  { key: "doorsPerActiveHour", label: "Doors per active hour" },
  { key: "doorsPerCompletedShift", label: "Doors per completed shift" },
  { key: "contactRate", label: "Contact rate", pct: true },
  { key: "signaturesPerActiveHour", label: "Signatures per active hour" },
  { key: "acceptanceRate", label: "Signature acceptance rate", pct: true },
];

function fmt(m: MetricExplanation, pct?: boolean): string {
  if (m.value === null) return "No data yet";
  return pct ? `${(m.value * 100).toFixed(1)}%` : m.value.toFixed(2);
}

function Metric({ label, m, pct }: { label: string; m: MetricExplanation; pct?: boolean }) {
  return (
    <li className="rounded-lg border p-3">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{fmt(m, pct)}</p>
      <p className="text-xs text-neutral-500">{m.formula}</p>
      <p className="text-xs text-neutral-600 dark:text-neutral-400">{m.evidence}</p>
    </li>
  );
}

function Segment({ seg }: { seg: ScorecardSegment }) {
  const v = seg.verificationBreakdown;
  const totals: Array<[string, string]> = [
    ["Doors attempted", seg.doorsAttempted.toLocaleString()],
    [
      "Signatures submitted",
      `${seg.signaturesSubmitted.toLocaleString()} (${seg.signaturesAccepted.toLocaleString()} accepted of ${seg.signaturesReviewed.toLocaleString()} reviewed)`,
    ],
    ["Campaigns", String(seg.campaignsCount)],
    ["Ballot initiatives", seg.initiativesCount === null ? "Not tracked yet" : String(seg.initiativesCount)],
    ["Verified active hours", String(seg.activeHours)],
  ];
  return (
    <div className="space-y-3">
      <h3 className="font-medium">
        {WORK_TYPE_LABELS[seg.workType]}
        <span className="ml-2 text-sm font-normal text-neutral-500">
          {[seg.statesWorked.join(", "), seg.dateRange && `${seg.dateRange.from} – ${seg.dateRange.to}`]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </h3>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        {totals.map(([k, val]) => (
          <div key={k} className="rounded-lg border p-2">
            <dt className="text-neutral-500">{k}</dt>
            <dd className="font-medium tabular-nums">{val}</dd>
          </div>
        ))}
      </dl>
      <ul className="grid gap-2 sm:grid-cols-2">
        {AVERAGES.map(({ key, label, pct }) => (
          <Metric key={key} label={label} m={seg.averages[key]} pct={pct} />
        ))}
      </ul>
      <p className="text-xs text-neutral-500">
        Verification: {v.verifiedShifts} verified shift(s) counted; {v.pendingReviewShifts} awaiting review,{" "}
        {v.rejectedShifts} rejected and {v.incompleteShifts} incomplete not counted.
        {seg.correctionsApplied > 0 && ` ${seg.correctionsApplied} signed correction(s) applied; original entries kept.`}
      </p>
    </div>
  );
}

/**
 * Totals and rates together (spec p.10), segmented by work type so unlike
 * work is never compared. Deliberately no overall score (CLAUDE.md #5).
 */
export function ScorecardPanel({ periods }: { periods: Record<Period, Scorecard> }) {
  const lifetime = periods.lifetime;
  const sumOf = (s: Scorecard, pick: (x: ScorecardSegment) => number) =>
    s.segments.reduce((a, x) => a + pick(x), 0);

  return (
    <div className="space-y-6">
      {lifetime.segments.length === 0 ? (
        <p className="text-sm text-neutral-500">No verified shifts yet.</p>
      ) : (
        lifetime.segments.map((seg) => <Segment key={seg.workType} seg={seg} />)
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        <Metric label="Show rate" m={lifetime.reliability.showRate} pct />
      </ul>

      <div className="space-y-1">
        <h3 className="font-medium">Recent activity</h3>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="font-normal">Period</th>
              <th className="font-normal">Verified shifts</th>
              <th className="font-normal">Active hours</th>
              <th className="font-normal">Doors</th>
              <th className="font-normal">Signatures accepted</th>
            </tr>
          </thead>
          <tbody>
            {(["90d", "12m", "lifetime"] as const).map((p) => (
              <tr key={p} className="border-t">
                <td>{PERIOD_LABELS[p]}</td>
                <td>{sumOf(periods[p], (x) => x.shiftsCount)}</td>
                <td>{Math.round(sumOf(periods[p], (x) => x.activeHours) * 100) / 100}</td>
                <td>{sumOf(periods[p], (x) => x.doorsAttempted)}</td>
                <td>{sumOf(periods[p], (x) => x.signaturesAccepted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        Derived from recorded work events and supervisor reviews
        {lifetime.lastUpdated && `, last updated ${lifetime.lastUpdated.slice(0, 10)}`}. Paused time is excluded
        from active hours. No overall score is computed.
      </p>
    </div>
  );
}
