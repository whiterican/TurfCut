import type { HiringSnapshot } from "@/lib/engagements";
import { FitSignals } from "@/components/FitSignals";
import { RelativeTime } from "@/components/RelativeTime";
import { NotSharedChip } from "@/components/staff/NotSharedChip";
import { num, percent, plural } from "@/lib/format";
import { Row } from "@/components/Row";

type Frozen = { value: number | null; numerator: number | null; denominator: number | null };
// Counts are null when the worker didn't share hours and history: the value alone.
const pct = (m: Frozen) => (m.value === null ? "No data yet" : m.numerator === null ? percent(m.value) : `${percent(m.value)} (${m.numerator} of ${m.denominator})`);
const rate = (m: Frozen) => (m.value === null ? "No data yet" : m.numerator === null ? num(m.value, 1) : `${num(m.value, 1)} (${m.numerator} ÷ ${m.denominator})`);
const isNum = (v: unknown) => typeof v === "number" || v === null;

const SHOWN: Array<{ key: string; label: string; pct?: boolean; work?: "PETITION" | "CANVASS" }> = [
  { key: "signaturesPerActiveHour", label: "Signatures per active hour", work: "PETITION" },
  { key: "acceptanceRate", label: "Signature acceptance", pct: true, work: "PETITION" },
  { key: "doorsPerActiveHour", label: "Doors per active hour", work: "CANVASS" },
  { key: "contactRate", label: "Contact rate", pct: true, work: "CANVASS" },
];

/**
 * What the organization could see when this hiring decision was made —
 * frozen, never recomputed. Groups the worker didn't share then show "not
 * shared" (C2); snapshots from before C2 hold what was shown at the time.
 */
export function SnapshotView({ snapshot }: { snapshot: HiringSnapshot }) {
  // Seeded and pre-M2 rows hold a placeholder, not a full snapshot.
  const sc = snapshot?.scorecard;
  const whole =
    !!sc &&
    (sc.showRate === null || (typeof sc.showRate === "object" && !Array.isArray(sc.showRate) && "value" in sc.showRate)) &&
    Array.isArray(sc.segments) &&
    sc.segments.every((g) => isNum(g?.shiftsCount) && isNum(g?.activeHours)) &&
    typeof snapshot.fit?.fields === "object" &&
    snapshot.fit.fields !== null &&
    typeof snapshot.capturedAt === "string";
  if (!whole) {
    return <p className="text-hint">No hiring snapshot was saved for this engagement.</p>;
  }
  const s = snapshot.scorecard;
  const day = new Date(snapshot.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return (
    <div className="space-y-3">
      <p className="text-hint">
        As of {day} (<RelativeTime iso={snapshot.capturedAt} />)
        {snapshot.consentVersion != null ? ` · consent version ${snapshot.consentVersion}` : " · no fit answers on file"}
        {s.shared && " · only what the worker shared then"}
      </p>
      <dl className="list-card">
        <Row label="Show rate">{s.showRate ? pct(s.showRate) : <NotSharedChip what="show rate" />}</Row>
        {s.segments.length === 0 ? (
          <Row label="Verified work">{s.shared && !s.shared.history ? <NotSharedChip what="hours and history" /> : "No verified shifts yet"}</Row>
        ) : (
          s.segments.map((seg) => (
            <div key={seg.workType} className="contents">
              <Row label={seg.workType === "PETITION" ? "Petitioning" : "Canvassing"}>
                {seg.shiftsCount === null || seg.activeHours === null ? (
                  <NotSharedChip what="hours and history" />
                ) : (
                  `${plural(seg.shiftsCount, "verified shift")} · ${num(seg.activeHours, 1)} active hours`
                )}
              </Row>
              {/* Pre-C2 snapshots listed shifts and hours only; their averages stay as stored. */}
              {s.shared &&
                SHOWN.filter((m) => m.work === seg.workType).map((m) => {
                  const v = seg.averages?.[m.key];
                  return (
                    <Row key={m.key} label={m.label}>
                      {v ? (m.pct ? pct(v) : rate(v)) : <NotSharedChip what={m.label.toLowerCase()} />}
                    </Row>
                  );
                })}
            </div>
          ))
        )}
      </dl>
      <FitSignals view={snapshot.fit} />
    </div>
  );
}
