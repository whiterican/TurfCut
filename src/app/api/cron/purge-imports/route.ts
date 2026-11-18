import { createHash, timingSafeEqual } from "node:crypto";
import { purgeDueImports } from "@/lib/walkbooks-data";

/**
 * GET /api/cron/purge-imports: the daily deletion of imported names and
 * addresses (W1). An imported file keeps every column, so its rows (addresses,
 * record IDs and every other column) are deleted 30 days after the import, or
 * sooner when every job it was cut for has closed. The stops, their outcomes
 * and poll answers stay, keyed by walkbook and stop number. Vercel Cron calls
 * it (vercel.json) with `Authorization: Bearer $CRON_SECRET`; anything else is
 * refused. An organization can also delete a file's data itself at any time.
 */
/** The purge works within a time budget (45 s); give the function room for it. */
export const maxDuration = 60;

/** Compared in constant time, as digests, so the length and bytes of the secret can't be felt out. */
const sameSecret = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[turfcut] import purge refused: CRON_SECRET is not set");
    return Response.json({ error: "Not configured." }, { status: 503 });
  }
  if (!sameSecret(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return Response.json({ error: "Not found." }, { status: 404 });
  const r = await purgeDueImports();
  // Counts only: nothing about whose data or what it held goes in a log.
  console.log(`[turfcut] import purge: ${r.purged} files, ${r.addresses} addresses deleted, ${r.failed} failed`);
  return Response.json(r, { status: r.failed ? 500 : 200 });
}
