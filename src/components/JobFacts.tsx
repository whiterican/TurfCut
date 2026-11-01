import { CalendarDays, MapPin, Scale, ShieldCheck, Users, Wallet } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { day } from "@/components/DateRangeChip";
import { readLaunch } from "@/lib/job-launch";
import { jobCardAnswers, jurisdictionLabel, jurisdictionProblems, readHiringModes, type CompensationMethod, type JobType } from "@/lib/jobs";
import type { JobStatus, JurisdictionProfile } from "@prisma/client";

/**
 * The facts a worker decides on, at the top of a job page (D2): when, where
 * and how each day starts, how many spots are filled, what counts as
 * payable, the credentials needed, and the rules the job runs under. Each is
 * a real field on the job; nothing here is estimated. The full job card
 * below repeats them with the rest (contacts, cancellation, tools).
 */
export function JobFacts({
  job,
  acceptedCount,
  compact = false,
}: {
  job: {
    type: JobType;
    status: JobStatus;
    hiringMethod: unknown;
    compensationMethod: CompensationMethod;
    payRateCents: number | null;
    requirements: unknown;
    supportContacts: unknown;
    startsAt: Date | null;
    endsAt: Date | null;
    headcount: number | null;
    geography: unknown;
    launch: unknown;
    org: { name: string };
    jurisdiction: JurisdictionProfile;
  };
  acceptedCount: number;
  /** The concept's job page (#111, screen 3): one line per fact, no card, the detail lines left to the full card below. */
  compact?: boolean;
}) {
  const a = jobCardAnswers({ ...job, orgName: job.org.name, jurisdictionRules: job.jurisdiction.rules });
  const launch = readLaunch(job.launch);
  const geo = (job.geography ?? {}) as { city?: string; state?: string };
  const place = [geo.city, geo.state].filter(Boolean).join(", ");
  const rulesOk = jurisdictionProblems(job.jurisdiction).length === 0;
  const canClaim = readHiringModes(job.hiringMethod).includes("instant_claim");
  if (compact) {
    const spots = job.headcount ? `${acceptedCount} of ${job.headcount} spots filled` : `${acceptedCount} hired so far`;
    return (
      <ul role="list" className="fact-list-compact" aria-label="Key facts">
        <CompactFact icon={CalendarDays}>{job.startsAt || job.endsAt ? `${day(job.startsAt)} – ${day(job.endsAt)}` : "Dates to be set"}</CompactFact>
        <CompactFact icon={MapPin}>{place || "Place to be set"}{launch.mode === "SELF" ? " · self-launch" : " · staged"}</CompactFact>
        <CompactFact icon={Users}>{spots}</CompactFact>
        <CompactFact icon={Wallet}>{a.payable}</CompactFact>
        <CompactFact icon={ShieldCheck}>{a.credentials.join(" · ")}</CompactFact>
        <CompactFact icon={Scale}>{`Rules: ${jurisdictionLabel(job.jurisdiction)}`}{rulesOk ? "" : " (not current)"}</CompactFact>
      </ul>
    );
  }
  return (
    <ul role="list" className="card fact-list" aria-label="Key facts">
      <Fact icon={CalendarDays} title={job.startsAt || job.endsAt ? `${day(job.startsAt)} – ${day(job.endsAt)}` : "Dates to be set"}>
        Shifts are scheduled inside these dates.
      </Fact>
      <Fact icon={MapPin} title={place || "Place to be set"}>
        {launch.mode === "SELF"
          ? "Self-launch: you start from wherever you are."
          : launch.points.length
            ? "Staged: each shift sets the staging point you report to."
            : "Staged: you report to a staging point set for each shift."}
      </Fact>
      <Fact icon={Users} title={job.headcount ? `${acceptedCount} of ${job.headcount} spots filled` : `${acceptedCount} hired so far`}>
        {job.headcount && acceptedCount >= job.headcount
          ? "Every spot is filled."
          : canClaim
            ? "A spot goes to each person hired or who claims one."
            : "A spot goes to each person hired."}
      </Fact>
      <Fact icon={Wallet} title="What counts as payable">
        {a.payable}
      </Fact>
      <Fact icon={ShieldCheck} title="Credentials needed">
        {a.credentials.join(" · ")}
      </Fact>
      <Fact icon={Scale} title={`Rules: ${jurisdictionLabel(job.jurisdiction)}`}>
        {rulesOk
          ? "A current, approved rule profile for this place."
          : job.status === "DRAFT"
            ? "This place's rules must be current and approved before the job can publish."
            : "This place's rules aren't current, so no new shifts or open seats can be added until they are."}
      </Fact>
    </ul>
  );
}

function CompactFact({ icon: Icon, children }: { icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; children: ReactNode }) {
  return (
    <li className="fact-compact">
      <Icon aria-hidden className="size-5 shrink-0 text-muted" />
      <span className="min-w-0 text-fg">{children}</span>
    </li>
  );
}

function Fact({ icon: Icon, title, children }: { icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; title: string; children: ReactNode }) {
  return (
    <li className="fact">
      <Icon aria-hidden className="fact-icon" />
      <span className="min-w-0">
        <span className="block font-semibold text-fg">{title}</span>
        <span className="block text-sm text-muted">{children}</span>
      </span>
    </li>
  );
}
