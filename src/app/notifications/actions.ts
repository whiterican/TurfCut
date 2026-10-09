"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { markRead } from "@/lib/notifications-data";

/** Marks read the notices the page showed (their ids). Nobody else ever sees whether they did. */
export async function markNotificationsRead(fd: FormData): Promise<void> {
  const session = await requireAuth();
  await markRead(session.userId, fd.getAll("id").map(String));
  revalidatePath("/", "layout");
}
