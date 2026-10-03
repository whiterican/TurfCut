import { allow, retryAfter } from "@/lib/rate-limit";
import { apiWorker, badId } from "@/lib/api-session";
import { syncWorkerActions } from "@/lib/field-day-data";
import { MAX_BATCH, readQueued, type QueuedAction } from "@/lib/offline-sync";

/**
 * POST /api/shifts/:shiftId/sync { deviceNow, actions: [{ clientId, at, action }] }
 * The worker's phone sends field actions it saved (offline or not), oldest
 * first, up to MAX_BATCH at a time. Each comes back saved, duplicate
 * (already saved — drop it) or rejected (with the reason to show). Invalid
 * shapes reject the request (400); a missing session is 401.
 */
export async function POST(req: Request, { params }: { params: Promise<{ shiftId: string }> }) {
  const { shiftId } = await params;
  const bad = badId(shiftId);
  if (bad) return bad;
  const auth = await apiWorker();
  if ("error" in auth) return auth.error;
  if (!allow("sync", auth.session.workerId)) {
    return Response.json({ error: "Syncing too often. The phone will retry in a minute." }, { status: 429, headers: { "Retry-After": String(retryAfter("sync", auth.session.workerId)) } });
  }
  const b = (await req.json().catch(() => null)) as { deviceNow?: unknown; actions?: unknown } | null;
  if (!b || typeof b.deviceNow !== "number" || !Array.isArray(b.actions)) return Response.json({ error: "Send { deviceNow, actions }." }, { status: 400 });
  if (b.actions.length === 0 || b.actions.length > MAX_BATCH) return Response.json({ error: `Send 1 to ${MAX_BATCH} actions.` }, { status: 400 });
  const actions: QueuedAction[] = [];
  for (const raw of b.actions) {
    const q = readQueued(raw);
    if (!q) return Response.json({ error: "An action wasn't in the expected shape." }, { status: 400 });
    actions.push(q);
  }
  if (new Set(actions.map((a) => a.clientId)).size !== actions.length) return Response.json({ error: "Each action needs its own id." }, { status: 400 });
  const r = await syncWorkerActions({ workerId: auth.session.workerId, profileId: auth.session.userId }, shiftId, { deviceNow: b.deviceNow, actions });
  if (!r.ok) return Response.json({ error: r.reason }, { status: /not found/i.test(r.reason) ? 404 : 400 });
  // serverNow lets the phone line its clock up with the server's for its own checks.
  return Response.json({ results: r.results, serverNow: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
