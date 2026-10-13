"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireEmployer } from "@/lib/employer-session";
import { requireWorker } from "@/lib/worker-session";
import { formToObject, jurisdictionStateProblem, validateJob } from "@/lib/jobs";
import { createJob, publishJob, updateDraftJob } from "@/lib/jobs-data";
import { acceptEngagement, applyToJob, claimJob, closeJob, inviteWorker, moveEngagement, moveEngagements } from "@/lib/engagements-data";
import { OFFER_HOURS } from "@/lib/engagements";
import { declineInvitation, muteOrg, unmuteOrg } from "@/lib/invitations-data";

export interface JobFormState {
  message: string;
  errors: Record<string, string>;
}

export interface ActionState {
  ok: boolean;
  message: string;
}

/** Creates a draft, or saves edits to one. Publishing is separate and gated. */
export async function saveJob(_prev: JobFormState, formData: FormData): Promise<JobFormState> {
  const { orgId, userId } = await requireEmployer();
  if (!orgId) return { message: "No organization on this account.", errors: {} };
  const result = validateJob(formToObject(formData));
  if (!result.ok) return { message: "Fix the highlighted fields.", errors: result.errors };
  const jurisdiction = await db().jurisdictionProfile.findUnique({ where: { id: result.value.jurisdictionId }, select: { state: true } });
  if (!jurisdiction) return { message: "Fix the highlighted fields.", errors: { jurisdictionId: "That jurisdiction doesn't exist." } };
  const stateProblem = jurisdictionStateProblem(result.value.state, jurisdiction.state);
  if (stateProblem) return { message: "Fix the highlighted fields.", errors: { jurisdictionId: stateProblem } };

  const jobId = String(formData.get("jobId") ?? "");
  let id = jobId;
  if (jobId) {
    const saved = await updateDraftJob(jobId, orgId, userId, result.value);
    if (!saved) return { message: "Only draft jobs can be edited.", errors: {} };
  } else {
    id = (await createJob(orgId, userId, result.value)).id;
  }
  revalidatePath("/jobs");
  redirect(`/jobs/${id}`);
}

/** Closes a job (C3.5): open applications, offers and invitations end, each worker is told. */
export async function closeJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { orgId, userId } = await requireEmployer();
  if (!orgId) return { ok: false, message: "No organization on this account." };
  const jobId = field(formData, "jobId");
  const r = await closeJob(jobId, { profileId: userId, orgId });
  refresh(jobId);
  if (!r.ok) return { ok: false, message: r.reason };
  return { ok: true, message: r.closed ? `Closed. ${r.closed} open ${r.closed === 1 ? "application, offer or invitation was" : "applications, offers and invitations were"} ended, and each worker was told.` : "Closed." };
}

export async function publish(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { orgId, userId } = await requireEmployer();
  if (!orgId) return { ok: false, message: "No organization on this account." };
  const jobId = String(formData.get("jobId") ?? "");
  const r = await publishJob(jobId, orgId, userId);
  revalidatePath(`/jobs/${jobId}`);
  return r.ok ? { ok: true, message: "Published." } : { ok: false, message: r.reasons.join(" ") };
}

const refresh = (jobId: string) => {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/desk");
  revalidatePath("/hiring", "layout");
};

const done = (jobId: string, r: { ok: true; status: string } | { ok: false; reason: string }, okMessage: string): ActionState => {
  refresh(jobId);
  return r.ok ? { ok: true, message: okMessage } : { ok: false, message: r.reason };
};

export async function apply(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const jobId = String(formData.get("jobId") ?? "");
  return done(jobId, await applyToJob(workerId, userId, jobId), "Applied. The organization will review it.");
}

export async function claim(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const jobId = String(formData.get("jobId") ?? "");
  return done(jobId, await claimJob(workerId, userId, jobId), "Claimed — the spot is yours.");
}

/** The worker accepts an invitation or an offer. */
export async function acceptInvitation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const jobId = String(formData.get("jobId") ?? "");
  const r = await acceptEngagement(String(formData.get("engagementId") ?? ""), { kind: "worker", profileId: userId, workerId });
  return done(jobId, r, "Accepted. You're on this job.");
}

const field = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

/** The worker declines an invitation or an offer. */
export async function declineAsWorker(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const mute = field(formData, "mute") === "1";
  const r = await declineInvitation({ workerId, profileId: userId }, field(formData, "engagementId"), { mute });
  revalidatePath("/jobs/invitations");
  return done(
    field(formData, "jobId"),
    r,
    r.ok && r.muted
      ? "Declined, and muted: this organization can't invite you again until you unmute it."
      : mute
        ? "Declined. The mute didn't go through; you can mute them from Invitations."
        : "Declined. The organization sees that you said no; nothing else."
  );
}

