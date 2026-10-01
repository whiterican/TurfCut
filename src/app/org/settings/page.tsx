import { db } from "@/lib/db";
import { ORG_ROLES } from "@/lib/access";
import { requireOrgMember } from "@/lib/employer-session";
import { COMPENSATION_METHODS, jurisdictionLabel, jurisdictionProblems } from "@/lib/jobs";
import { recordClassificationReview, saveLegalContact, signContractorTerms } from "./actions";

const day = (d: Date) => d.toISOString().slice(0, 10);

function GateRow({ label, done, detail, children }: { label: string; done: boolean; detail: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="flex items-center gap-2 font-medium text-fg">
          {label}
          <span className={done ? "badge-mint" : "badge-neutral"}>{done ? "Done" : "Not yet"}</span>
        </p>
        <p className="text-muted-sm">{detail}</p>
      </div>
      {children}
    </div>
  );
}

/** Publish-gate records and the jurisdiction rule profiles jobs can use. */
export default async function OrgSettingsPage() {
  const session = await requireOrgMember(ORG_ROLES);
  const [org, jurisdictions] = await Promise.all([
    db().organization.findUniqueOrThrow({ where: { id: session.orgId } }),
    db().jurisdictionProfile.findMany({ orderBy: [{ state: "asc" }, { locality: "asc" }, { version: "desc" }] }),
  ]);
  const isOwner = session.role === "OWNER";
  const canReview = isOwner || session.role === "COMPLIANCE";
  const now = new Date();

  return (
    <main className="page max-w-3xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Organization settings</p>
          <h1 className="page-title">{org.name}</h1>
        </div>
      </header>

      <section className="section">
        <h2 className="section-title">Before any job can publish</h2>
        <div className="list-card">
          <GateRow
            label="Turfcut approval"
            done={org.approved}
            detail={org.approved ? "Approved for the private pilot." : "Turfcut reviews every organization by hand during the pilot."}
          />
          <GateRow
            label="Contractor terms"
            done={!!org.contractorTermsSignedAt}
            detail={
              org.contractorTermsSignedAt
                ? `Signed ${day(org.contractorTermsSignedAt)}.`
                : "An owner signs Turfcut's pilot contractor terms on behalf of the organization."
            }
          >
            {!org.contractorTermsSignedAt && isOwner && (
              <form action={signContractorTerms}>
                <button className="btn-primary btn-sm">Sign terms</button>
              </form>
            )}
          </GateRow>
          <GateRow
            label="Worker-classification review"
            done={!!org.classificationReviewedAt}
            detail={
              org.classificationReviewedAt
                ? `Recorded ${day(org.classificationReviewedAt)}.`
                : "An owner or compliance lead confirms the organization has reviewed how its field workers are classified."
            }
          >
            {!org.classificationReviewedAt && canReview && (
              <form action={recordClassificationReview}>
                <button className="btn-primary btn-sm">Record review</button>
              </form>
            )}
          </GateRow>
        </div>
        <p className="text-hint">Each is recorded once, with a timestamp, in the audit log.</p>
      </section>

      <section className="section">
        <h2 className="section-title">Legal-review contact</h2>
        {isOwner ? (
          <form action={saveLegalContact} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 space-y-1.5">
              <span className="label">Who reviews legal questions for your organization</span>
              <input name="legalContact" className="field" maxLength={200} defaultValue={org.legalContact ?? ""} placeholder="Name, email or phone" />
            </label>
            <button className="btn-secondary">Save</button>
          </form>
        ) : (
          <p className="text-muted-sm">{org.legalContact ?? "Not set. An owner can add it."}</p>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Jurisdiction rule profiles</h2>
        <p className="text-muted-sm">
          A job publishes only under an approved, current, unexpired profile. Anything else blocks publishing with the reason.
        </p>
        <ul className="list-card">
          {jurisdictions.map((j) => {
            const problems = jurisdictionProblems(j, now);
            const rules = (j.rules ?? {}) as Record<string, unknown>;
            const allowed = Array.isArray(rules.compensationAllowed) ? (rules.compensationAllowed as string[]) : [];
            return (
              <li key={j.id} className="space-y-2 px-4 py-4">
                <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                  {jurisdictionLabel(j)}
                  <span className={problems.length ? "badge-butter" : "badge-mint"}>{problems.length ? "Can't publish" : "Usable"}</span>
                </p>
                <p className="text-muted-sm">
                  Pay methods:{" "}
                  {allowed.length
                    ? allowed.map((m) => COMPENSATION_METHODS.find((c) => c.value === m)?.label ?? m).join(", ")
                    : "none on file"}
                  {j.approvalExpiresAt && ` · Approval expires ${day(j.approvalExpiresAt)}`}
                </p>
                {problems.length > 0 && (
                  <ul className="text-warning-msg list-disc space-y-0.5 pl-5">
                    {problems.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
