/**
 * Engagement rules: apply, invite, claim, accept. Pure — no database access.
 *
 * - Workers apply or claim; organizations invite. Organizations accept
 *   applications; workers accept invitations.
 * - Headcount is enforced on every path that creates an accepted engagement.
 * - Each hiring decision freezes a snapshot of exactly what the organization
 *   could see: the scorecard groups the worker shared with it (C2) and the
 *   worker-authorized fit signals, with the consent and sharing versions and
 *   the time (spec p.8, p.17). It is never recomputed; if the worker narrows
 *   sharing later, live views change and the snapshot stays as the record.
 */
import type { EmployerFitView } from "@/lib/political-fit";
import type { MetricExplanation } from "@/lib/scorecard";
import type { SharedScorecard } from "@/lib/shared-scorecard";
import type { ShareGroup } from "@/lib/sharing";
import type { HiringMode } from "@/lib/jobs";

export type EngagementStatus = "APPLIED" | "INVITED" | "CLAIMED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type EngagementAction = "apply" | "invite" | "claim" | "accept";

/** Statuses that hold a seat against headcount. */
export const ACCEPTED_STATUSES: EngagementStatus[] = ["CLAIMED", "ACTIVE", "COMPLETED"];

/**
 * Engagements the worker started or agreed to — the "relationship" that
 * lets an org see answers shared with "organizations you apply to or accept
 * an invitation from". An invitation alone is the org's act, not the
 * worker's, so it never counts; nor does a cancelled engagement.
 */
export const RELATIONSHIP_STATUSES: EngagementStatus[] = ["APPLIED", "CLAIMED", "ACTIVE", "COMPLETED"];

export interface TransitionContext {
  jobStatus: "DRAFT" | "PUBLISHED" | "PAUSED" | "CLOSED";
  hiringModes: HiringMode[];
  headcount: number | null;
  acceptedCount: number;
}

export type TransitionResult = { ok: true; status: EngagementStatus } | { ok: false; reason: string };

export function transition(
  current: EngagementStatus | null,
  action: EngagementAction,
  actor: "worker" | "org",
  ctx: TransitionContext
): TransitionResult {
  const no = (reason: string): TransitionResult => ({ ok: false, reason });
  const full = ctx.headcount !== null && ctx.acceptedCount >= ctx.headcount;

  if (action !== "accept" && current !== null) {
    return no(current === "INVITED" && actor === "worker"
      ? "You've already been invited to this job — accept the invitation instead."
      : "There's already an engagement for this worker on this job.");
  }
  if (action !== "accept" && ctx.jobStatus !== "PUBLISHED") return no("This job isn't open.");

  switch (action) {
    case "apply":
      if (actor !== "worker") return no("Only the worker can apply.");
      if (!ctx.hiringModes.includes("application")) return no("This job isn't taking applications.");
      return { ok: true, status: "APPLIED" };
    case "invite":
      if (actor !== "org") return no("Only the organization can invite.");
      if (!ctx.hiringModes.includes("invite")) return no("This job isn't hiring by invitation.");
      return { ok: true, status: "INVITED" };
    case "claim":
      if (actor !== "worker") return no("Only the worker can claim a spot.");
      if (!ctx.hiringModes.includes("instant_claim")) return no("This job doesn't allow instant claims.");
      if (full) return no("Every spot on this job is taken.");
      return { ok: true, status: "CLAIMED" };
    case "accept":
      if (ctx.jobStatus === "CLOSED") return no("This job is closed.");
      if (current === "APPLIED" && actor === "org") return full ? no("Every spot on this job is taken.") : { ok: true, status: "ACTIVE" };
      if (current === "INVITED" && actor === "worker") return full ? no("Every spot on this job is taken.") : { ok: true, status: "ACTIVE" };
      if (current === "APPLIED") return no("The organization accepts applications.");
      if (current === "INVITED") return no("The worker accepts invitations.");
      return no("There's nothing to accept.");
  }
}

type FrozenMetric = { value: number | null; numerator: number; denominator: number };

export interface HiringSnapshot {
  kind: "application" | "invitation" | "claim";
  capturedAt: string;
  /** Consent version whose answers were (or weren't) shared; null = none on file. */
  consentVersion: number | null;
  /** Exactly what the organization saw of political fit — authorized signals only. */
  fit: EmployerFitView;
  scorecard: {
    /**
     * Which scorecard groups the worker shared with this organization at
     * that moment (C2). Absent on snapshots taken before C2, which hold the
     * whole scorecard as organizations saw it then.
     */
    shared?: Record<ShareGroup, boolean>;
    /** The worker's sharing version then; null = the defaults. Absent before C2. */
    sharingVersion?: number | null;
    segments: Array<{
      workType: string;
      /** null = hours and history weren't shared. */
      shiftsCount: number | null;
      activeHours: number | null;
      /** Only the averages whose group was shared; a withheld one is null. */
      averages: Record<string, FrozenMetric | null>;
    }>;
    /** null = reliability wasn't shared. */
    showRate: FrozenMetric | null;
    lastUpdated: string | null;
  };
}

/** Freezes the shared view of the scorecard: whatever wasn't shared is never stored. */
export function buildSnapshot(args: {
  kind: HiringSnapshot["kind"];
  scorecard: SharedScorecard;
  sharingVersion: number | null;
  fit: EmployerFitView;
  consentVersion: number | null;
  now: Date;
}): HiringSnapshot {
  const pick = (m: MetricExplanation | null): FrozenMetric | null =>
    m && { value: m.value, numerator: m.numerator, denominator: m.denominator };
  return {
    kind: args.kind,
    capturedAt: args.now.toISOString(),
    consentVersion: args.consentVersion,
    fit: args.fit,
    scorecard: {
      shared: args.scorecard.shared,
      sharingVersion: args.sharingVersion,
      segments: args.scorecard.segments.map((s) => ({
        workType: s.workType,
        shiftsCount: s.history?.shiftsCount ?? null,
        activeHours: s.history?.activeHours ?? null,
        averages: Object.fromEntries(Object.entries(s.averages).map(([k, m]) => [k, pick(m)])),
      })),
      showRate: pick(args.scorecard.showRate),
      lastUpdated: args.scorecard.lastUpdated,
    },
  };
}
