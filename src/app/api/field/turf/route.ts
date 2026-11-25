import { revalidatePath } from "next/cache";
import { apiArea, fromAnotherSite } from "@/lib/api-session";
import { assignShiftTurf } from "@/lib/field-day-data";
import { assignMessage, readAssignment } from "@/lib/turf-assign";

/**
 * Give a drawn turf to the workers on the chosen shifts, or clear it (`polygon: null`), from the Field map.
 * Whoever may schedule shifts may set their turf; seeing the Field map alone is not enough. Everything is checked
 * again here: the page's choices are only a request. All the shifts change or none.
 * Body: `{ shiftIds: string[], polygon: GeoJSON Polygon | null }`. Answers `{ ok: true, message }`, or `{ error }`
 * with the reason in words the panel shows as they are.
 */
export async function POST(req: Request) {
  // This used to be a server action, which Next only accepts from the site's own pages. Kept.
  if (fromAnotherSite(req)) return Response.json({ error: "This request didn't come from Turfcut." }, { status: 403 });
  let auth;
  try {
    auth = await apiArea("scheduling");
  } catch (e) {
    console.error("[turfcut] assign turf: session check failed", e);
    // Nothing has run yet, so this much is known. Said, or the panel could only say "it may or may not have saved".
    return Response.json({ error: "Couldn't check your sign-in just now. Nothing was changed. Try again." }, { status: 503 });
  }
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => null)) as { shiftIds?: unknown; polygon?: unknown } | null;
  if (!body || typeof body !== "object" || !("polygon" in body)) return Response.json({ error: "Send { shiftIds, polygon }." }, { status: 400 });
  const want = readAssignment(body.shiftIds, body.polygon);
  if (!want.ok) return Response.json({ error: want.reason }, { status: 400 });
  // The panel gives a save up after a while and may send another. One that was given up before it began is not begun
  // now, where the platform passes that on: it must not land after its replacement.
  if (req.signal.aborted) return Response.json({ error: "The request was given up before it began. Nothing was changed." }, { status: 408 });
  let r;
  try {
    r = await assignShiftTurf({ profileId: auth.session.userId, orgId: auth.session.orgId }, want.shiftIds, want.turf);
  } catch (e) {
    console.error("[turfcut] assign turf failed", e);
    // The transaction did not commit, so this much is known.
    return Response.json({ error: "Couldn't save the turf. Nothing was changed. Try again." }, { status: 500 });
  }
  if (!r.ok) return Response.json({ error: r.reason }, { status: /not found/i.test(r.reason) ? 404 : 409 });
  revalidatePath("/field");
  for (const id of want.shiftIds) revalidatePath(`/shifts/${id}`);
  return Response.json({ ok: true, message: assignMessage(want.turf !== null, r.count, r.unchanged) }, { headers: { "cache-control": "private, no-store" } });
}
