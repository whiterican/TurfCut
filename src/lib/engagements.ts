/**
 * Engagement rules: apply, invite, claim, review, offer, accept, decline,
 * withdraw. Pure — no database access.
 *
 * - Workers apply or claim; organizations invite.
 * - Hiring from an application (C3): the organization may mark it in review,
 *   then sends an offer; only the worker's accept starts the engagement. An
 *   offer lapses after OFFER_HOURS. Workers accept invitations directly.
 * - An organization can decline an application or offer (not selected, with
 *   a reason code) and withdraw an unanswered invitation; a worker can
 *   decline an invitation or offer and withdraw until they're hired.
 * - Headcount is enforced on every path that creates an accepted engagement.
 * - Each hiring decision freezes a snapshot of exactly what the organization
 *   could see: the scorecard groups the worker shared with it (C2) and the
 *   worker-authorized fit signals, with the consent and sharing versions and
 *   the time (spec p.8, p.17). It is never recomputed; if the worker narrows
 *   sharing later, live views change and the snapshot stays as the record.
 */
import type { EmployerFitView } from "@/lib/political-fit";
import type { SharedMetric, SharedScorecard } from "@/lib/shared-scorecard";
import type { ShareGroup } from "@/lib/sharing";
import type { HiringMode } from "@/lib/jobs";

export type EngagementStatus =
  | "APPLIED"
  | "INVITED"
  | "CLAIMED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "OFFERED"
  | "DECLINED"
  | "WITHDRAWN";
export type EngagementAction = "apply" | "invite" | "claim" | "accept" | "review" | "offer" | "decline" | "withdraw";

/** How long a worker has to accept an offer (C3 decision). */
export const OFFER_HOURS = 48;

export const offerExpiresAt = (offeredAt: Date) => new Date(offeredAt.getTime() + OFFER_HOURS * 3_600_000);

/**
 * Whether an OFFERED engagement's offer has lapsed. One rule everywhere: an
 * offer with no recorded OFFERED event (hand-edited or legacy data) counts
 * as lapsed, so it holds no seat, can't be accepted and can be sent again.
 */
export const offerLapsed = (status: EngagementStatus, expiresAt: Date | null, now: Date) =>
  status === "OFFERED" && (!expiresAt || expiresAt <= now);

/**
 * Why an organization didn't select someone (C3 decision Q5: structured
 * reasons, never free-text notes about a worker). The worker sees the label,
 * plus any note the organization writes to them. Worded for both sides: the
 * organization reads the same history.
 */
export const NOT_SELECTED_REASONS = [
  { value: "positions_filled", label: "The spots are filled" },
  { value: "schedule", label: "Availability doesn't fit the job's dates" },
  { value: "credentials", label: "The job needs a credential that isn't on the profile" },
  { value: "area", label: "The job is outside the travel area" },
  { value: "other", label: "Another reason" },
] as const;
export type NotSelectedReason = (typeof NOT_SELECTED_REASONS)[number]["value"];
export const NOTE_MAX = 500;
/** The note on the history lines an account closure writes: Turfcut's, not a person's. */
export const ACCOUNT_CLOSED_NOTE = "Account closed.";

/**
 * A note to the worker: trimmed, runs of spaces folded, at most one blank
 * line in a row (line breaks are kept; the history shows them).
 */