/** Mutes an organization that has invited the worker (C3.3), e.g. from an expired invitation. */
export async function mute(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const r = await muteOrg({ workerId, profileId: userId }, field(formData, "orgId"));
  revalidatePath("/jobs/invitations");
  return r.ok ? { ok: true, message: "Muted. They can't invite you until you unmute them." } : { ok: false, message: r.reason };
}

/** Lifts a mute (C3.3): the organization may invite the worker again. */
export async function unmute(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const r = await unmuteOrg({ workerId, profileId: userId }, field(formData, "orgId"));
  revalidatePath("/jobs/invitations");
  return r.ok ? { ok: true, message: "Unmuted. They can invite you again." } : { ok: false, message: r.reason };
}

/** The worker withdraws an application (or a pending offer) before they're hired. */
export async function withdrawApplication(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const r = await moveEngagement(field(formData, "engagementId"), "withdraw", { kind: "worker", profileId: userId, workerId });
  return done(field(formData, "jobId"), r, "Withdrawn.");
}

async function orgMove(
  formData: FormData,
  action: "review" | "offer" | "decline" | "withdraw",
  okMessage: string
): Promise<ActionState> {
  const { orgId, userId } = await requireEmployer();
  if (!orgId) return { ok: false, message: "No organization on this account." };
  const r = await moveEngagement(field(formData, "engagementId"), action, { kind: "org", profileId: userId, orgId }, {
    reasonCode: field(formData, "reasonCode"),
    note: field(formData, "note"),
  });
  return done(field(formData, "jobId"), r, okMessage);
}

/** An offer answers an application (or replaces a lapsed one); only the worker's accept hires (C3). */
export const offerApplication = async (_prev: ActionState, fd: FormData) => orgMove(fd, "offer", `Offer sent. The worker has ${OFFER_HOURS} hours to accept.`);
export const reviewApplication = async (_prev: ActionState, fd: FormData) => orgMove(fd, "review", "Marked in review. The worker sees \"In review\".");
export const notSelected = async (_prev: ActionState, fd: FormData) => orgMove(fd, "decline", "Done. The worker sees the reason you picked, and your note if you wrote one.");
const BULK_DONE: Record<"review" | "offer" | "decline", (n: string) => string> = {
  review: (n) => `${n} marked in review.`,
  offer: (n) => `Offer sent to ${n}.`,
  decline: (n) => `${n} marked not selected.`,
};

/** One step for several applicants of one job (C3.2); see moveEngagements. */
export async function bulkMove(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { orgId, userId } = await requireEmployer();
  if (!orgId) return { ok: false, message: "No organization on this account." };
  const jobId = field(formData, "jobId");
  const action = field(formData, "bulk");
  if (action !== "review" && action !== "offer" && action !== "decline") return { ok: false, message: "Pick what to do." };
  const r = await moveEngagements(jobId, { profileId: userId, orgId }, action, formData.getAll("engagementId").map(String), {
    reasonCode: field(formData, "reasonCode"),
    note: field(formData, "note"),
  });
  if (!r.ok) return { ok: false, message: r.reason };
  refresh(jobId);
  const why = r.refused.map(({ reason, names }) => `${names.join(", ")}: ${reason}`).join(" ");
  if (!r.moved) return { ok: false, message: why || "Nothing changed." };
  const n = `${r.moved} ${r.moved === 1 ? "applicant" : "applicants"}`;
  return { ok: true, message: `${BULK_DONE[action](n)}${why ? ` Not changed — ${why}` : ""}` };
}

export const withdrawInvitation = async (_prev: ActionState, fd: FormData) => orgMove(fd, "withdraw", "Invitation withdrawn.");

export async function invite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { orgId, userId, orgApproved } = await requireEmployer();
  if (!orgId || !orgApproved) return { ok: false, message: "Your organization is awaiting approval." };
  const jobId = String(formData.get("jobId") ?? "");
  const workerId = String(formData.get("workerId") ?? "");
  const r = await inviteWorker(orgId, userId, jobId, workerId, undefined, { note: field(formData, "note") });
  revalidatePath(`/workers/${workerId}`);
  revalidatePath(`/hiring/${jobId}`, "layout");
  return done(jobId, r, "Invitation sent.");
}
