import { affiliationLabel, jobCardAnswers, readDisclosure, type CompensationMethod, type JobType } from "@/lib/jobs";
import { CAMPAIGN_TYPES, issueLabel } from "@/lib/political-fit";
import { plural } from "@/lib/format";
import { Row } from "@/components/Row";

const day = (d: Date | null) =>
  d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";

/** The five questions every job card answers (spec p.7), plus the campaign's own disclosure. */
export function JobCard({
  job,
}: {
  job: {
    type: JobType;
    compensationMethod: CompensationMethod;
    payRateCents: number | null;
    requirements: unknown;
    supportContacts: unknown;
    campaignDisclosure: unknown;
    measureIds: string[];
    startsAt: Date | null;
    endsAt: Date | null;
    headcount: number | null;
    cancellationNoticeHours: number;
    orgName: string;
    jurisdictionRules: unknown;
  };
}) {
  const a = jobCardAnswers(job);
  const d = readDisclosure(job.campaignDisclosure);
  const issues = Object.entries(d?.issues ?? {});
  return (
    <div className="space-y-4">
      <dl className="list-card">
        <Row label="Who you work for">{a.who}</Row>
        <Row label="What you're paid">{a.paidFor}</Row>
        <Row label="What counts as payable">{a.payable}</Row>
        <Row label="Credentials needed">{a.credentials.join(" · ")}</Row>
        <Row label="Who handles problems">
          {a.contacts ? (
            <>
              <span className="block">Emergencies: {a.contacts.emergency}</span>
              <span className="block">Pay disputes: {a.contacts.disputes}</span>
              <span className="block">Lost materials: {a.contacts.lostMaterials}</span>
            </>
          ) : "Not set"}
        </Row>
        <Row label="Dates">{day(job.startsAt)} – {day(job.endsAt)} · {job.headcount ? plural(job.headcount, "worker") : "—"}</Row>
        <Row label="Cancellation notice">{job.cancellationNoticeHours} hours; later cancellations count as no-shows</Row>
      </dl>

      {d && (
        <div className="card space-y-2">
          <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
            Campaign
            <span className="badge-sky">{CAMPAIGN_TYPES.find((c) => c.value === d.campaignType)?.label ?? d.campaignType}</span>
            <span className="badge-neutral">{affiliationLabel(d.affiliation)}</span>
          </p>
          {(d.campaignName || job.measureIds.length > 0) && (
            <p className="text-muted-sm">{[d.campaignName, ...job.measureIds].filter(Boolean).join(" · ")}</p>
          )}
          <p className="text-fg">{d.message}</p>
          {issues.length > 0 && (
            <p className="text-muted-sm">
              Public positions: {issues.map(([k, side]) => `${side === "support" ? "supports" : "opposes"} ${issueLabel(k).toLowerCase()}`).join("; ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
