import { getSessionProfile } from "@/lib/auth";
import { UUID_RE } from "@/lib/jobs";
import { chatPhoto, supabasePhotoStore } from "@/lib/profile-photo";
import { photoRecords, photoViewers } from "@/lib/profile-photo-data";

const none = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * GET /api/profile-photo/<profileId> — the photo of someone the signed-in
 * person shares a live chat with (or their own), and never a worker's photo
 * for an organization's staff (lib/profile-photo). Anyone else, a person with no
 * photo and an id that names nobody all get the same 404. Streamed from the
 * private bucket; never a public or signed link.
 */
export async function GET(req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const session = await getSessionProfile();
  if (!session) return none(401, "Sign in required.");
  const profileId = (await params).profileId.toLowerCase();
  if (!UUID_RE.test(profileId)) return none(404, "No photo.");
  const have = req.headers.get("if-none-match")?.replace(/^W\//, "").replace(/"/g, "") ?? null;
  let photo: Awaited<ReturnType<typeof chatPhoto>>;
  try {
    photo = await chatPhoto(session.userId, profileId, photoRecords(), photoViewers(), supabasePhotoStore(), have);
  } catch (e) {
    console.error("[turfcut] reading a chat photo failed", e);
    return none(503, "The photo can't be shown right now.");
  }
  if (!photo) return none(404, "No photo.");
  // Asked for every time (no-cache): someone removed from the chat, or blocked, stops being shown it at once.
  const headers = { "Cache-Control": "private, no-cache", ETag: `"${photo.tag}"`, Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
  if (photo.unchanged) return new Response(null, { status: 304, headers });
  return new Response(new Blob([photo.bytes as BlobPart], { type: photo.type }), { headers: { ...headers, "Content-Type": photo.type } });
}
