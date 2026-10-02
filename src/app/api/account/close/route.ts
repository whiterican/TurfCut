import { apiWorker } from "@/lib/api-session";
import { confirmed } from "@/lib/account-closure";
import { closeAccount } from "@/lib/account-data";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/account/close { confirm, unsyncedEntries? } — the signed-in
 * worker closes their own account. Refused (409, with the reasons) while
 * pay, disputes or a live shift are open. On success the session is ended.
 */
export async function POST(req: Request) {
  const auth = await apiWorker();
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => null)) as { confirm?: unknown; unsyncedEntries?: unknown } | null;
  if (!confirmed(body?.confirm)) return Response.json({ error: "Type the confirmation phrase exactly." }, { status: 400 });
  const unsyncedEntries = typeof body?.unsyncedEntries === "number" && Number.isFinite(body.unsyncedEntries) ? Math.max(0, Math.floor(body.unsyncedEntries)) : 0;
  const r = await closeAccount({ userId: auth.session.userId, workerId: auth.session.workerId }, new Date(), { unsyncedEntries });
  if (!r.ok) return Response.json({ error: r.problems[0], problems: r.problems }, { status: 409 });
  try {
    await (await createClient()).auth.signOut();
  } catch {
    // The login is already gone; the cookie is useless either way.
  }
  return Response.json({ ok: true, cancelledShifts: r.cancelledShifts });
}
