import { createClient } from "@supabase/supabase-js";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/env";
import { CLOSED_NAME, closureProblems, type ClosureFacts } from "@/lib/account-closure";
import { lineState } from "@/lib/pay";
import { csvTable } from "@/lib/zip";

type Client = Prisma.TransactionClient | ReturnType<typeof db>;
const lock = (tx: Prisma.TransactionClient, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

/** What stands between this worker and closing their account, from the database. */
export async function closureFacts(workerId: string, c: Client = db()): Promise<ClosureFacts> {
  const [lines, openDisputes, liveShifts] = await Promise.all([
    c.payout.findMany({ where: { workerId }, include: { events: true, disputes: { select: { resolution: { select: { id: true } } } } } }),
    c.payDispute.count({ where: { workerId, resolution: null } }),
    c.shift.count({ where: { engagement: { workerId }, status: "ACTIVE" } }),
  ]);
  let unpaidLines = 0;
  let transfersInFlight = 0;
  for (const l of lines) {
    const st = lineState(l, l.events.map((e) => ({ type: e.type, createdAt: e.createdAt, reason: e.reason, transferId: e.transferId, providerRef: e.providerRef })), l.disputes.some((d) => !d.resolution));
    if (st.status === "PROCESSING") transfersInFlight++;
    else if (st.status !== "VOIDED" && st.status !== "PAID" && st.status !== "NOTHING_DUE") unpaidLines++;
  }
  return { unpaidLines, openDisputes, liveShifts, transfersInFlight };
}

export type CloseResult = { ok: true; cancelledShifts: number } | { ok: false; problems: string[] };

/**
 * Closes a worker's account. Nothing is deleted from the ledger (rule 3):
 * the name and phone are anonymized, future shifts are cancelled as excused
 * (owner decision: closing is never a no-show), open applications and
 * invitations are withdrawn, and the login is removed afterwards so the
 * email is gone and they can't sign in. Everything else stays as recorded.
 */
export async function closeAccount(actor: { userId: string; workerId: string }, now = new Date(), opts: { unsyncedEntries?: number } = {}): Promise<CloseResult> {
  const result = await db().$transaction(async (tx) => {
    await lock(tx, `pay:${actor.workerId}`);
    await lock(tx, `account:${actor.workerId}`);
    const worker = await tx.worker.findUnique({ where: { id: actor.workerId }, select: { closedAt: true, profileId: true } });
    if (!worker || worker.profileId !== actor.userId) return { ok: false as const, problems: ["Account not found."] };
    if (worker.closedAt) return { ok: false as const, problems: ["This account is already closed."] };
    const problems = closureProblems({ ...(await closureFacts(actor.workerId, tx)), unsyncedEntries: opts.unsyncedEntries });
    if (problems.length) return { ok: false as const, problems };

    // Future shifts: cancelled in the worker's name, marked as an account
    // closure so the scorecard treats it as excused, never as a no-show.
    const future = await tx.shift.findMany({ where: { engagement: { workerId: actor.workerId }, status: "SCHEDULED", endsAt: { gt: now } }, select: { id: true } });
    const payload = { by: "WORKER", reason: "Account closed", accountClosed: true };
    for (const s of future) {
      await lock(tx, `shift:${s.id}`);
      await tx.workEvent.create({ data: { shiftId: s.id, type: "SHIFT_CANCELLED", payload, actorId: actor.userId, createdAt: now } });
      await tx.shift.update({ where: { id: s.id }, data: { status: "CANCELLED" } });
      await tx.auditEvent.create({ data: { actorId: actor.userId, action: "shift.cancelled", entityType: "Shift", entityId: s.id, metadata: payload, createdAt: now } });
    }
    await tx.engagement.updateMany({ where: { workerId: actor.workerId, status: { in: ["APPLIED", "INVITED"] } }, data: { status: "CANCELLED" } });

    await tx.worker.update({ where: { id: actor.workerId }, data: { displayName: CLOSED_NAME, phone: null, closedAt: now } });
    await tx.profile.update({ where: { id: actor.userId }, data: { displayName: null, closedAt: now } });
    await tx.auditEvent.create({ data: { actorId: actor.userId, action: "account.closed", entityType: "Profile", entityId: actor.userId, metadata: { cancelledShifts: future.length }, createdAt: now } });
    return { ok: true as const, cancelledShifts: future.length };
  });
  if (!result.ok) return result;

  // The login goes last: once the rows above are committed the session is
  // already refused (closedAt), so a failure here only leaves an orphan
  // auth user to remove by hand — it never leaves a half-closed account.
  try {
    const admin = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.auth.admin.deleteUser(actor.userId);
    if (error) throw error;
  } catch (e) {
    console.error("[turfcut] account closed but the auth user could not be deleted", actor.userId, e);
    await db().auditEvent.create({ data: { actorId: actor.userId, action: "account.login_delete_failed", entityType: "Profile", entityId: actor.userId, metadata: { message: e instanceof Error ? e.message : String(e) } } }).catch(() => {});
  }
  return result;
}

// ---------------------------------------------------------------------------
// Data export: everything Turfcut holds about the worker, as JSON + CSV.
// ---------------------------------------------------------------------------

const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";

/** The files of a worker's data export (zipped by the route). */
export async function exportAccount(actor: { userId: string; workerId: string; email?: string }, now = new Date()): Promise<Array<{ name: string; text: string }>> {
  const p = db();
  const w = actor.workerId;
  const [worker, experience, preferences, metrics, engagements, shifts, lines, transfers, disputes, messages] = await Promise.all([
    p.worker.findUniqueOrThrow({ where: { id: w }, select: { id: true, displayName: true, phone: true, createdAt: true, closedAt: true, payoutsEnabled: true, stripeAccountId: true } }),
    p.experienceRecord.findMany({ where: { workerId: w }, orderBy: { startDate: "desc" } }),
    p.politicalPreference.findMany({ where: { workerId: w }, orderBy: { consentVersion: "asc" } }),
    p.profileMetric.findMany({ where: { workerId: w }, orderBy: { version: "asc" } }),
    p.engagement.findMany({ where: { workerId: w }, include: { job: { select: { id: true, title: true, org: { select: { name: true } } } } }, orderBy: { createdAt: "asc" } }),
    p.shift.findMany({
      where: { engagement: { workerId: w } },
      include: { engagement: { select: { job: { select: { title: true, org: { select: { name: true } } } } } }, events: { orderBy: { createdAt: "asc" } }, validations: { orderBy: { createdAt: "asc" } } },
      orderBy: { startsAt: "asc" },
    }),
    p.payout.findMany({ where: { workerId: w }, include: { events: { orderBy: { createdAt: "asc" } }, org: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    p.payoutTransfer.findMany({ where: { workerId: w }, include: { org: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    p.payDispute.findMany({ where: { workerId: w }, include: { resolution: true, org: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    p.message.findMany({ where: { senderId: actor.userId }, include: { revisions: { orderBy: { createdAt: "asc" } }, conversation: { select: { id: true, kind: true, engagement: { select: { job: { select: { title: true } } } } } } }, orderBy: { createdAt: "asc" } }),
  ]);

  const files: Array<{ name: string; text: string }> = [];
  files.push({
    name: "README.txt",
    text: [
      `Turfcut data export for ${worker.displayName}`,
      `Exported ${now.toISOString()}`,
      "",
      "profile.json        your account: name, phone, email, Stripe status",
      "experience.csv      the campaigns on your profile, with their verification level",
      "preferences.json    every version of your political-fit answers and consent (newest last)",
      "metrics.json        every version of your computed scorecard aggregates",
      "engagements.csv     jobs you applied to, were invited to, claimed or worked",
      "shifts.csv          your shifts, with the supervisor's review",
      "work-events.csv     the field ledger: every check-in, count, break, packet, correction",
      "reviews.csv         every supervisor review decision",
      "pay-lines.csv       every pay line recorded for you, with its current status",
      "pay-events.csv      the history of each pay line",
      "transfers.csv       payments sent to your Stripe account",
      "disputes.csv        pay disputes you opened and how they were answered",
      "messages.csv        messages you sent, with any edits or deletions",
      "",
      "Times are UTC (ISO 8601). Nothing here is ever deleted from Turfcut's",
      "ledger — closing your account anonymizes your name and phone and removes",
      "your login; the history stays as it was recorded.",
      "",
    ].join("\n"),
  });
  files.push({ name: "profile.json", text: json({ ...worker, email: actor.email ?? null, profileId: actor.userId }) });
  files.push({ name: "experience.csv", text: csvTable(experience) });
  files.push({ name: "preferences.json", text: json(preferences) });
  files.push({ name: "metrics.json", text: json(metrics) });
  files.push({ name: "engagements.csv", text: csvTable(engagements.map((e) => ({ id: e.id, jobId: e.job.id, job: e.job.title, organization: e.job.org.name, status: e.status, createdAt: e.createdAt, updatedAt: e.updatedAt, applicationSnapshot: e.applicationSnapshot }))) });
  files.push({
    name: "shifts.csv",
    text: csvTable(
      shifts.map((s) => {
        const review = [...s.validations].reverse().find((v) => v.workEventId === null);
        return { id: s.id, job: s.engagement.job.title, organization: s.engagement.job.org.name, startsAt: s.startsAt, endsAt: s.endsAt, status: s.status, checkInAt: s.checkInAt, checkOutAt: s.checkOutAt, stagingLocation: s.stagingLocation, review: review?.status ?? "", reviewReason: review?.reason ?? "", reviewedAt: review?.createdAt ?? "" };
      }),
      ["id", "job", "organization", "startsAt", "endsAt", "status", "checkInAt", "checkOutAt", "stagingLocation", "review", "reviewReason", "reviewedAt"]
    ),
  });
  files.push({ name: "work-events.csv", text: csvTable(shifts.flatMap((s) => s.events.map((e) => ({ id: e.id, shiftId: s.id, type: e.type, at: e.createdAt, byMe: e.actorId === actor.userId, payload: e.payload }))), ["id", "shiftId", "type", "at", "byMe", "payload"]) });
  files.push({ name: "reviews.csv", text: csvTable(shifts.flatMap((s) => s.validations.map((v) => ({ id: v.id, shiftId: s.id, workEventId: v.workEventId, status: v.status, reason: v.reason, at: v.createdAt }))), ["id", "shiftId", "workEventId", "status", "reason", "at"]) });
  const openShifts = new Set(disputes.filter((d) => !d.resolution).map((d) => d.shiftId));
  files.push({
    name: "pay-lines.csv",
    text: csvTable(
      lines.map((l) => {
        const st = lineState(l, l.events.map((e) => ({ type: e.type, createdAt: e.createdAt, reason: e.reason, transferId: e.transferId, providerRef: e.providerRef })), !!l.shiftId && openShifts.has(l.shiftId));
        return { id: l.id, organization: l.org.name, shiftId: l.shiftId, kind: l.kind, amountCents: l.amountCents, status: st.status, approvedAt: st.approvedAt, paidAt: st.paidAt, paidRef: st.paidRef, heldReason: st.heldReason, adjustsId: l.adjustsId, basis: l.basis, createdAt: l.createdAt };
      }),
      ["id", "organization", "shiftId", "kind", "amountCents", "status", "approvedAt", "paidAt", "paidRef", "heldReason", "adjustsId", "basis", "createdAt"]
    ),
  });
  files.push({ name: "pay-events.csv", text: csvTable(lines.flatMap((l) => l.events.map((e) => ({ id: e.id, payoutId: l.id, type: e.type, reason: e.reason, transferId: e.transferId, providerRef: e.providerRef, at: e.createdAt }))), ["id", "payoutId", "type", "reason", "transferId", "providerRef", "at"]) });
  files.push({ name: "transfers.csv", text: csvTable(transfers.map((t) => ({ id: t.id, organization: t.org.name, amountCents: t.amountCents, destination: t.destination, createdAt: t.createdAt })), ["id", "organization", "amountCents", "destination", "createdAt"]) });
  files.push({
    name: "disputes.csv",
    text: csvTable(
      disputes.map((d) => ({ id: d.id, organization: d.org.name, shiftId: d.shiftId, payoutId: d.payoutId, reason: d.reason, openedAt: d.createdAt, outcome: d.resolution?.outcome ?? "", response: d.resolution?.response ?? "", resolvedAt: d.resolution?.createdAt ?? "" })),
      ["id", "organization", "shiftId", "payoutId", "reason", "openedAt", "outcome", "response", "resolvedAt"]
    ),
  });
  files.push({
    name: "messages.csv",
    text: csvTable(
      messages.map((m) => ({ id: m.id, conversationId: m.conversation.id, kind: m.conversation.kind, job: m.conversation.engagement?.job.title ?? "", sentAt: m.createdAt, body: m.body, attachment: m.attachmentName ?? "", revisions: m.revisions.map((r) => ({ kind: r.kind, body: r.body, at: r.createdAt })) })),
      ["id", "conversationId", "kind", "job", "sentAt", "body", "attachment", "revisions"]
    ),
  });
  return files;
}
