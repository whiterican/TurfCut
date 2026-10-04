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

/** Verification level → badge style. Self-reported is deliberately neutral. */
const BADGE: Record<VerificationLevel, string> = {
  PLATFORM: "badge-plum",
  ORGANIZATION: "badge-sky",
  IMPORTED: "badge-lilac",
  SELF_REPORTED: "badge-dashed",
};

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
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="card">
          <dt className="stat-label">
            <span aria-hidden className="dot bg-plum" />
            Verified totals · {totals.verifiedRecords} record{totals.verifiedRecords === 1 ? "" : "s"}
          </dt>
          <dd className="mt-1 font-medium text-fg">{fmtTotals(totals.verified)}</dd>
        </div>
        <div className="card-dashed">
          <dt className="stat-label">
            Self-reported · not in verified totals ({totals.selfReportedRecords})
          </dt>
          <dd className="mt-1 font-medium text-fg">{fmtTotals(totals.selfReported)}</dd>
        </div>
      </dl>
      {records.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No experience yet</p>
          <p className="empty-state-body">
            {removeAction
              ? "Add the campaigns you've worked on. They show as self-reported until Turfcut or an organization verifies them."
              : "This worker hasn't added any campaigns yet."}
          </p>
        </div>
      ) : (
        <ul className="list-card">
          {records.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-fg">
                  {r.campaign}
                  {r.organizationName && <span className="font-normal text-muted"> · {r.organizationName}</span>}
                </p>
                <p className="text-muted-sm">
                  {join([
                    label(EXPERIENCE_GROUPS, r.experienceGroup),
                    r.role,
                    label(CAMPAIGN_TYPES, r.campaignType),
                    label(CHANNELS, r.channel),
                  ])}
                </p>
                <p className="text-muted-sm">
                  {join([
                    `${fmtDate(r.startDate)} – ${r.endDate ? fmtDate(r.endDate) : "ongoing"}`,
                    join([r.countyOrDistrict, r.state]) || null,
                    r.turfType,
                  ])}
                </p>
                <p className="text-sm text-fg tabular-nums">
                  {join([
                    `${r.unitCount.toLocaleString()} ${r.unitType} submitted`,
                    r.approvedCount !== null && `${r.approvedCount.toLocaleString()} approved`,
                    r.completedShifts !== null && `${r.completedShifts} shifts`,
                    r.activeHours !== null && `${r.activeHours} active hours`,
                  ])}
                </p>
                {showReference && r.referenceContact ? (
                  <p className="text-hint">Reference: {r.referenceContact}</p>
                ) : r.hasReference ? (
                  <p className="text-hint">Reference provided</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={BADGE[r.verificationLevel]}>{VERIFICATION_LABELS[r.verificationLevel]}</span>
                {removeAction && workerCanModify(r.verificationLevel) && (
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="btn-ghost btn-sm">Remove</button>
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
