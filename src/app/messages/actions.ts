"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionProfile, requireAuth } from "@/lib/auth";
import * as chat from "@/lib/chat-data";
import type { ActionState } from "@/app/jobs/actions";

/*
 * Server actions are public endpoints: each one authenticates, re-checks
 * argument types, and leaves every access decision to lib/chat-data.ts.
 */

const me = async (): Promise<chat.ChatUser> => {
  const s = await requireAuth();
  return { userId: s.userId, role: s.role, orgId: s.orgId };
};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const done = (r: { ok: true } | { ok: false; reason: string }, message: string): ActionState =>
  r.ok ? { ok: true, message } : { ok: false, message: r.reason };
const refreshThread = (conversationId: string) => {
  revalidatePath(`/messages/${conversationId}`);
  revalidatePath("/messages");
};

/** Nav badge. Signed-out callers get 0 rather than a redirect. */
export async function unreadCount(): Promise<number> {
  const s = await getSessionProfile();
  if (!s) return 0;
  try {
    return await chat.unreadTotal({ userId: s.userId, role: s.role, orgId: s.orgId });
  } catch {
    return 0;
  }
}

export async function send(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await me();
  const conversationId = str(fd.get("conversationId"));
  // A quick-reply button sends its own text (and no attachment).
  const quick = str(fd.get("quick"));
  const upload = quick ? null : fd.get("file");
  let file: chat.UploadedFile | null = null;
  if (upload instanceof File && upload.size > 0) {
    file = { name: upload.name, bytes: new Uint8Array(await upload.arrayBuffer()) };
  }
  const r = await chat.sendMessage(user, conversationId, quick || fd.get("body"), file);
  if (r.ok) refreshThread(conversationId);
  return done(r, "Sent.");
}

export async function edit(conversationId: string, messageId: string, body: string): Promise<ActionState> {
  const r = await chat.editMessage(await me(), str(messageId), str(body));
  if (r.ok) refreshThread(str(conversationId));
  return done(r, "Edited.");
}

export async function remove(conversationId: string, messageId: string): Promise<ActionState> {
  const r = await chat.deleteMessage(await me(), str(messageId));
  if (r.ok) {
    refreshThread(str(conversationId));
    revalidatePath("/messages/reports");
  }
  return done(r, "Message deleted.");
}

export async function report(messageId: string, reason: string): Promise<ActionState> {
  return done(await chat.reportMessage(await me(), str(messageId), str(reason)), "Reported. The organization's owner will review it.");
}

export async function block(conversationId: string, profileId: string): Promise<ActionState> {
  const r = await chat.blockProfile(await me(), str(profileId));
  if (r.ok) refreshThread(str(conversationId));
  return done(r, "Blocked. You won't see their new messages.");
}

export async function unblock(conversationId: string, profileId: string): Promise<ActionState> {
  const r = await chat.unblockProfile(await me(), str(profileId));
  if (r.ok) refreshThread(str(conversationId));
  return done(r, "Unblocked. Messages sent while blocked stay hidden.");
}

/** Opens (creating if needed) the direct thread for a hire. */
export async function startDirect(fd: FormData): Promise<void> {
  const r = await chat.ensureDirect(await me(), str(fd.get("engagementId")));
  // A fixed code, never free text in the URL (no message injection via links).
  if (!r.ok) redirect(`/messages?error=${/hire is confirmed/.test(r.reason) ? "not_hired" : /No one at this organization/.test(r.reason) ? "no_contact" : "not_found"}`);
  redirect(`/messages/${r.conversationId}`);
}

export async function candidates(jobIds: string[]): Promise<chat.Candidate[]> {
  const user = await me();
  if (!Array.isArray(jobIds) || jobIds.length > 20 || !jobIds.every((j) => typeof j === "string")) return [];
  return chat.teamCandidates(user, jobIds);
}

export async function createTeamChat(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await chat.createGroup(await me(), {
    name: fd.get("name"),
    jobIds: fd.getAll("jobIds").map(String),
    memberIds: fd.getAll("memberIds").map(String),
  });
  if (!r.ok) return { ok: false, message: r.reason };
  revalidatePath("/messages");
  redirect(`/messages/${r.conversationId}`);
}

export async function addMembers(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const conversationId = str(fd.get("conversationId"));
  const r = await chat.addMembers(await me(), conversationId, fd.getAll("memberIds").map(String));
  if (r.ok) refreshThread(conversationId);
  return r.ok ? { ok: true, message: r.added === 1 ? "Added 1 person." : `Added ${r.added} people.` } : { ok: false, message: r.reason };
}

export async function removeMember(conversationId: string, profileId: string): Promise<ActionState> {
  const r = await chat.removeMember(await me(), str(conversationId), str(profileId));
  if (r.ok) refreshThread(str(conversationId));
  return done(r, "Removed. They keep read-only history.");
}

export async function dismissReport(reportId: string): Promise<ActionState> {
  const r = await chat.dismissReport(await me(), str(reportId));
  if (r.ok) revalidatePath("/messages/reports");
  return done(r, "Report dismissed.");
}

export async function setChatName(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await chat.setChatName(await me(), fd.get("displayName"));
  if (r.ok) revalidatePath("/messages", "layout");
  return done(r, "Saved.");
}
