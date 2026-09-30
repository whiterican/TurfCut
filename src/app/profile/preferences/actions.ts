"use server";

import { revalidatePath } from "next/cache";
import { resolveExpiry, validatePreferences } from "@/lib/political-fit";
import { savePreferences } from "@/lib/political-fit-data";
import { requireWorker } from "@/lib/worker-session";

export interface ConsentState {
  ok: boolean;
  message: string;
}

/** Final step of the flow: nothing is stored until the worker consents here. */
export async function consentToPreferences(
  _prev: ConsentState,
  formData: FormData
): Promise<ConsentState> {
  const { workerId, userId } = await requireWorker();
  if (formData.get("consent") !== "yes") {
    return { ok: false, message: "Tick the consent box to save." };
  }

  let payload: unknown;
  let expiry: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
    expiry = JSON.parse(String(formData.get("expiry") ?? "null"));
  } catch {
    return { ok: false, message: "Something went wrong reading your answers. Please try again." };
  }
  const result = validatePreferences(payload);
  if (!result.ok) {
    return { ok: false, message: Object.values(result.errors)[0] };
  }
  const expiresAt = resolveExpiry(expiry);
  if (!expiresAt.ok) {
    return { ok: false, message: Object.values(expiresAt.errors)[0] };
  }

  const saved = await savePreferences(workerId, userId, result.value, expiresAt.value);
  revalidatePath("/profile");
  revalidatePath("/profile/preferences");
  return {
    ok: true,
    message: saved.changed
      ? `Saved as consent version ${saved.consentVersion}.`
      : `No changes — version ${saved.consentVersion} still applies.`,
  };
}
