"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/jobs/actions";
import { requireWorker } from "@/lib/worker-session";
import { UUID_RE } from "@/lib/jobs";
import { setFollow, setLike } from "@/lib/campaign-follow-data";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Every page that shows a follow state or the feed: the campaign's own page, the feed, Today, and job pages. */
function refreshFollow() {
  revalidatePath("/feed");
  revalidatePath("/dashboard");
  revalidatePath("/jobs/[jobId]", "page");
  revalidatePath("/c/[handle]", "page");
}

/** Follow, unfollow, or change the notice setting for a campaign (workers only). */
export async function followCampaign(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { workerId } = await requireWorker();
  const campaignId = str(fd, "campaignId");
  if (!UUID_RE.test(campaignId)) return { ok: false, message: "That campaign doesn't exist." };
  const follow = str(fd, "follow") === "1";
  const notify = fd.has("notify") ? str(fd, "notify") === "1" : undefined;
  const r = await setFollow(workerId, campaignId, { follow, notify });
  if (!r.ok) return { ok: false, message: r.reason };
  refreshFollow();
  return { ok: true, message: "" };
}

/** Like or unlike a post (workers only; private to the worker). */
export async function likePost(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { workerId } = await requireWorker();
  const postId = str(fd, "postId");
  if (!UUID_RE.test(postId)) return { ok: false, message: "That post doesn't exist." };
  const r = await setLike(workerId, postId, str(fd, "liked") === "1");
  if (!r.ok) return { ok: false, message: r.reason };
  revalidatePath("/feed");
  revalidatePath("/c/[handle]", "page");
  revalidatePath("/c/[handle]/p/[postId]", "page");
  return { ok: true, message: "" };
}
