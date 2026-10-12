"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/app/jobs/actions";
import { requireArea } from "@/lib/employer-session";
import { accessTo } from "@/lib/access";
import { validatePostBody, validateProfile } from "@/lib/campaign-social";
import { validateFact, validateResource } from "@/lib/campaign-kit";
import { addFact, createResource, editFact, editResource, removeFact, removeResource } from "@/lib/campaign-kit-data";
import { clearCampaignImage, createCampaign, createPost, deletePost, editPost, loadOrgCampaign, setJobCampaign, setCampaignImage, setCampaignPublished, setPostPinned, updateCampaign } from "@/lib/campaign-social-data";
import { check, retryAfter, waitText } from "@/lib/rate-limit";
import { supabaseMediaStore, type MediaKind } from "@/lib/campaign-media";

export interface ProfileFormState extends ActionState {
  errors?: Record<string, string>;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
// The profile, its images and publishing belong to owners and publishers (the "campaigns" area).
const editor = async () => {
  const s = await requireArea("campaigns");
  return { profileId: s.userId, orgId: s.orgId };
};
const refresh = async (orgId: string, id: string) => {
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
  revalidatePath("/shifts/[shiftId]", "page"); // the brief carries the talking points and the kit
  const c = await loadOrgCampaign(orgId, id);
  if (c) revalidatePath(`/c/${c.handle}`);
};

/** Creates a campaign (then opens it) or saves edits to one. */
export async function saveCampaign(_prev: ProfileFormState, fd: FormData): Promise<ProfileFormState> {
  const actor = await editor();
  const v = validateProfile({ handle: str(fd, "handle"), displayName: str(fd, "displayName"), bio: str(fd, "bio") });
  if (!v.ok) return { ok: false, message: "Fix the highlighted fields.", errors: v.errors };
  const id = str(fd, "id");
  if (!id) {
    const r = await createCampaign(actor, v.value);
    if (!r.ok) return { ok: false, message: r.reason, errors: r.errors };
    revalidatePath("/campaigns");
    redirect(`/campaigns/${r.id}?created=1`);
  }
  const r = await updateCampaign(actor, id, v.value);
  if (!r.ok) return { ok: false, message: r.reason, errors: r.errors };
  await refresh(actor.orgId, id);
  return { ok: true, message: "Saved." };
}

export async function publishCampaign(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await editor();
  const id = str(fd, "id");
  const publish = str(fd, "publish") === "1";
  const r = await setCampaignPublished(actor, id, publish);
  await refresh(actor.orgId, id);
  return r.ok ? { ok: true, message: publish ? "Published. Anyone with the link can see it." : "Unpublished. Only your organization can see it now." } : { ok: false, message: r.reason };
}

const kindOf = (fd: FormData): MediaKind | null => (str(fd, "kind") === "avatar" ? "avatar" : str(fd, "kind") === "header" ? "header" : null);

export async function uploadCampaignImage(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await editor();
  const id = str(fd, "id");
  const kind = kindOf(fd);
  const file = fd.get("image");
  if (!kind) return { ok: false, message: "Unknown image." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose an image." };
  const verdict = await check("media", actor.orgId);
  if (verdict !== "ok") return { ok: false, message: verdict === "unavailable" ? "Uploads are briefly unavailable. Try again in a minute." : `Your organization has uploaded many images today. Try again in ${waitText(await retryAfter("media", actor.orgId), "hour")}.` };
  const r = await setCampaignImage(actor, id, kind, new Uint8Array(await file.arrayBuffer()), supabaseMediaStore());
  await refresh(actor.orgId, id);
  return r.ok ? { ok: true, message: kind === "avatar" ? "Avatar updated." : "Header image updated." } : { ok: false, message: r.reason };
}

export async function removeCampaignImage(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await editor();
  const id = str(fd, "id");
  const kind = kindOf(fd);
  if (!kind) return { ok: false, message: "Unknown image." };
  const r = await clearCampaignImage(actor, id, kind, supabaseMediaStore());
  await refresh(actor.orgId, id);
  return r.ok ? { ok: true, message: "Removed." } : { ok: false, message: r.reason };
}

// ---------------------------------------------------------------------------
// Posts (S1.3): owners, publishers and recruiters write; pins are owners' and publishers'.
// ---------------------------------------------------------------------------

export interface PostFormState extends ActionState {
  errors?: Record<string, string>;
}

const poster = async () => {
  const s = await requireArea("campaignPosting");
  return { profileId: s.userId, orgId: s.orgId, manages: accessTo(s.role, "campaigns") === "full" };
};
const jobOf = (fd: FormData) => str(fd, "jobId") || null;

export async function savePost(_prev: PostFormState, fd: FormData): Promise<PostFormState> {
  const actor = await poster();
  const campaignId = str(fd, "campaignId");
  const postId = str(fd, "postId");
  const body = validatePostBody(str(fd, "body"));
  if (!body.ok) return { ok: false, message: body.error, errors: { body: body.error } };
  {
    // New posts and edits alike: each one writes a revision.
    const verdict = await check("post", actor.orgId);
    if (verdict === "unavailable") return { ok: false, message: "Posting is briefly unavailable. Try again in a minute." };
    if (verdict !== "ok") return { ok: false, message: `Your organization has posted a lot this hour. Try again in ${waitText(await retryAfter("post", actor.orgId))}.` };
  }
  const r = postId ? await editPost(actor, postId, { body: body.value, jobId: jobOf(fd) }) : await createPost(actor, campaignId, { body: body.value, jobId: jobOf(fd) });
  await refresh(actor.orgId, campaignId);
  if (!r.ok) return { ok: false, message: r.reason, errors: r.errors };
  return { ok: true, message: postId ? "Saved." : "Posted." };
}

export async function removePost(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await poster();
  const r = await deletePost(actor, str(fd, "postId"));
  await refresh(actor.orgId, str(fd, "campaignId"));
  return r.ok ? { ok: true, message: "Deleted." } : { ok: false, message: r.reason };
}

export async function pinPost(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await editor();
  const pin = str(fd, "pin") === "1";
  const r = await setPostPinned(actor, str(fd, "postId"), pin);
  await refresh(actor.orgId, str(fd, "campaignId"));
  return r.ok ? { ok: true, message: pin ? "Pinned as a talking point." : "Unpinned." } : { ok: false, message: r.reason };
}

/** Links a job to this campaign (its shifts are briefed with the talking points), or unlinks it. Owners and publishers. */
export async function linkJob(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await editor();
  const campaignId = str(fd, "campaignId");
  const jobId = str(fd, "jobId");
  if (!jobId) return { ok: false, message: "Pick a job." };
  const unlink = str(fd, "unlink") === "1";
  const r = await setJobCampaign(actor, jobId, unlink ? null : campaignId);
  await refresh(actor.orgId, campaignId);
  return r.ok ? { ok: true, message: unlink ? "Unlinked." : "Linked: its shifts now carry these talking points." } : { ok: false, message: r.reason };
}

// ---------------------------------------------------------------------------
// The briefing kit (S4): supporting facts and resources are the managers' (owners and publishers).
// ---------------------------------------------------------------------------

export interface KitFormState extends ActionState {
  errors?: Record<string, string>;
}

/** Kit writes count against the posting limit: the same organization, the same hour. */
async function kitGate(orgId: string): Promise<KitFormState | null> {
  const verdict = await check("post", orgId);
  if (verdict === "ok") return null;
  if (verdict === "unavailable") return { ok: false, message: "Saving is briefly unavailable. Try again in a minute." };
  return { ok: false, message: `Your organization has written a lot this hour. Try again in ${waitText(await retryAfter("post", orgId))}.` };
}

/** Adds a supporting fact to a talking point, or saves an edit to one. */
export async function saveFact(_prev: KitFormState, fd: FormData): Promise<KitFormState> {
  const actor = await editor();
  const v = validateFact({ body: str(fd, "body"), sourceUrl: str(fd, "sourceUrl") });
  if (!v.ok) return { ok: false, message: "Fix the highlighted fields.", errors: v.errors };
  const gate = await kitGate(actor.orgId);
  if (gate) return gate;
  const factId = str(fd, "factId");
  const r = factId ? await editFact(actor, factId, v.value) : await addFact(actor, str(fd, "postId"), v.value);
  await refresh(actor.orgId, str(fd, "campaignId"));
  return r.ok ? { ok: true, message: factId ? "Saved." : "Added." } : { ok: false, message: r.reason };
}

export async function deleteFact(_prev: KitFormState, fd: FormData): Promise<KitFormState> {
  const actor = await editor();
  const r = await removeFact(actor, str(fd, "factId"));
  await refresh(actor.orgId, str(fd, "campaignId"));
  return r.ok ? { ok: true, message: "Removed." } : { ok: false, message: r.reason };
}

/** Creates a script, common question or guide, or saves an edit to one. */
export async function saveResource(_prev: KitFormState, fd: FormData): Promise<KitFormState> {
  const actor = await editor();
  const v = validateResource({ kind: str(fd, "kind"), audience: str(fd, "audience"), title: str(fd, "title"), body: str(fd, "body") });
  if (!v.ok) return { ok: false, message: "Fix the highlighted fields.", errors: v.errors };
  const gate = await kitGate(actor.orgId);
  if (gate) return gate;
  const resourceId = str(fd, "resourceId");
  const r = resourceId ? await editResource(actor, resourceId, v.value) : await createResource(actor, str(fd, "campaignId"), v.value);
  await refresh(actor.orgId, str(fd, "campaignId"));
  return r.ok ? { ok: true, message: resourceId ? "Saved." : "Added." } : { ok: false, message: r.reason };
}

export async function deleteResource(_prev: KitFormState, fd: FormData): Promise<KitFormState> {
  const actor = await editor();
  const r = await removeResource(actor, str(fd, "resourceId"));
  await refresh(actor.orgId, str(fd, "campaignId"));
  return r.ok ? { ok: true, message: "Removed." } : { ok: false, message: r.reason };
}
