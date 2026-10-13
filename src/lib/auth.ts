import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { ensureAccount } from "@/lib/account";
import { ServiceUnavailableError, isAuthOutage, isConfigError } from "@/lib/outage";

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

/**
 * The signed-in auth user (verified with Supabase), or null. Memoized per
 * request (React cache): every guard, layout and page in one render shares
 * one call to Supabase.
 */
export const getAuthUser = cache(async () => {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return null; // Supabase env missing — treat as signed out (M0 rule).
  }
  let result;
  try {
    result = await supabase.auth.getUser();
  } catch (e) {
    throw new ServiceUnavailableError("auth", e);
  }
  // Auth unreachable or failing is an outage, not a sign-out (see outage.ts).
  if (result.error && isAuthOutage(result.error)) throw new ServiceUnavailableError("auth", result.error);
  return result.data.user ?? null;
});

/**
 * Returns the signed-in user's profile, or null when signed out /
 * unconfigured. Memoized per request (React cache), so the layout, the
 * page and every guard in one render share a single profile load; in a
 * server action or route handler it simply runs once per call.
 */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  // The worker link lives on the Worker row (Profile 1:1 Worker); one query loads both.
  const load = () => db().profile.findUnique({ where: { id: user.id }, include: { worker: { select: { id: true } } } });
  let profile;
  try {
    profile = await load();
    // A confirmed sign-up that landed somewhere other than /auth/confirm
    // (e.g. the Supabase Site URL): finish setup from its pending details.
    if (!profile && (await ensureAccount(user))) profile = await load();
  } catch (e) {
    // Supabase has just confirmed who this is, so a failure here is the
    // database failing (unreachable, pool timeout, too many connections...):
    // an outage, not a sign-out (see outage.ts). Only a missing setting reads
    // as signed out.
    if (!isConfigError(e)) throw new ServiceUnavailableError("database", e);
    console.error("[turfcut] loading the profile failed: not configured", e);
    return null;
  }
  if (!profile || profile.closedAt) return null; // a closed account (M7) has no session

  return {
    userId: user.id,
    email: user.email,
    role: profile.role as Role,
    workerId: profile.role === "WORKER" ? (profile.worker?.id ?? null) : null,
    orgId: profile.orgId,
  };
});

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
  } catch (e) {
    if (!isConfigError(e)) throw new ServiceUnavailableError("database", e);
    return false;
  }
}
