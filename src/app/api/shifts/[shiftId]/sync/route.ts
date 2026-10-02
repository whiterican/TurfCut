import { apiWorker, badId } from "@/lib/api-session";
import { syncWorkerActions } from "@/lib/field-day-data";
import { MAX_BATCH, readQueued, type QueuedAction } from "@/lib/offline-sync";

/**
 * POST /api/shifts/:shiftId/sync { deviceNow, actions: [{ clientId, at, action }] }
 * The worker's phone sends field actions it saved (offline or not), oldest
 * first. Each comes back saved, duplicate (already saved — drop it) or
 * rejected (with the reason to show). Invalid shapes reject the request.
 */
export async function POST(req: Request, { params }: { params: Promise<{ shiftId: string }> }) {
  const { shiftId } = await params;
  const bad = badId(shiftId);
  if (bad) return bad;
  const auth = await apiWorker();
  if ("error" in auth) return auth.error;
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
  return Response.json({ results: r.results }, { headers: { "Cache-Control": "no-store" } });
}
