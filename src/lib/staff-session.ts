import { notFound } from "next/navigation";
import { getSessionProfile, type SessionProfile } from "@/lib/auth";

/**
 * Turfcut staff only (M10.1). Anyone else — signed out, a worker, an
 * organization role — gets the same 404 as a page that doesn't exist, so the
 * console's presence is never confirmed to someone who can't use it. Staff
 * is a flag on the profile (Profile.staffSince), set by hand and independent
 * of the account's role: a staff member can also be a worker or an owner.
 */
export async function requireStaff(): Promise<SessionProfile & { staff: true }> {
  const session = await getSessionProfile();
  if (!session?.staff) notFound();
  return { ...session, staff: true };
}
