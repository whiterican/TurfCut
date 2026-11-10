"use server";

import { revalidatePath } from "next/cache";
import { getSessionProfile } from "@/lib/auth";
import { MEDIA_MAX_BYTES } from "@/lib/image-clean";
import { clearProfilePhoto, setProfilePhoto, supabasePhotoStore } from "@/lib/profile-photo";
import { photoRecords } from "@/lib/profile-photo-data";
import { check } from "@/lib/rate-limit";

export interface PhotoState {
  ok: boolean;
  message: string;
}

/** Add or replace the signed-in person's own photo. */
export async function uploadProfilePhoto(_prev: PhotoState | null, fd: FormData): Promise<PhotoState> {
  const session = await getSessionProfile();
  if (!session) return { ok: false, message: "Sign in to add a photo." };
  const limit = await check("profile-photo", session.userId);
  if (limit !== "ok") return { ok: false, message: limit === "limited" ? "Too many photo changes today. Try again tomorrow." : "The photo couldn't be saved. Try again in a moment." };
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a photo." };
  // Refused by its stated size first; checkImage then judges the bytes themselves.
  if (file.size > MEDIA_MAX_BYTES) return { ok: false, message: "Photos are up to 2 MB." };
  try {
    const r = await setProfilePhoto(session.userId, new Uint8Array(await file.arrayBuffer()), photoRecords(), supabasePhotoStore());
    if (!r.ok) return { ok: false, message: r.reason.replace(/\bimages?\b/gi, (m) => (m[0] === "I" ? "Photos" : m.endsWith("s") ? "photos" : "photo")) };
  } catch (e) {
    console.error("[turfcut] saving a profile photo failed", e);
    return { ok: false, message: "The photo couldn't be saved. Try again in a moment." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Photo saved." };
}

/** Remove the signed-in person's own photo. */
export async function removeProfilePhoto(): Promise<PhotoState> {
  const session = await getSessionProfile();
  if (!session) return { ok: false, message: "Sign in first." };
  if ((await check("profile-photo", session.userId)) === "limited") return { ok: false, message: "Too many photo changes today. Try again tomorrow." };
  try {
    await clearProfilePhoto(session.userId, photoRecords(), supabasePhotoStore());
  } catch (e) {
    console.error("[turfcut] removing a profile photo failed", e);
    return { ok: false, message: "The photo couldn't be removed. Try again in a moment." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Photo removed." };
}
