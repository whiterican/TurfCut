"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/app/jobs/actions";
import { requireArea } from "@/lib/employer-session";
import { validateProfile } from "@/lib/campaign-social";
import { clearCampaignImage, createCampaign, loadOrgCampaign, setCampaignImage, setCampaignPublished, updateCampaign } from "@/lib/campaign-social-data";
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
