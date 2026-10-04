import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { ensureAccount } from "@/lib/account";

export type Role =
  | "WORKER"
  | "OWNER"
  | "RECRUITER"
  | "COMPLIANCE"
  | "SUPERVISOR"
  | "FINANCE"
  | "PUBLISHER";

export interface SessionProfile {
  userId: string;
  email: string | undefined;
  role: Role;
  workerId: string | null;
  orgId: string | null;
}

/** Returns the signed-in user's profile, or null when signed out / unconfigured. */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return null; // Supabase env missing — treat as signed out (M0 rule).
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let profile;
  try {
    profile = await db().profile.findUnique({ where: { id: user.id } });
    // A confirmed sign-up that landed somewhere other than /auth/confirm
    // (e.g. the Supabase Site URL): finish setup from its pending details.
    if (!profile && (await ensureAccount(user))) profile = await db().profile.findUnique({ where: { id: user.id } });
  } catch (e) {
    console.error("[turfcut] loading or finishing the profile failed", e);
    return null; // DB unreachable — treat as signed out, don't crash the page.
  }
  if (!profile || profile.closedAt) return null; // a closed account (M7) has no session

  // Worker link lives on the Worker row (Profile 1:1 Worker via profileId).
  let workerId: string | null = null;
  if (profile.role === "WORKER") {
    const worker = await db().worker.findUnique({
      where: { profileId: user.id },
      select: { id: true },
    });
    workerId = worker?.id ?? null;
  }

  return {
    userId: user.id,
    email: user.email,
    role: profile.role as Role,
    workerId,
    orgId: profile.orgId,
  };
}

/**
 * Route guard for Server Components / layouts.
 * Redirects to /login when signed out, to /dashboard when the role is wrong.
 */
export async function requireRole(allowed: Role[]): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) redirect((await needsSetup()) ? "/welcome" : "/login");
  if (!allowed.includes(session.role)) redirect("/dashboard");
  return session;
}

/** Convenience: any signed-in user. */
export async function requireAuth(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) redirect((await needsSetup()) ? "/welcome" : "/login");
  return session;
}

/** The signed-in auth user (verified with Supabase), or null. For checks on the email itself. */
export async function getAuthUser() {
  try {
    const supabase = await createClient();
    return (await supabase.auth.getUser()).data.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Signed in, but with no Turfcut profile and nothing to build one from —
 * e.g. a login an organization's invite created, whose invite was then
 * revoked or expired (C1). /welcome lets them finish setting up.
 */
export async function needsSetup(): Promise<boolean> {
  const user = await getAuthUser();
  if (!user) return false;
  try {
    return !(await db().profile.findUnique({ where: { id: user.id }, select: { id: true } }));
  } catch {
    return false;
  }
}
