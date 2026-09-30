import { experienceTotals, VERIFICATION_LABELS, workerCanModify, type VerificationLevel } from "@/lib/experience";

export interface ExperienceRow {
  id: string;
  campaign: string;
  role: string;
  startDate: Date;
  endDate: Date | null;
  unitType: string;
  unitCount: number;
  verificationLevel: VerificationLevel;
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const fmtTotals = (t: Record<string, number>) =>
  Object.keys(t).length === 0
    ? "none yet"
    : Object.entries(t).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(" · ");

/**
 * Experience records with their verification badges. Verified totals exclude
 * self-reported records, which are listed separately.
 */
export function ExperienceList({
  records,
  removeAction,
}: {
  records: ExperienceRow[];
  /** Present only on the worker's own profile. */
  removeAction?: (formData: FormData) => Promise<void>;
}) {
  const totals = experienceTotals(records);
  return (
    <div className="space-y-3">
      <dl className="grid gap-2 sm:grid-cols-2 text-sm">
        <div className="rounded-lg border p-3">
          <dt className="text-neutral-500">Verified totals ({totals.verifiedRecords} records)</dt>
          <dd className="font-medium">{fmtTotals(totals.verified)}</dd>
        </div>
        <div className="rounded-lg border border-dashed p-3">
          <dt className="text-neutral-500">Self-reported, not in verified totals ({totals.selfReportedRecords})</dt>
          <dd className="font-medium">{fmtTotals(totals.selfReported)}</dd>
        </div>
      </dl>
      {records.length === 0 ? (
        <p className="text-sm text-neutral-500">No experience records yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {records.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
              <div>
                <p className="font-medium">{r.campaign}</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {r.role} · {fmtDate(r.startDate)} – {r.endDate ? fmtDate(r.endDate) : "ongoing"} ·{" "}
                  {r.unitCount.toLocaleString()} {r.unitType}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    r.verificationLevel === "SELF_REPORTED" ? "border-dashed text-neutral-500" : "font-medium"
                  }`}
                >
                  {VERIFICATION_LABELS[r.verificationLevel]}
                </span>
                {removeAction && workerCanModify(r.verificationLevel) && (
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="text-xs text-neutral-500 underline">Remove</button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
