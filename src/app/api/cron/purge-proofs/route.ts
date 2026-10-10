import { createHash, timingSafeEqual } from "node:crypto";
import { missingProofSettings } from "@/lib/env";
import { purgeProofs } from "@/lib/proof-data";

/**
 * GET /api/cron/purge-proofs — the daily purge of credential photos
 * (C3.6b): deletes every photo whose credential was removed or no longer
 * takes one, whose training is over a year old, or whose worker closed the
 * account, and removes any deleted photo's file still stored. Vercel Cron
 * calls it (vercel.json) with `Authorization: Bearer $CRON_SECRET`;
 * anything else is refused.
 */
/** Compared in constant time, as digests, so the length and bytes of the secret can't be felt out. */
const sameSecret = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[turfcut] proof purge refused: CRON_SECRET is not set");
    return Response.json({ error: "Not configured." }, { status: 503 });
  }
  if (!sameSecret(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return Response.json({ error: "Not found." }, { status: 404 });
  const unset = missingProofSettings();
  if (unset.length) {
    console.error(`[turfcut] proof purge skipped: not configured (${unset.join(", ")})`);
    return Response.json({ error: "Not configured." }, { status: 503 });
  }
  const r = await purgeProofs();
  console.log(`[turfcut] proof purge: ${r.deleted} deleted, ${r.filesRemoved} deleted files checked`);
  return Response.json(r);
}