export function cleanNote(raw: string | undefined): string | null {
  const text = (raw ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

/** Statuses that hold a seat against headcount. */
export const ACCEPTED_STATUSES: EngagementStatus[] = ["CLAIMED", "ACTIVE", "COMPLETED"];

/**
 * Engagements the worker started or agreed to — the "relationship" that
 * lets an org see answers shared with "organizations you apply to or accept
 * an invitation from". An invitation alone is the org's act, not the
 * worker's, so it never counts; nor does a cancelled engagement.
 */
export const RELATIONSHIP_STATUSES: EngagementStatus[] = ["APPLIED", "OFFERED", "CLAIMED", "ACTIVE", "COMPLETED"];

/** Waiting on someone: an application, an invitation or an offer. */
export const OPEN_STATUSES: EngagementStatus[] = ["APPLIED", "INVITED", "OFFERED"];

export interface TransitionContext {
  jobStatus: "DRAFT" | "PUBLISHED" | "PAUSED" | "CLOSED";
  hiringModes: HiringMode[];
  headcount: number | null;
  acceptedCount: number;
  /** The application is already marked in review. */
  inReview?: boolean;
  /** The pending offer's deadline has passed. */
  offerExpired?: boolean;
  /**
   * Other offers on this job still inside their window. An offer holds a
   * seat until it lapses, so claims, invitations and new offers can't take
   * it out from under the worker it was offered to.
   */
  liveOffers?: number;
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
  // Seats hired or held by someone else's offer.
  const held = ctx.headcount !== null && ctx.acceptedCount + (ctx.liveOffers ?? 0) >= ctx.headcount;
  const heldReason = "Every open spot has an offer out right now. Check back in a couple of days.";

  const opens = action === "apply" || action === "invite" || action === "claim";
  if (opens && current !== null) {
    return no(current === "INVITED" && actor === "worker"
      ? "You've already been invited to this job — accept the invitation instead."
      : "There's already an engagement for this worker on this job.");
  }
  if (opens && ctx.jobStatus !== "PUBLISHED") return no("This job isn't open.");
  if (!opens && current === null) return no("Engagement not found.");

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
      if (held) return no(heldReason);
      return { ok: true, status: "CLAIMED" };
    case "review":
      if (actor !== "org") return no("Only the organization reviews applications.");
      if (current !== "APPLIED") return no("Only an application can be put in review.");
      if (ctx.jobStatus === "CLOSED") return no("This job is closed.");
      if (ctx.inReview) return no("This application is already in review.");
      return { ok: true, status: "APPLIED" };
    case "offer":
      if (actor !== "org") return no("Only the organization sends offers.");
      // A lapsed offer can be sent again: the worker was chosen and only missed the window.
      if (current === "OFFERED" && !ctx.offerExpired) return no("An offer is already waiting on the worker.");
      if (current !== "APPLIED" && current !== "OFFERED") return no("An offer answers an application.");
      if (ctx.jobStatus !== "PUBLISHED" && ctx.jobStatus !== "PAUSED") return no("This job isn't open.");
      if (full) return no("Every spot on this job is taken.");
      if (held) return no("Every open spot already has an offer out. Wait for an answer, or withdraw an offer first.");
      return { ok: true, status: "OFFERED" };
    case "accept":
      if (ctx.jobStatus === "CLOSED") return no("This job is closed.");
      // Before C3 an organization accepted an application directly; now that is an offer.
      if (current === "APPLIED" && actor === "org") return transition(current, "offer", actor, ctx);
      if ((current === "INVITED" || current === "OFFERED") && actor === "worker") {
        if (current === "OFFERED" && ctx.offerExpired) return no("This offer has expired. Ask the organization to send a new one.");
        if (full) return no("Every spot on this job is taken.");
        // The worker's own offer holds their seat; an invitation holds none.
        if (current === "INVITED" && held) return no(heldReason);
        return { ok: true, status: "ACTIVE" };
      }
      if (current === "APPLIED") return no("The organization sends an offer; the worker accepts it.");
      if (current === "INVITED" || current === "OFFERED") return no("Only the worker can accept.");
      return no("There's nothing to accept.");
    case "decline":
      if (actor === "org" && (current === "APPLIED" || current === "OFFERED")) return { ok: true, status: "DECLINED" };
      if (actor === "worker" && (current === "INVITED" || current === "OFFERED")) return { ok: true, status: "DECLINED" };
      if (actor === "worker" && current === "APPLIED") return no("Withdraw your application instead.");
      if (actor === "org" && current === "INVITED") return no("Withdraw the invitation instead.");
      return no("There's nothing to decline.");
    case "withdraw":
      if (actor === "worker" && (current === "APPLIED" || current === "OFFERED")) return { ok: true, status: "WITHDRAWN" };
      if (actor === "org" && current === "INVITED") return { ok: true, status: "WITHDRAWN" };
      if (actor === "worker") return no(current === "INVITED" ? "Decline the invitation instead." : "You can withdraw only before you're hired.");
      return no("Only an unanswered invitation can be withdrawn.");
  }
}

export type EngagementEventType =
  | "APPLIED"
  | "CLAIMED"
  | "INVITED"
  | "INVITE_VIEWED"
  | "INVITE_ACCEPTED"
  | "INVITE_DECLINED"
  | "INVITE_WITHDRAWN"
  | "IN_REVIEW"
  | "OFFERED"
  | "OFFER_ACCEPTED"
  | "OFFER_DECLINED"
  | "NOT_SELECTED"
  | "WITHDRAWN";

/** The history event a successful transition records. */
export function eventFor(action: EngagementAction, actor: "worker" | "org", from: EngagementStatus | null, to: EngagementStatus): EngagementEventType {
  switch (action) {
    case "apply": return "APPLIED";
    case "claim": return "CLAIMED";
    case "invite": return "INVITED";
    case "review": return "IN_REVIEW";
    case "offer": return "OFFERED";
    case "accept": return to === "OFFERED" ? "OFFERED" : from === "OFFERED" ? "OFFER_ACCEPTED" : "INVITE_ACCEPTED";
    case "decline": return actor === "org" ? "NOT_SELECTED" : from === "OFFERED" ? "OFFER_DECLINED" : "INVITE_DECLINED";
    case "withdraw": return actor === "org" ? "INVITE_WITHDRAWN" : "WITHDRAWN";
  }
}

/** Where an engagement stands, in the worker's words. */
export function workerStage(status: EngagementStatus, events: Array<{ type: EngagementEventType }>, offerExpired = false): string {
  const has = (t: EngagementEventType) => events.some((e) => e.type === t);
  switch (status) {
    case "APPLIED": return has("IN_REVIEW") ? "In review" : "Applied";
    case "INVITED": return "Invited";
    case "OFFERED": return offerExpired ? "Offer expired" : "Offer";
    case "CLAIMED": return "Claimed";
    case "ACTIVE": return "Active";
    case "COMPLETED": return "Completed";
    case "CANCELLED": return "Cancelled";
    case "DECLINED": return has("NOT_SELECTED") ? "Not selected" : "Declined";
    case "WITHDRAWN": return has("INVITE_WITHDRAWN") ? "Invitation withdrawn" : "Withdrawn";
  }
}

/** One history line, in the worker's words (the organization sees the same history). */
export const EVENT_LABELS: Record<EngagementEventType, string> = {
  APPLIED: "Applied",
  CLAIMED: "Claimed a spot",
  INVITED: "Invited",
  INVITE_VIEWED: "Invitation seen",
  INVITE_ACCEPTED: "Accepted the invitation",
  INVITE_DECLINED: "Declined the invitation",
  INVITE_WITHDRAWN: "Invitation withdrawn by the organization",
  IN_REVIEW: "In review",
  OFFERED: "Offer sent",
  OFFER_ACCEPTED: "Accepted the offer",
  OFFER_DECLINED: "Declined the offer",
  NOT_SELECTED: "Not selected",
  WITHDRAWN: "Withdrew",
};

/** Counts are null when the worker didn't share hours and history (C2). */
type FrozenMetric = { value: number | null; numerator: number | null; denominator: number | null };

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
  const pick = (m: SharedMetric | null): FrozenMetric | null =>
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
