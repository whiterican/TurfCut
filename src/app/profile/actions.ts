"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { validateExperience } from "@/lib/experience";
import { requireWorker } from "@/lib/worker-session";

export interface ExperienceFormState {
  ok: boolean;
  message: string;
  errors: Record<string, string>;
}

/**
 * Adds an experience record. Always SELF_REPORTED — the form has no
 * verification field, and anything extra in the submission is ignored.
 */
export async function addExperience(
  _prev: ExperienceFormState,
  formData: FormData
): Promise<ExperienceFormState> {
  const { workerId, userId } = await requireWorker();
  const result = validateExperience(Object.fromEntries(formData));
  if (!result.ok) {
    return { ok: false, message: "Fix the highlighted fields.", errors: result.errors };
  }

  const record = await db().experienceRecord.create({
    data: { ...result.value, workerId, verificationLevel: "SELF_REPORTED" },
  });
  await db().auditEvent.create({
    data: {
      actorId: userId,
      action: "experience.added",
      entityType: "ExperienceRecord",
      entityId: record.id,
      metadata: { verificationLevel: "SELF_REPORTED" },
    },
  });
  revalidatePath("/profile");
  return { ok: true, message: "Added as self-reported.", errors: {} };
}

/** Removes one of the worker's own SELF_REPORTED records. Verified ones are locked. */
export async function removeExperience(formData: FormData): Promise<void> {
  const { workerId, userId } = await requireWorker();
  const id = String(formData.get("id") ?? "");

  // The where clause is the guard: another worker's record, or a verified
  // one, matches nothing and nothing is deleted.
  const { count } = await db().experienceRecord.deleteMany({
    where: { id, workerId, verificationLevel: "SELF_REPORTED" },
  });
  if (count > 0) {
    await db().auditEvent.create({
      data: {
        actorId: userId,
        action: "experience.removed",
        entityType: "ExperienceRecord",
        entityId: id,
      },
    });
  }
  revalidatePath("/profile");
}
