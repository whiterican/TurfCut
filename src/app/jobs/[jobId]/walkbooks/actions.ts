"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/employer-session";
import { assignWalkbook, cutWalkbooks, importAddresses, purgeOwnImport } from "@/lib/walkbooks-data";
import { MAX_FILE_BYTES } from "@/lib/walkbooks";
import { UUID_RE } from "@/lib/jobs";
import { check } from "@/lib/rate-limit";
import type { ActionState } from "@/app/jobs/actions";
import { orTryAgain, TRY_AGAIN } from "@/lib/try-again";

export interface WalkbookFormState {
  ok: boolean;
  message: string;
  errors: Record<string, string>;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Running the field (owners and supervisors, or a custom role granted it) is who prepares walkbooks. */
async function staff() {
  const s = await requireArea("field");
  return { profileId: s.userId, orgId: s.orgId };
}

const changed = (jobId: string) => {
  revalidatePath(`/jobs/${jobId}/walkbooks`, "layout");
  revalidatePath("/walkbooks");
};

export async function importAddressesAction(_prev: WalkbookFormState, fd: FormData): Promise<WalkbookFormState> {
  const actor = await staff();
  const jobId = str(fd, "jobId");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a CSV file.", errors: { file: "Choose a CSV file." } };
  // Next has already parsed the body (capped by serverActions.bodySizeLimit); this keeps the reader to the file limit.
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "The file is over 2 MB.", errors: { file: "The file is over 2 MB. Split it, or keep only the address columns." } };
  const verdict = await check("address-file", actor.orgId);
  if (verdict === "unavailable") return { ok: false, message: "Imports are unavailable right now. Try again in a moment.", errors: {} };
  if (verdict === "limited") return { ok: false, message: "Your organization has imported a lot of files today. Try again tomorrow.", errors: {} };
  const text = await file.text();
  const r = await importAddresses(actor, { fileName: file.name, recordSource: fd.get("recordSource"), purpose: fd.get("purpose"), license: fd.get("license"), authorized: fd.get("authorized"), sourceSystem: fd.get("sourceSystem"), ackAZ: fd.get("ackAZ") }, text);
  if (!r.ok) return { ok: false, message: r.reason, errors: r.errors ?? {} };
  if (UUID_RE.test(jobId)) changed(jobId);
  return { ok: true, message: `Imported ${r.kept.toLocaleString("en-US")} ${r.kept === 1 ? "address" : "addresses"}${r.skipped ? `; ${r.skipped.toLocaleString("en-US")} ${r.skipped === 1 ? "row" : "rows"} skipped` : ""}. Cut them into walkbooks below.`, errors: {} };
}

export async function cutWalkbooksAction(_prev: WalkbookFormState, fd: FormData): Promise<WalkbookFormState> {
  const actor = await staff();
  const r = await orTryAgain("walkbook cut", () => cutWalkbooks(actor, str(fd, "jobId"), str(fd, "importId"), str(fd, "stopsPerBook")));
  if (!r) return { ok: false, message: TRY_AGAIN, errors: {} };
  if (!r.ok) return { ok: false, message: r.reason, errors: r.errors ?? {} };
  changed(r.jobId);
  const repeats = r.repeats ? ` ${r.repeats.toLocaleString("en-US")} ${r.repeats === 1 ? "address was" : "addresses were"} already on this job's walkbooks and left out.` : "";
  return { ok: true, message: `Cut ${r.stops.toLocaleString("en-US")} ${r.stops === 1 ? "stop" : "stops"} into ${r.books} ${r.books === 1 ? "walkbook" : "walkbooks"}.${repeats}`, errors: {} };
}

export async function assignWalkbookAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await staff();
  const engagementId = str(fd, "engagementId");
  const r = await orTryAgain("walkbook hand-out", () => assignWalkbook(actor, str(fd, "walkbookId"), engagementId));
  if (!r) return { ok: false, message: TRY_AGAIN };
  if (!r.ok) return { ok: false, message: r.reason };
  if (r.changed) changed(r.jobId);
  return { ok: true, message: !r.changed ? "No change." : engagementId ? "Handed over. It's on their phone now." : "Taken back. Nobody holds it now." };
}

/** The organization deletes a file's names and addresses now, instead of waiting for the 30 days. Stops, outcomes and poll answers stay. */
export async function deleteFileDataAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await staff();
  const r = await orTryAgain("file delete", () => purgeOwnImport(actor, str(fd, "importId")));
  if (!r) return { ok: false, message: TRY_AGAIN };
  if (!r.ok) return { ok: false, message: r.reason };
  const jobId = str(fd, "jobId").toLowerCase();
  if (UUID_RE.test(jobId)) revalidatePath(`/jobs/${jobId}/walkbooks`, "layout");
  revalidatePath("/walkbooks");
  return { ok: true, message: r.already ? "Already deleted." : `Deleted ${r.addresses.toLocaleString("en-US")} ${r.addresses === 1 ? "address" : "addresses"} and everything stored with them.` };
}
