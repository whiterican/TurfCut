"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { markAllRead } from "@/lib/notifications-data";

/** Marks the signed-in person's notices read. Nobody else ever sees whether they did. */
export async function markNotificationsRead(): Promise<void> {
  const session = await requireAuth();
  await markAllRead(session.userId);
  revalidatePath("/", "layout");
}
