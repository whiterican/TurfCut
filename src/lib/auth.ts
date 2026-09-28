import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";

export type Role =
  | "WORKER"
  | "OWNER"
  | "RECRUITER"
  | "COMPLIANCE"
  | "SUPERVISOR"
  | "FINANCE";

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
  } catch {
    return null; // DB unreachable — treat as signed out, don't crash the page.
  }
  if (!profile) return null;

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
  if (!session) redirect("/login");
  if (!allowed.includes(session.role)) redirect("/dashboard");
  return session;
}

/** Convenience: any signed-in user. */
export async function requireAuth(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) redirect("/login");
  return session;
}
