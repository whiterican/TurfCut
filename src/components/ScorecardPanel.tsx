import { num, percent, plural } from "@/lib/format";
import type { CampaignHistory, MetricExplanation, Period, Scorecard, ScorecardSegment } from "@/lib/scorecard";

const WORK_TYPE_LABELS = { PETITION: "Petition circulation", CANVASS: "Door-to-door canvass" } as const;
const WORK_TYPE_BADGE = { PETITION: "badge-butter", CANVASS: "badge-plum" } as const;
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
  return pct ? percent(m.value) : num(m.value);
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
    ["Doors attempted", num(seg.doorsAttempted)],
    [
      "Signatures",
      `${num(seg.signaturesSubmitted)} submitted · ${num(seg.signaturesAccepted)} accepted` +
        (seg.signaturesReviewed < seg.signaturesSubmitted ? ` · ${num(seg.signaturesSubmitted - seg.signaturesReviewed)} awaiting review` : ""),
    ],
    ["Campaigns", String(seg.campaignsCount)],
    ["Ballot initiatives", String(seg.initiativesCount)],
    ["Verified active hours", num(seg.activeHours, 1)],
  ];
  return (
    <div className="space-y-4">
      <h3 className="flex flex-wrap items-center gap-2">
        <span className={WORK_TYPE_BADGE[seg.workType]}>{WORK_TYPE_LABELS[seg.workType]}</span>
        <span className="text-muted-sm">
          {[seg.statesWorked.join(", "), seg.dateLabel]
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
        Verification: {plural(v.verifiedShifts, "verified shift")} counted; {v.pendingReviewShifts} awaiting review,{" "}
        {v.rejectedShifts} rejected and {v.incompleteShifts} incomplete not counted.
        {seg.correctionsApplied > 0 && ` ${plural(seg.correctionsApplied, "signed correction")} applied; original entries kept.`}
      </p>
    </div>
  );
}

/**
 * Totals and rates together (spec p.10), segmented by work type so unlike
 * work is never compared. Deliberately no overall score (CLAUDE.md #5).
 */
export function ScorecardPanel({ periods, history }: { periods: Record<Period, Scorecard>; history?: CampaignHistory[] }) {
  const lifetime = periods.lifetime;
  const sumOf = (s: Scorecard, pick: (x: ScorecardSegment) => number) =>
    s.segments.reduce((a, x) => a + pick(x), 0);
  const total = (pick: (x: ScorecardSegment) => number) => sumOf(lifetime, pick);
  const petition = lifetime.segments.some((x) => x.workType === "PETITION");
  const show = lifetime.reliability.showRate;
  // Four headline totals (screen mockups) — each with its evidence; there is
  // no overall score.
  const tiles: Array<{ value: string; label: string; evidence: string }> = [
    { value: num(total((x) => x.shiftsCount)), label: "Verified shifts", evidence: "Approved by a supervisor" },
    { value: show.value === null ? "—" : percent(show.value), label: "Show rate", evidence: show.value === null ? "No scheduled shifts yet" : `${show.numerator} of ${show.denominator} scheduled shifts worked` },
    petition
      ? { value: num(total((x) => x.signaturesAccepted)), label: "Accepted signatures", evidence: `Of ${num(total((x) => x.signaturesReviewed))} reviewed` }
      : { value: num(total((x) => x.doorsAttempted)), label: "Doors attempted", evidence: "On verified shifts" },
    { value: num(total((x) => x.activeHours), 1), label: "Verified hours", evidence: "Breaks excluded" },
  ];
  const strengths = [
    ...lifetime.segments.map((x) => ({ label: WORK_TYPE_LABELS[x.workType], tone: WORK_TYPE_BADGE[x.workType] })),
    ...[...new Set(lifetime.segments.flatMap((x) => x.statesWorked))].map((st) => ({ label: `Worked in ${st}`, tone: "badge-butter" })),
  ];

  return (
    <div className="space-y-8">
      <ul className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <li key={tile.label} className="stat">
            <p className="text-3xl font-bold tracking-[-0.02em] text-fg tabular-nums">{tile.value}</p>
            <p className="mt-1 text-sm font-medium text-muted">{tile.label}</p>
            <p className="text-hint mt-1">{tile.evidence}</p>
          </li>
        ))}
      </ul>

      {strengths.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-bold text-fg">Verified strengths</h3>
          <p className="flex flex-wrap gap-2">
            {strengths.map((x) => <span key={x.label} className={`${x.tone} px-2.5 py-1 text-sm`}>{x.label}</span>)}
          </p>
        </section>
      )}

      {history && (
        <section className="space-y-3">
          <h3 className="font-bold text-fg">Recent history</h3>
          {history.length === 0 ? (
            <p className="text-muted-sm">Campaigns appear here once a supervisor approves one of your shifts.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((h) => (
                <li key={h.jobId} className="flex items-center gap-3 py-3">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-plum font-bold text-on-plum">✓</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-fg">{h.title}</span>
                    <span className="block text-sm text-muted">
                      {plural(h.verifiedShifts, "verified shift")}
                      {h.workType === "PETITION"
                        ? h.reviewed > 0 ? ` · ${percent(h.accepted / h.reviewed)} accepted` : ""
                        : ` · ${num(h.doors)} doors`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-hint">Only you see this list. Organizations see your totals, not which campaigns you worked for.</p>
        </section>
      )}

      <h3 className="font-bold text-fg">The math behind every number</h3>
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
        <Metric label="Show rate" m={lifetime.reliability.showRate} pct dot="bg-success" />
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
