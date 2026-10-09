import type { NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { missingProofSettings } from "@/lib/env";
import { openProof, type Viewer } from "@/lib/proof-data";

/**
 * GET /api/credential-proofs/:proofId[?download=1] — a credential photo,
 * streamed to someone signed in who may see it (C3.6b): the worker, or an
 * owner or compliance member of an organization that hired them, for a
 * photo the worker shared. Never a public or signed link; every look by an
 * organization is recorded and shown to the worker. Anything else reads as
 * not found.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ proofId: string }> }) {
  const { proofId } = await params;
  const session = await getSessionProfile();
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  const viewer: Viewer | null =
    session.role === "WORKER" && session.workerId
      ? { kind: "worker", workerId: session.workerId, profileId: session.userId }
      : session.orgId
        ? { kind: "staff", profileId: session.userId, orgId: session.orgId, role: session.role }
        : null;
  if (!viewer) return Response.json({ error: "Photo not found." }, { status: 404 });
  const unset = missingProofSettings();
  if (unset.length) {
    console.error(`[turfcut] proof photo refused: not configured (${unset.join(", ")})`);
    return Response.json({ error: "Credential photos aren't available on this server yet." }, { status: 503 });
  }
  const download = req.nextUrl.searchParams.get("download") === "1";
  const photo = await openProof(viewer, proofId, download ? "download" : "view");
  if (!photo) return Response.json({ error: "Photo not found." }, { status: 404 });
  return new Response(new Blob([photo.bytes as BlobPart], { type: "image/jpeg" }), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${photo.filename}"`,
      // Never cached anywhere: each look is checked and recorded.
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
    },
  });
}
