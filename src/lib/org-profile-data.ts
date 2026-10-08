import type { ExperienceRecord } from "@prisma/client";
import { db } from "@/lib/db";
import { loadAvailability } from "@/lib/availability-data";
import { loadCredentials } from "@/lib/credentials-data";
import { orgProfileView, type OrgOrPublic, type ProfileSource } from "@/lib/org-profile";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { loadScorecardPeriods } from "@/lib/scorecard-data";
import { loadSharing, orgViewer } from "@/lib/sharing-data";

/** What orgProfileView draws from, or null when there's no such worker. */
async function loadProfileSource(workerId: string): Promise<ProfileSource<ExperienceRecord> | null> {
  const [worker, sharing, periods, avail, credentials, experience, preference] = await Promise.all([
    db().worker.findUnique({ where: { id: workerId }, select: { displayName: true } }),
    loadSharing(workerId),
    loadScorecardPeriods(workerId),
    loadAvailability(workerId),
    loadCredentials(workerId),
    db().experienceRecord.findMany({ where: { workerId }, orderBy: { startDate: "desc" } }),
    loadLatestPreference(workerId),
  ]);
  if (!worker) return null;
  return { displayName: worker.displayName, sharing: sharing.choices, periods, availability: avail.availability, credentials, experience, preference };
}

export type OrgProfileView = ReturnType<typeof orgProfileView<ExperienceRecord>>;

/**
 * The worker's profile as one organization's staff see it right now, or
 * null for a missing or closed account. Call it only after workerAccessFor
 * let this organization open the profile.
 */
export async function loadOrgProfile(workerId: string, orgId: string, now = new Date()): Promise<OrgProfileView | null> {
  const [src, viewer] = await Promise.all([loadProfileSource(workerId), orgViewer(workerId, orgId)]);
  if (!src || viewer.kind !== "org") return null;
  return orgProfileView(src, viewer, now);
}

/** The same view for a viewer the worker picks on the preview (C2.6). */
export async function previewOrgProfile(workerId: string, viewer: OrgOrPublic, now = new Date()): Promise<OrgProfileView | null> {
  const src = await loadProfileSource(workerId);
  return src && orgProfileView(src, viewer, now);
}
