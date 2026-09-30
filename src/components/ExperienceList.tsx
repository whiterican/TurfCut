import {
  CAMPAIGN_TYPES,
  CHANNELS,
  EXPERIENCE_GROUPS,
  experienceTotals,
  VERIFICATION_LABELS,
  workerCanModify,
  type VerificationLevel,
} from "@/lib/experience";

export interface ExperienceRow {
  id: string;
  organizationName: string | null;
  campaign: string;
  campaignType: string | null;
  experienceGroup: string | null;
  role: string;
  channel: string | null;
  state: string | null;
  countyOrDistrict: string | null;
  turfType: string | null;
  startDate: Date;
  endDate: Date | null;
  completedShifts: number | null;
  activeHours: number | null;
  unitType: string;
  unitCount: number;
  approvedCount: number | null;
  /** Worker's own view only — the employer page strips it to hasReference. */
  referenceContact?: string | null;
  hasReference: boolean;
  verificationLevel: VerificationLevel;
}

const label = (xs: readonly { value: string; label: string }[], v: string | null) =>
  v ? (xs.find((x) => x.value === v)?.label ?? v) : null;
const join = (parts: Array<string | null | false | undefined>) => parts.filter(Boolean).join(" · ");

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
  showReference = false,
}: {
  records: ExperienceRow[];
  /** Present only on the worker's own profile. */
  removeAction?: (formData: FormData) => Promise<void>;
  /** Worker's own view only. Employers see "reference provided". */
  showReference?: boolean;
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
              <div className="space-y-0.5">
                <p className="font-medium">
                  {r.campaign}
                  {r.organizationName && <span className="font-normal text-neutral-500"> · {r.organizationName}</span>}
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {join([
                    label(EXPERIENCE_GROUPS, r.experienceGroup),
                    r.role,
                    label(CAMPAIGN_TYPES, r.campaignType),
                    label(CHANNELS, r.channel),
                  ])}
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {join([
                    `${fmtDate(r.startDate)} – ${r.endDate ? fmtDate(r.endDate) : "ongoing"}`,
                    join([r.countyOrDistrict, r.state]) || null,
                    r.turfType,
                  ])}
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {join([
                    `${r.unitCount.toLocaleString()} ${r.unitType} submitted`,
                    r.approvedCount !== null && `${r.approvedCount.toLocaleString()} approved`,
                    r.completedShifts !== null && `${r.completedShifts} shifts`,
                    r.activeHours !== null && `${r.activeHours} active hours`,
                  ])}
                </p>
                {showReference && r.referenceContact ? (
                  <p className="text-xs text-neutral-500">Reference: {r.referenceContact}</p>
                ) : r.hasReference ? (
                  <p className="text-xs text-neutral-500">Reference provided</p>
                ) : null}
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
