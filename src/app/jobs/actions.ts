"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireEmployer } from "@/lib/employer-session";
import { requireWorker } from "@/lib/worker-session";
import { formToObject, jurisdictionStateProblem, validateJob } from "@/lib/jobs";
import { createJob, publishJob, updateDraftJob } from "@/lib/jobs-data";
import { acceptEngagement, applyToJob, claimJob, inviteWorker } from "@/lib/engagements-data";

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

export async function publish(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { orgId, userId } = await requireEmployer();
  if (!orgId) return { ok: false, message: "No organization on this account." };
  const jobId = String(formData.get("jobId") ?? "");
  const r = await publishJob(jobId, orgId, userId);
  revalidatePath(`/jobs/${jobId}`);
  return r.ok ? { ok: true, message: "Published." } : { ok: false, message: r.reasons.join(" ") };
}

const done = (jobId: string, r: { ok: true; status: string } | { ok: false; reason: string }, okMessage: string): ActionState => {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/desk");
  revalidatePath("/hiring", "layout");
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

export async function acceptInvitation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const jobId = String(formData.get("jobId") ?? "");
  const r = await acceptEngagement(String(formData.get("engagementId") ?? ""), { kind: "worker", profileId: userId, workerId });
  return done(jobId, r, "Accepted. You're on this job.");
}

export async function acceptApplication(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { orgId, userId } = await requireEmployer();
  if (!orgId) return { ok: false, message: "No organization on this account." };
  const jobId = String(formData.get("jobId") ?? "");
  const r = await acceptEngagement(String(formData.get("engagementId") ?? ""), { kind: "org", profileId: userId, orgId });
  return done(jobId, r, "Accepted.");
}

export async function invite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { orgId, userId, orgApproved } = await requireEmployer();
  if (!orgId || !orgApproved) return { ok: false, message: "Your organization is awaiting approval." };
  const jobId = String(formData.get("jobId") ?? "");
  const workerId = String(formData.get("workerId") ?? "");
  const r = await inviteWorker(orgId, userId, jobId, workerId);
  revalidatePath(`/workers/${workerId}`);
  return done(jobId, r, "Invitation sent.");
}
