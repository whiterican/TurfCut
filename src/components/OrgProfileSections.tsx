import type { ReactNode } from "react";
import type { OrgProfileView } from "@/lib/org-profile-data";
import { FIT_FIELDS } from "@/lib/political-fit";
import { plural } from "@/lib/format";
import { profileScorecardSummary } from "@/lib/profile-summary";
import { ScorecardPanel } from "@/components/ScorecardPanel";
import { AvailabilityStatement } from "@/components/AvailabilityStatement";
import { CredentialList } from "@/components/CredentialList";
import { ExperienceList } from "@/components/ExperienceList";
import { FitSignals } from "@/components/FitSignals";
import { NotSharedChip } from "@/components/staff/NotSharedChip";
import { ChevronDown } from "lucide-react";
import styles from "./HiringPeople.module.css";

function Part({ name, summary, children }: { name: string; summary: ReactNode; children?: ReactNode }) {
  const row = <><span className={styles.name}>{name}</span><div className={styles.value}>{summary}</div></>;
  return children ? (
    <details className={styles.part}>
      <summary className={styles.row}>{row}<ChevronDown aria-hidden className={styles.arrow} /></summary>
      <div className={styles.detail}>{children}</div>
    </details>
  ) : <div className={styles.part}><div className={styles.row}>{row}</div></div>;
}

/** One consent-filtered view for organization pages and the worker's own preview. */
export function OrgProfileSections({ view }: { view: OrgProfileView }) {
  const scorecard = profileScorecardSummary(view.scorecard.lifetime);
  const availability = view.availability;
  const hasAvailability = availability !== "withheld" && !!availability && !!(availability.usual || availability.dates.length || availability.note);
  const sharedFit = FIT_FIELDS.filter(f => view.fit.fields[f.key].shared).length;
  return (
    <section className="section">
      <h2 className="section-title">What they share with you now</h2>
      <div className={`card ${styles.rows}`}>
        <Part name="Scorecard" summary={scorecard ?? <NotSharedChip what="scorecard" />}>
          {scorecard !== null && <ScorecardPanel periods={view.scorecard} />}
        </Part>
        <Part name="Availability" summary={availability === "withheld" ? <NotSharedChip what="availability" />
          : hasAvailability ? availability?.usual || availability?.dates[0] || availability?.note
            : "No availability set yet."}>
          {hasAvailability && <AvailabilityStatement view={availability} />}
        </Part>
        <Part name="Credentials" summary={view.credentials === "withheld" ? <NotSharedChip what="credentials" />
          : view.credentials.length ? plural(view.credentials.length, "credential") : "No credentials added."}>
          {view.credentials !== "withheld" && view.credentials.length > 0 && <CredentialList view={view.credentials} today={view.today} />}
        </Part>
        <Part name="Experience" summary={view.experience === "withheld" ? <NotSharedChip what="experience" />
          : view.experience.length ? plural(view.experience.length, "experience record") : "No experience yet"}>
          {view.experience !== "withheld" && view.experience.length > 0 && <ExperienceList records={view.experience} />}
        </Part>
        <Part name="Political fit" summary={sharedFit ? `${sharedFit} of ${FIT_FIELDS.length} fields shared`
          : <><NotSharedChip what="political fit" /><p className="text-hint mt-1">{view.fit.basis}</p></>}>
          {sharedFit > 0 && <FitSignals view={view.fit} />}
        </Part>
      </div>
      <p className="text-hint">Only what the worker shares with your organization, as of now. &ldquo;Not shared&rdquo; says nothing about them.</p>
    </section>
  );
}
