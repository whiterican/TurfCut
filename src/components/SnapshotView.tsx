import type { HiringSnapshot } from "@/lib/engagements";
import { FitSignals } from "@/components/FitSignals";
import { RelativeTime } from "@/components/RelativeTime";
import { num, percent, plural } from "@/lib/format";
import { Row } from "@/components/Row";

const pct = (m: { value: number | null; numerator: number; denominator: number }) =>
  m.value === null ? "No data yet" : `${percent(m.value)} (${m.numerator} of ${m.denominator})`;

/**
 * What the organization could see when this hiring decision was made —
 * frozen, never recomputed. Fit shows authorized signals only.
 */
export function SnapshotView({ snapshot }: { snapshot: HiringSnapshot }) {
  // Seeded and pre-M2 rows hold a placeholder, not a full snapshot.
  if (!snapshot?.scorecard?.showRate || !Array.isArray(snapshot.scorecard.segments)) {
    return <p className="text-hint">No hiring snapshot was saved for this engagement.</p>;
  }
  const s = snapshot.scorecard;
  return (
    <div className="space-y-3">
      <p className="text-hint">
        Frozen <RelativeTime iso={snapshot.capturedAt} />
        {snapshot.consentVersion !== null ? ` · consent version ${snapshot.consentVersion}` : " · no fit answers on file"}
      </p>
      <dl className="list-card">
        <Row label="Show rate">{pct(s.showRate)}</Row>
        {s.segments.length === 0 ? (
          <Row label="Verified work">No verified shifts yet</Row>
        ) : (
          s.segments.map((seg) => (
            <Row key={seg.workType} label={seg.workType === "PETITION" ? "Petitioning" : "Canvassing"}>
              {plural(seg.shiftsCount, "verified shift")} · {num(seg.activeHours, 1)} active hours
            </Row>
          ))
        )}
      </dl>
      <FitSignals view={snapshot.fit} />
    </div>
  );
}
