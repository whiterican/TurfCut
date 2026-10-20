import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/staff-session";
import { COMPENSATION_METHODS, UUID_RE } from "@/lib/jobs";
import { loadJurisdictionForAdmin } from "@/lib/admin-jurisdictions-data";
import { JurisdictionDecisionForm } from "@/components/admin/JurisdictionDecisionForm";
import { StandingChip } from "@/components/admin/StandingChip";
import { LocalTime } from "@/components/LocalTime";

const ACTION_WORDS: Record<string, string> = {
  "jurisdiction.version_proposed": "Proposed",
  "jurisdiction.version_approved": "Approved",
  "jurisdiction.approval_renewed": "Approval renewed",
  "jurisdiction.approval_withdrawn": "Approval withdrawn",
  "jurisdiction.proposal_retired": "Proposal retired",
};

/** One version of a place's rules (M10.3): the rules, what the gate makes of them, the jobs under them, the decisions, and the next decision. */
export default async function AdminJurisdictionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const j = await loadJurisdictionForAdmin(id);
  if (!j) notFound();
  const methods = j.rulesRead.compensationAllowed.map((m) => COMPENSATION_METHODS.find((c) => c.value === m)?.label ?? m);
  const requirements = [j.rulesRead.workerRegistrationRequired && "Circulator registration", j.rulesRead.badgeRequired && "Badge", j.rulesRead.affidavitRequired && "Signed affidavit"].filter(Boolean) as string[];
  return (
    <>
      <p>
        <Link transitionTypes={["nav-back"]} href="/admin/jurisdictions" className="link text-sm">All jurisdictions</Link>
      </p>
      <header className="space-y-2">
        <h2 className="page-title">{j.label}</h2>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <StandingChip v={j} />
          {j.approved && j.approvedAt ? <span>Approved <LocalTime iso={j.approvedAt.toISOString()} mode="fulldate" /></span> : <span>Not approved</span>}
          {j.approvalExpiresAt && <span>· expires <LocalTime iso={j.approvalExpiresAt.toISOString()} mode="fulldate" /></span>}
          {j.effectiveFrom && <span>· effective <LocalTime iso={j.effectiveFrom.toISOString()} mode="fulldate" /></span>}
          {j.supersededAt && <span>· superseded <LocalTime iso={j.supersededAt.toISOString()} mode="fulldate" /></span>}
        </p>
        {j.problems.length > 0 && (
          <ul className="text-warning-msg list-disc space-y-0.5 pl-5 text-sm">
            {j.problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
      </header>

      <section className="section" aria-labelledby="rules">
        <h3 id="rules" className="section-title">Rules</h3>
        <dl className="card grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="eyebrow eyebrow-quiet">Pay methods</dt>
            <dd className="text-sm text-fg">{methods.join(", ")}{j.rulesRead.perUnitAllowed ? " · per-unit explicitly approved" : ""}</dd>
          </div>
          <div>
            <dt className="eyebrow eyebrow-quiet">Circulator requirements</dt>
            <dd className="text-sm text-fg">{requirements.length ? requirements.join(", ") : "None"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="eyebrow eyebrow-quiet">Notes</dt>
            <dd className="text-sm text-fg whitespace-pre-wrap">{j.rulesRead.notes || "None"}</dd>
          </div>
        </dl>
      </section>

      <section className="section" aria-labelledby="decide">
        <h3 id="decide" className="section-title">{j.standing === "superseded" ? "Superseded" : j.standing === "proposed" ? "Approve or retire" : j.approved ? "Renew or withdraw" : "Approve"}</h3>
        {j.standing === "superseded" ? (
          <p className="text-muted-sm">A newer version took this one&apos;s place. Jobs still on it are frozen until their organization changes their pay method; propose a new version to change the rules again.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <JurisdictionDecisionForm id={j.id} mode="approve" label={j.standing === "current" && j.approved ? "Renew approval" : j.standing === "current" ? "Approve again" : `Approve version ${j.version}`} />
            {j.standing === "proposed" && <JurisdictionDecisionForm id={j.id} mode="retire" label="Retire this proposal" />}
            {j.standing === "current" && j.approved && <JurisdictionDecisionForm id={j.id} mode="withdraw" label="Withdraw approval" />}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="jobs">
        <h3 id="jobs" className="section-title">Open jobs under this version</h3>
        {j.jobList.length === 0 ? (
          <p className="text-muted-sm">None.</p>
        ) : (
          <ul className="list-card">
            {j.jobList.map((job) => (
              <li key={job.id} className="space-y-1 px-4 py-3">
                <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-fg">{job.title}</span>
                  {job.problems.length ? <span className="badge-coral">Frozen</span> : <span className="badge-solid">Usable</span>}
                </p>
                <p className="text-sm text-muted">{job.orgName} · {job.status.toLowerCase()} · {COMPENSATION_METHODS.find((c) => c.value === job.compensationMethod)?.label ?? job.compensationMethod}</p>
                {job.problems.length > 0 && <p className="text-sm text-warning-msg">{job.problems[job.problems.length - 1]}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {j.siblings.length > 0 && (
        <section className="section" aria-labelledby="versions">
          <h3 id="versions" className="section-title">Other versions of this place</h3>
          <ul className="list-card">
            {j.siblings.map((s) => (
              <li key={s.id}>
                <Link transitionTypes={["nav-forward"]} href={`/admin/jurisdictions/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition hover:bg-surface-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-fg">Version {s.version} <StandingChip v={s} /></span>
                  <span className="text-xs text-subtle">{s.jobs} open {s.jobs === 1 ? "job" : "jobs"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section" aria-labelledby="history">
        <h3 id="history" className="section-title">Turfcut&apos;s decisions on this version</h3>
        {j.history.length === 0 ? (
          <p className="text-muted-sm">None recorded. Profiles that predate the console have no ledger rows.</p>
        ) : (
          <ul className="list-card">
            {j.history.map((h) => (
              <li key={h.id} className="space-y-1 px-4 py-3">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-fg">{ACTION_WORDS[h.action] ?? h.action}</span>
                  <span className="text-xs text-subtle"><LocalTime iso={h.createdAt.toISOString()} mode="full" /></span>
                </p>
                <p className="text-sm text-muted">{h.staffName}</p>
                <p className="text-sm text-fg">{h.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
