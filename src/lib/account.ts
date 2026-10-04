import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/auth-input";
import { acceptInvite, type VerifiedUser } from "@/lib/members-data";

/** What sign-up stores on the auth user until the account is confirmed. */
export interface PendingSignup {
  accountType: "worker" | "company";
  name: string;
  phone: string | null;
}

export const SIGNUP_METADATA_KEY = "turfcut_signup";

/** Re-validates metadata (the user can edit their own metadata). */
export function readPendingSignup(meta: unknown): PendingSignup | null {
  const m = meta && typeof meta === "object" ? (meta as Record<string, unknown>)[SIGNUP_METADATA_KEY] : null;
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  const accountType = o.accountType === "company" ? "company" : o.accountType === "worker" ? "worker" : null;
  const name = typeof o.name === "string" ? o.name.trim().replace(/\s+/g, " ").slice(0, 100) : "";
  if (!accountType || !name) return null;
  const phone = accountType === "worker" && typeof o.phone === "string" ? normalizePhone(o.phone) : null;
  return { accountType, name, phone };
}

/**
 * Creates the Turfcut rows for an AUTHENTICATED user — call only with a user
 * from a verified session (getUser / a successful sign-up session), never
 * from unverified input. From their sign-up details, or, for a login an
 * organization's invite created, from that invite (C1). Idempotent: an
 * existing profile, or a concurrent creation (P2002), counts as success.
 */
export async function ensureAccount(user: VerifiedUser & { user_metadata?: unknown }): Promise<boolean> {
  const existing = await db().profile.findUnique({ where: { id: user.id }, select: { id: true } });
  if (existing) return true;
  const pending = readPendingSignup(user.user_metadata);
  if (!pending) {
    // No sign-up details: the login came from an organization's invite email
    // (C1). Join through that invite; metadata never grants a role. Someone
    // who signed up themselves keeps what they asked for — an invite never
    // overrides it.
    try {
      return await acceptInvite(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return true;
      throw e;
    }
  }
  try {
    await db().$transaction(async (tx) => {
      if (pending.accountType === "worker") {
        await tx.profile.create({
          data: { id: user.id, role: "WORKER", worker: { create: { displayName: pending.name, phone: pending.phone } } },
        });
      } else {
        const org = await tx.organization.create({ data: { name: pending.name } });
        await tx.profile.create({ data: { id: user.id, role: "OWNER", orgId: org.id } });
      }
      await tx.auditEvent.create({
        data: { actorId: user.id, action: "account.created", entityType: "Profile", entityId: user.id, metadata: { accountType: pending.accountType } },
      });
    });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return true;
    throw e;
  }
}
