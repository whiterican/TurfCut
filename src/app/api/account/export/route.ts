import { NextResponse } from "next/server";
import { apiWorker } from "@/lib/api-session";
import { exportAccount } from "@/lib/account-data";
import { zipFile } from "@/lib/zip";

/** GET /api/account/export — the signed-in worker's own data, as a ZIP of JSON and CSV. */
export async function GET() {
  const auth = await apiWorker();
  if ("error" in auth) return auth.error;
  const now = new Date();
  const files = await exportAccount({ userId: auth.session.userId, workerId: auth.session.workerId, email: auth.session.email }, now);
  const zip = zipFile(files);
  return new NextResponse(new Blob([zip as BlobPart], { type: "application/zip" }), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="turfcut-my-data-${now.toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
