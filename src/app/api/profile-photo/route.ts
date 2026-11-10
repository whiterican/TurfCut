import { getSessionProfile } from "@/lib/auth";
import { ownPhoto, supabasePhotoStore } from "@/lib/profile-photo";
import { photoRecords } from "@/lib/profile-photo-data";

/**
 * GET /api/profile-photo — the signed-in person's own profile photo, and
 * nobody else's: there is no id in the address to change. Streamed from the
 * private bucket; never a public or signed link.
 */
export async function GET(req: Request) {
  const session = await getSessionProfile();
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const have = req.headers.get("if-none-match")?.replace(/^W\//, "").replace(/"/g, "") ?? null;
  const photo = await ownPhoto(session.userId, photoRecords(), supabasePhotoStore(), have);
  if (!photo) return Response.json({ error: "No photo." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  // The browser may keep its copy but asks every time (no-cache): after a sign-out on a shared
  // phone the next person is never shown the last person's photo from the browser's own store.
  const headers = { "Cache-Control": "private, no-cache", ETag: `"${photo.tag}"`, Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
  if (photo.unchanged) return new Response(null, { status: 304, headers });
  return new Response(new Blob([photo.bytes as BlobPart], { type: photo.type }), { headers: { ...headers, "Content-Type": photo.type } });
}
