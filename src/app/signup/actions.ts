"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  getDatabaseUrl,
} from "@/lib/env";
import { PrismaClient } from "@prisma/client";

interface SignupInput {
  userId: string;
  accountType: "worker" | "company";
  name: string;
}

/**
 * Creates the Turfcut-side rows for a newly signed-up auth user:
 * Profile + Worker (role WORKER) or Profile + Organization (role OWNER).
 * Runs with the service-role key so it works before RLS policies exist (M0).
 */
export async function completeSignup(
  input: SignupInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const url = getSupabaseUrl();
    const serviceKey = getSupabaseServiceRoleKey();
    getDatabaseUrl();

    const cookieStore = await cookies();
    // Verify the caller actually owns this auth user before writing rows.
    const supabase = createServerClient(url, serviceKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== input.userId) {
      return { ok: false, error: "Not authenticated as the new user." };
    }

    const prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL! } },
    });
    try {
      const existing = await prisma.profile.findUnique({
        where: { id: input.userId },
      });
      if (existing) return { ok: true }; // idempotent

      if (input.accountType === "worker") {
        await prisma.profile.create({
          data: {
            id: input.userId,
            role: "WORKER",
            worker: { create: { displayName: input.name } },
          },
        });
      } else {
        const org = await prisma.organization.create({
          data: { name: input.name },
        });
        await prisma.profile.create({
          data: { id: input.userId, role: "OWNER", orgId: org.id },
        });
      }
      return { ok: true };
    } finally {
      await prisma.$disconnect();
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Signup failed",
    };
  }
}
