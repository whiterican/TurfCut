import { db } from "@/lib/db";

/**
 * GET /api/health — is the app up, and can it reach its database? For an uptime monitor (and a person
 * checking after a deploy). It answers 200 {"ok":true} when a trivial query succeeds within a few seconds
 * and 503 otherwise. No session, no settings and nothing about the data are in the answer: what is
 * missing is named in the server's log ("[turfcut] health: …"), never to the caller. The proxy skips it
 * (src/proxy.ts), so a failing sign-in service cannot hide a working site, or the other way round.
 */
export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "no-store" };
const WAIT_MS = 4000;

export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db().$queryRaw`select 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer from the database in ${WAIT_MS}ms`)), WAIT_MS);
      }),
    ]);
    return Response.json({ ok: true }, { headers: HEADERS });
  } catch (e) {
    console.error("[turfcut] health: database check failed:", e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 503, headers: HEADERS });
  } finally {
    clearTimeout(timer);
  }
}
