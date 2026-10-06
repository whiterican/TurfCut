"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  if (typeof id === "string" && id) {
    const r = await editCredential(workerId, userId, id, fields(fd));
    return done(r, r.ok && r.changed === false ? "Nothing had changed." : "Saved. Earlier details are kept on record.");
  }
  return done(await addCredential(workerId, userId, fields(fd)), "Added as self-reported.");
}

/** On success the page reloads with ?removed=1, which shows the confirmation (the removed row is gone). */
export async function removeCredentialAction(fd: FormData): Promise<CredentialFormState> {
  const { workerId, userId } = await requireWorker();
  const r = done(await removeCredential(workerId, userId, String(fd.get("id") ?? "")), "Removed.");
  if (r.ok) redirect("/profile/credentials?removed=1");
  return r;
}
