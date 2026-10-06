"use server";

import { revalidatePath } from "next/cache";
import { addCredential, editCredential, removeCredential } from "@/lib/credentials-data";
import { requireWorker } from "@/lib/worker-session";

export interface CredentialFormState {
  ok: boolean;
  message: string;
  errors: Record<string, string>;
}

const fields = (fd: FormData) => ({
  kind: fd.get("kind"),
  label: fd.get("label"),
  state: fd.get("state"),
  identifier: fd.get("identifier"),
  issuedOn: fd.get("issuedOn"),
  expiresOn: fd.get("expiresOn"),
});

function done(r: Awaited<ReturnType<typeof addCredential>>, ok: string): CredentialFormState {
  if (!r.ok) return { ok: false, message: r.reason, errors: r.errors ?? {} };
  revalidatePath("/profile");
  revalidatePath("/profile/credentials");
  revalidatePath("/dashboard");
  return { ok: true, message: ok, errors: {} };
}

/** Add, or edit when the form carries the id of the credential it replaces. Always the session's own wallet. */
export async function saveCredentialAction(fd: FormData): Promise<CredentialFormState> {
  const { workerId, userId } = await requireWorker();
  const id = fd.get("id");
  return typeof id === "string" && id
    ? done(await editCredential(workerId, userId, id, fields(fd)), "Saved. Earlier details are kept on record.")
    : done(await addCredential(workerId, userId, fields(fd)), "Added as self-reported.");
}

export async function removeCredentialAction(fd: FormData): Promise<CredentialFormState> {
  const { workerId, userId } = await requireWorker();
  return done(await removeCredential(workerId, userId, String(fd.get("id") ?? "")), "Removed. It stays on record but nobody sees it.");
}
