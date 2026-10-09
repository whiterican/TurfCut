import type { OrgProfileView } from "@/lib/org-profile-data";
import { ScorecardPanel } from "@/components/ScorecardPanel";
import { AvailabilityStatement } from "@/components/AvailabilityStatement";
import { CredentialList } from "@/components/CredentialList";
import { ExperienceList } from "@/components/ExperienceList";
import { FitSignals } from "@/components/FitSignals";
import { NotSharedChip } from "@/components/staff/NotSharedChip";

/**
 * The parts of a worker's profile an organization sees (C2.6): drawn the same
 * way on the organization's worker page and on the worker's own preview.
 */
export function OrgProfileSections({ view }: { view: OrgProfileView }) {
  return (
    <>
      <section className="section">
        <h2 className="section-title">Scorecard</h2>
        <ScorecardPanel periods={view.scorecard} />
      </section>

      <section className="section">
        <h2 className="section-title">Availability</h2>
        <div className="card"><AvailabilityStatement view={view.availability} /></div>
      </section>

      <section className="section">
        <h2 className="section-title">Credentials</h2>
        <div className="card"><CredentialList view={view.credentials} today={view.today} /></div>
      </section>

      <section className="section">
        <h2 className="section-title">Experience</h2>
        {view.experience === "withheld" ? (
          // Experience is part of hours and history, which the worker doesn't share with this viewer.
          <div className="card"><NotSharedChip what="experience" /></div>
        ) : (
          <ExperienceList records={view.experience} />
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Political fit</h2>
        <FitSignals view={view.fit} />
      </section>
    </>
  );
}
