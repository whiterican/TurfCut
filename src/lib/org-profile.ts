/**
 * A worker's profile as one organization sees it (C2.6). Pure. The
 * organization's worker page and the worker's own preview both build the
 * page here and draw it with <OrgProfileSections>, so the preview can't
 * drift from the real view.
 *
 * - Scorecard, availability and credentials: only the parts the worker
 *   shares with this viewer (visibleParts). A withheld part is "not shared",
 *   never a zero.
 * - Experience: to any organization that can open the profile. References
 *   are third-party contact details, so it learns only that one exists.
 * - Political fit: employerFitView, so only what the worker authorized, and
 *   expired or outdated consent authorizes nothing.
 * - A closed account reads as the public (orgViewer): nothing is shown.
 */
import { orgAvailabilityView, type Availability } from "@/lib/availability";
import { expiryToday, orgCredentialView, type CredentialRow } from "@/lib/credentials";
import { effectivePreference, employerFitView } from "@/lib/political-fit";
import type { Period, Scorecard } from "@/lib/scorecard";
import { shareScorecardPeriodsForOrg } from "@/lib/shared-scorecard";
import { visibleParts, type SharingChoices, type Viewer } from "@/lib/sharing";

/** Everything about the worker that the view may draw from. */
export interface ProfileSource<E extends { referenceContact: string | null }> {
  displayName: string;
  sharing: SharingChoices;
  periods: Record<Period, Scorecard>;
  availability: Availability;
  /** The current wallet (currentCredentials). */
  credentials: CredentialRow[];
  experience: E[];
  preference: Parameters<typeof effectivePreference>[0];
}

export type OrgOrPublic = Exclude<Viewer, { kind: "self" }>;

export function orgProfileView<E extends { referenceContact: string | null }>(src: ProfileSource<E>, viewer: OrgOrPublic, now = new Date()) {
  const parts = visibleParts(src.sharing, viewer);
  const org = viewer.kind === "org";
  return {
    displayName: src.displayName,
    scorecard: shareScorecardPeriodsForOrg(src.periods, parts),
    availability: orgAvailabilityView(src.availability, parts.availability, now.toISOString().slice(0, 10)),
    credentials: orgCredentialView(src.credentials, parts.credentials),
    /** "Today" for credential expiry (expiryToday). */
    today: expiryToday(now),
    experience: org ? src.experience.map(({ referenceContact, ...r }) => ({ ...r, hasReference: referenceContact !== null })) : [],
    // Issue overlap is per campaign, so this job-independent view never shows
    // it; it appears on each applicant's hiring snapshot. The full
    // questionnaire is never shown.
    fit: employerFitView(effectivePreference(src.preference, now), { orgHasRelationship: org && viewer.relationship, campaign: null }),
  };
}
