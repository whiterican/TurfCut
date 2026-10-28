import { db } from "@/lib/db";
import { canUse } from "@/lib/access";
import type { SessionProfile } from "@/lib/auth";
import { readDisclosure, UUID_RE } from "@/lib/jobs";
import { expiryToday } from "@/lib/credentials";
import type { HiringSnapshot } from "@/lib/engagements";
import { loadPipelineFacts } from "@/lib/engagements-data";
import { applicantJob, fitCampaignAllowed, freeCell } from "@/lib/applicants";
import { loadOrgProfile, type OrgProfileView } from "@/lib/org-profile-data";
import { workerAccessFor } from "@/lib/worker-access-data";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { loadAvailability } from "@/lib/availability-data";
import { loadOrgCredentials } from "@/lib/credentials-data";
import { effectivePreference, employerFitView } from "@/lib/political-fit";

/**
 * Where an applicant is read for display (redesign §4.3): the full page, or
 * the inspector beside a list. The inspector never carries political fit,
 * not even whether answers exist: it doesn't read them, and the profile and
 * the hiring snapshot come back built from an allow-list of non-political
 * parts (the snapshot's consentVersion would say whether the worker
 * answered, so it stays out too). The answers stay on the full page, where
 * the worker's sharing rules already govern them.
 */
export type ApplicantViewKind = "page" | "inspector";

const ENGAGEMENT_SELECT = {
  id: true, status: true, createdAt: true, applicationSnapshot: true, inviteExpiresAt: true,
  worker: { select: { id: true, displayName: true, closedAt: true } },
  job: { select: { id: true, title: true, status: true, type: true, startsAt: true, endsAt: true, requirements: true, campaignDisclosure: true, org: { select: { approved: true } }, jurisdiction: { select: { state: true, rules: true } } } },
} as const;

type Viewer = Pick<SessionProfile, "role" | "grants" | "orgId" | "userId" | "workerId" | "staff">;
type Base = Awaited<ReturnType<typeof load>>;

/** The non-political parts an inspector may show. Anything added to the views stays out until it's listed here. */
const INSPECTOR_PROFILE = ["displayName", "scorecard", "availability", "credentials", "today", "experience"] as const;
const INSPECTOR_SNAPSHOT = ["kind", "capturedAt", "scorecard"] as const;

export type ApplicantPage = NonNullable<Base>;
export type ApplicantInspector = Omit<ApplicantPage, "profile" | "snapshot"> & {
  profile: Pick<OrgProfileView, (typeof INSPECTOR_PROFILE)[number]> | null;
  snapshot: Pick<HiringSnapshot, (typeof INSPECTOR_SNAPSHOT)[number]> | null;
};

function pick<T extends object, K extends keyof T>(v: T, keys: readonly K[]): Pick<T, K> {
  return Object.fromEntries(keys.filter((k) => k in v).map((k) => [k, v[k]])) as Pick<T, K>;
}

/**
 * One applicant in the context of one job, for an organization member, or
 * null when they may not see it: no hiring access, not their
 * organization's job, a malformed id, or no such engagement. The access
 * check lives here, so every view that shows an applicant runs the same one.
 */
export async function applicantForViewer(viewer: Viewer, ref: { jobId: string; engagementId: string }, opts: { view: "page"; now?: Date }): Promise<ApplicantPage | null>;
export async function applicantForViewer(viewer: Viewer, ref: { jobId: string; engagementId: string }, opts: { view: "inspector"; now?: Date }): Promise<ApplicantInspector | null>;
export async function applicantForViewer(viewer: Viewer, ref: { jobId: string; engagementId: string }, opts: { view: ApplicantViewKind; now?: Date }): Promise<ApplicantPage | ApplicantInspector | null> {
  const r = await load(viewer, ref, opts.view, opts.now ?? new Date());
  if (!r || opts.view === "page") return r;
  const { profile, snapshot, ...rest } = r;
  return { ...rest, profile: profile && pick(profile, INSPECTOR_PROFILE), snapshot: snapshot && pick(snapshot, INSPECTOR_SNAPSHOT) };
}

/** The inspector's own entry point: inspector code calls this, never the page view (a test holds every inspector file to it). */
export const applicantForInspector = (viewer: Viewer, ref: { jobId: string; engagementId: string }, now?: Date) => applicantForViewer(viewer, ref, { view: "inspector", now });

async function load(viewer: Viewer, ref: { jobId: string; engagementId: string }, view: ApplicantViewKind, now: Date) {
  const orgId = viewer.orgId;
  if (!orgId || !canUse(viewer, "hiring")) return null;
  if (!UUID_RE.test(ref.jobId) || !UUID_RE.test(ref.engagementId)) return null;
  const e = await db().engagement.findFirst({ where: { id: ref.engagementId, jobId: ref.jobId, job: { orgId } }, select: ENGAGEMENT_SELECT });
  if (!e) return null;
  const job = e.job;
  const facts = (await loadPipelineFacts([e.id])).get(e.id) ?? { events: [], inReview: false, offerExpiresAt: null };
  const access = e.worker.closedAt ? null : await workerAccessFor({ ...viewer, orgId }, e.worker.id, job.org.approved);
  const open = access?.kind === "employer";
  const withFit = view === "page";
  const appJob = applicantJob(job);
  const [profile, latest, avail, creds] = open
    ? await Promise.all([
        loadOrgProfile(e.worker.id, orgId, now, { fit: withFit }),
        withFit ? loadLatestPreference(e.worker.id) : null,
        loadAvailability(e.worker.id),
        loadOrgCredentials(e.worker.id, orgId),
      ])
    : [null, null, null, null];
  // Issue overlap needs a campaign: on this page it's this job's.
  const shown = profile && {
    ...profile,
    fit: employerFitView(effectivePreference(latest, now), {
      orgHasRelationship: open && job.org.approved,
      campaign: fitCampaignAllowed(e.status) ? readDisclosure(job.campaignDisclosure) : null,
    }),
  };
  const free = profile && profile.availability !== "withheld" && avail ? freeCell(avail.availability, appJob, expiryToday(now)) : null;
  const { applicationSnapshot, ...engagement } = e;
  return {
    engagement,
    facts,
    access,
    open,
    appJob,
    profile: shown,
    free,
    creds,
    snapshot: (applicationSnapshot as unknown as HiringSnapshot | null) ?? null,
    hired: e.status === "ACTIVE" || e.status === "CLAIMED",
  };
}
