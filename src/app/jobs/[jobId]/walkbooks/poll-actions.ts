"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/employer-session";
import { formToObject } from "@/lib/jobs";
import { addPollQuestion, changePollQuestion, staffRecordPollAnswers } from "@/lib/poll-data";
import { orTryAgain, TRY_AGAIN } from "@/lib/try-again";

export interface PollFormState {
  ok: boolean;
  message: string;
  errors: Record<string, string>;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Setting up a poll is editing the job: owners and recruiters, or a custom role granted job editing. */
export async function addQuestionAction(_prev: PollFormState, fd: FormData): Promise<PollFormState> {
  const s = await requireArea("jobsEdit");
  const r = await orTryAgain("poll question add", () => addPollQuestion({ profileId: s.userId, orgId: s.orgId }, str(fd, "jobId"), formToObject(fd)));
  if (!r) return { ok: false, message: TRY_AGAIN, errors: {} };
  if (!r.ok) return { ok: false, message: r.reason, errors: r.errors ?? {} };
  revalidatePath(`/jobs/${r.jobId}/walkbooks`, "layout");
  return { ok: true, message: "Question added. Workers see it on their Done doors.", errors: {} };
}

export async function changeQuestionAction(_prev: PollFormState, fd: FormData): Promise<PollFormState> {
  const s = await requireArea("jobsEdit");
  const r = await orTryAgain("poll question change", () => changePollQuestion({ profileId: s.userId, orgId: s.orgId }, str(fd, "questionId"), formToObject(fd)));
  if (!r) return { ok: false, message: TRY_AGAIN, errors: {} };
  if (!r.ok) return { ok: false, message: r.reason, errors: r.errors ?? {} };
  revalidatePath(`/jobs/${r.jobId}/walkbooks`, "layout");
  revalidatePath("/walkbooks");
  return { ok: true, message: "Question changed. The earlier wording and its answers are kept.", errors: {} };
}

/** Reading and editing poll answers is for full access to the field area; a staff edit is its own row in the history. */
export async function staffPollAction(_prev: PollFormState, fd: FormData): Promise<PollFormState> {
  const s = await requireArea("field");
  const r = await orTryAgain("staff poll answer", () => staffRecordPollAnswers({ profileId: s.userId, orgId: s.orgId }, str(fd, "stopId"), formToObject(fd)));
  if (!r) return { ok: false, message: TRY_AGAIN, errors: {} };
  if (!r.ok) return { ok: false, message: r.reason, errors: r.errors ?? {} };
  revalidatePath(`/jobs/${r.jobId}/walkbooks`, "layout");
  return { ok: true, message: r.saved === 0 ? "Nothing changed." : "Saved. The earlier answer stays in the history.", errors: {} };
}
