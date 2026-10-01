import type { MetricExplanation, Period, Scorecard, ScorecardSegment } from "@/lib/scorecard";

const WORK_TYPE_LABELS = { PETITION: "Petition circulation", CANVASS: "Door-to-door canvass" } as const;
const WORK_TYPE_BADGE = { PETITION: "badge-lavender", CANVASS: "badge-sky" } as const;
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

function Metric({ label, m, pct, dot }: { label: string; m: MetricExplanation; pct?: boolean; dot?: string }) {
  return (
    <li className="stat">
      <p className="stat-label">
        {dot && <span aria-hidden className={`dot ${dot}`} />}
        {label}
      </p>
      <p className={m.value === null ? "mt-1 text-base font-medium text-subtle" : "stat-value"}>{fmt(m, pct)}</p>
      <p className="text-hint mt-2">{m.formula}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{m.evidence}</p>
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
    ["Ballot initiatives", String(seg.initiativesCount)],
    ["Verified active hours", String(seg.activeHours)],
  ];
  return (
    <div className="space-y-4">
      <h3 className="flex flex-wrap items-center gap-2">
        <span className={WORK_TYPE_BADGE[seg.workType]}>{WORK_TYPE_LABELS[seg.workType]}</span>
        <span className="text-muted-sm">
          {[seg.statesWorked.join(", "), seg.dateRange && `${seg.dateRange.from} – ${seg.dateRange.to}`]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </h3>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {totals.map(([k, val]) => (
          <div key={k} className="kv">
            <dt>{k}</dt>
            <dd>{val}</dd>
          </div>
        ))}
      </dl>
      <ul className="grid gap-3 sm:grid-cols-2">
        {AVERAGES.map(({ key, label, pct }) => (
          <Metric key={key} label={label} m={seg.averages[key]} pct={pct} />
        ))}
      </ul>
      <p className="text-hint">
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
    <div className="space-y-8">
      {lifetime.segments.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No verified shifts yet</p>
          <p className="empty-state-body">
            Rates appear here once a shift is checked in, checked out and approved by a supervisor.
          </p>
        </div>
      ) : (
        lifetime.segments.map((seg) => <Segment key={seg.workType} seg={seg} />)
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        <Metric label="Show rate" m={lifetime.reliability.showRate} pct dot="bg-mint" />
      </ul>

      <div className="card space-y-3">
        <h3 className="font-medium text-fg">Recent activity</h3>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="table min-w-[28rem]">
          <thead>
            <tr>
              <th>Period</th>
              <th>Verified shifts</th>
              <th>Active hours</th>
              <th>Doors</th>
              <th>Signatures accepted</th>
            </tr>
          </thead>
          <tbody>
            {(["90d", "12m", "lifetime"] as const).map((p) => (
              <tr key={p}>
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
      </div>

      <p className="text-hint">
        Derived from recorded work events and supervisor reviews
        {lifetime.lastUpdated && `, last updated ${lifetime.lastUpdated.slice(0, 10)}`}. Paused time is excluded
        from active hours. No overall score is computed.
      </p>
    </div>
  );
}
