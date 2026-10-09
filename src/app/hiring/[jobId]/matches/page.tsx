import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/employer-session";
import { db } from "@/lib/db";
import { readHiringModes, UUID_RE } from "@/lib/jobs";
import { expiryToday } from "@/lib/credentials";
import { INVITE_DAYS, INVITES_PER_WEEK, NOTE_MAX } from "@/lib/engagements";
import { applicantCells, applicantJob, availableColumns } from "@/lib/applicants";
import { DEFAULT_TRAVEL_MILES, loadMatches, type MatchRow } from "@/lib/matches-data";
import { hiringCounts } from "@/lib/invitations-data";
import type { TableCell } from "@/lib/table";
import { Masthead } from "@/components/staff/Masthead";
import { HiringTabs } from "@/components/staff/HiringTabs";
import { DataTable } from "@/components/staff/DataTable";
import { ActionButton } from "@/components/ActionButton";
import { invite } from "@/app/jobs/actions";

/** Rounded, so a home ZIP can't be worked back out from the distance. */
const distanceText = (m: MatchRow) => {
  const r = m.miles < 5 ? "under 5 mi" : `about ${Math.round(m.miles / 5) * 5} mi`;
  return `${r} · travels ${m.travelSet ? `up to ${m.travelMiles} mi` : `(no distance set, ${DEFAULT_TRAVEL_MILES} mi used)`}`;
};

/**
 * Matches for one job (C3.4): workers who chose to be findable for this
 * kind of work and are within the distance they'd travel, never anyone who
 * already applied or was invited. Each column is one fact with its
 * evidence, from what the worker shares with approved organizations;
 * there's no combined score, and political answers play no part except
 * that a worker's own "do not match" answers keep them off this list.
 */
export default async function MatchesPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) notFound();
  const session = await requireArea("hiring");
  const job = await db().job.findFirst({
    where: { id: jobId, orgId: session.orgId },
    select: { id: true, title: true, status: true, type: true, startsAt: true, endsAt: true, requirements: true, hiringMethod: true, jurisdiction: { select: { state: true, rules: true } } },
  });
  if (!job) notFound();
  const now = new Date();
  const [r, counts] = await Promise.all([loadMatches(job.id, session.orgId, { now }), hiringCounts(job.id, session.orgId)]);
  const facts = applicantJob(job);
  const main = job.type === "PETITION" ? "signaturesPerActiveHour" : "doorsPerActiveHour";
  const cols = availableColumns(facts).filter((c) => ["free", "credentials", main, "showRate", "shifts"].includes(c));
  const rows = r.ok ? r.rows : [];
  const invitable = job.status === "PUBLISHED" && readHiringModes(job.hiringMethod).includes("invite");

  return (
    <main className="page max-w-5xl">
      <Masthead eyebrow="Matches" title={job.title} meta={r.ok ? `${rows.length} ${rows.length === 1 ? "worker" : "workers"} who chose to be found for this work` : ""}>
        <Link href="/hiring" className="btn-ghost btn-sm">← Pipeline</Link>
        <Link href={`/jobs/${job.id}`} className="btn-secondary btn-sm">Job page</Link>
      </Masthead>
      <HiringTabs jobId={job.id} current="matches" counts={{ ...counts, matches: r.ok ? rows.length : undefined }} />
      <p className="text-muted-sm">
        Workers who turned on &ldquo;organizations can find me&rdquo; for {job.type === "PETITION" ? "petition" : "canvass"} work and live within the distance they&apos;d travel to this job&apos;s city. Each column is one fact with its evidence, only what the worker shares with approved organizations. There&apos;s no overall score. Anyone whose own &ldquo;do not match&rdquo; answers rule this job out is never listed, and nothing about those answers is shown.
      </p>

      {!r.ok ? (
        <div className="empty-state">
          <p className="empty-state-title">{r.reason === "not_approved" ? "Matches open once Turfcut approves your organization" : "Add the job's city to see matches"}</p>
          <p className="empty-state-body">{r.reason === "not_approved" ? "Until then, only people who apply are shown." : "Matches are measured from the job's city."}</p>
        </div>
      ) : (
        <>
          <DataTable
            caption={`Matches for ${job.title}`}
            empty="Nobody matches yet. Workers appear here when they choose to be found for this kind of work nearby."
            initialSort={{ key: "distance", dir: "asc" }}
            columns={[
              { key: "who", label: "Worker", sortable: true },
              { key: "distance", label: "Distance", sortable: true },
              ...cols.map((c) => ({ key: c, label: { free: "Free on job dates", credentials: "Required credentials", signaturesPerActiveHour: "Signatures / active hr", doorsPerActiveHour: "Doors / active hr", showRate: "Show rate", shifts: "Verified shifts" }[c as string] ?? c, numeric: c !== "credentials", sortable: true })),
            ]}
            rows={rows.map((m) => {
              const cells: Record<string, TableCell> = applicantCells(m, facts, cols, expiryToday(now), "");
              cells.who = { text: m.name, sort: m.name };
              cells.distance = { text: distanceText(m), sort: Math.round(m.miles) };
              return { id: m.workerId, cells };
            })}
          />

          {rows.length > 0 && (
            <section className="section">
              <h2 className="section-title">Invite a match</h2>
              {!invitable ? (
                <p className="text-muted-sm">This job isn&apos;t published or doesn&apos;t hire by invitation.</p>
              ) : (
                <div className="card space-y-2">
                  <ActionButton action={invite} fields={{ jobId: job.id }} label="Send invitation" pendingLabel="Sending…">
                    <div className="w-full space-y-3">
                      <label className="block space-y-1.5">
                        <span className="label">Worker</span>
                        <select name="workerId" className="field" required>
                          {rows.map((m) => <option key={m.workerId} value={m.workerId}>{m.name}</option>)}
                        </select>
                      </label>
                      <label className="block space-y-1.5">
                        <span className="label">Note to the worker (optional)</span>
                        <textarea name="note" className="field min-h-20" maxLength={NOTE_MAX} />
                        <span className="text-hint block">They read this with the invitation. Keep it about the job.</span>
                      </label>
                    </div>
                  </ActionButton>
                  <p className="text-hint">An invitation lasts {INVITE_DAYS} days; at most {INVITES_PER_WEEK} a week to one worker. You aren&apos;t told whether they open it.</p>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
