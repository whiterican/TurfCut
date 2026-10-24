import Link from "next/link";
import { shiftStatusLabel } from "@/lib/field-day";
import { groupField, type FieldRow } from "@/lib/field-view";
import { LocalTime } from "@/components/LocalTime";
import { LiveGroupFigure } from "@/components/staff/FieldLive";
import { groupKey } from "@/lib/field-live";

/** Shifts grouped by job and staging point, each with its state, packets out and signatures. */
export function FieldBoard({ rows, empty }: { rows: FieldRow[]; empty: string }) {
  const groups = groupField(rows);
  if (groups.length === 0) return <p className="text-muted-sm">{empty}</p>;
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={`${g.jobId}-${g.staging ?? ""}`} className="section" aria-label={`${g.jobTitle}${g.staging ? `, ${g.staging}` : ""}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="section-title">
              {g.jobTitle}
              <span className="text-muted-sm font-normal"> · {g.staging ?? "No staging point set"}</span>
            </h2>
            {/* The group's figures tick with the live summary when the page has one (P1.7); the counts the server rendered are the fallback. */}
            <p className="text-xs text-muted tabular-nums">
              <LiveGroupFigure group={groupKey(g)} of="checkedIn" fallback={g.checkedIn} /> of {g.rows.length} checked in · <LiveGroupFigure group={groupKey(g)} of="packetsOut" fallback={g.packetsOut} /> {g.packetsOut === 1 ? "packet" : "packets"} out
              {g.packetsHeld > 0 ? <> · {g.packetsHeld} kept by workers</> : null} · <LiveGroupFigure group={groupKey(g)} of="signatures" fallback={g.signatures} /> signatures
            </p>
          </div>
          <ul className="list-card">
            {g.rows.map((r) => {
              const label = shiftStatusLabel(r.state);
              return (
                <li key={r.shiftId}>
                  <Link transitionTypes={["nav-forward"]} href={`/shifts/${r.shiftId}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg">{r.worker}</span>
                      <span className="block text-xs text-muted">
                        <LocalTime iso={r.startsAt.toISOString()} mode="time" /> – <LocalTime iso={r.endsAt.toISOString()} mode="time" />
                        {r.state.packetsOut.length > 0 && ` · ${r.state.packetsOut.length} out`}
                        {r.state.packetsHeld.length > 0 && ` · ${r.state.packetsHeld.length} kept`}
                        {r.state.signatures > 0 && ` · ${r.state.signatures} sig.`}
                      </span>
                    </span>
                    <span className={label.badge}>{label.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
