import { apiArea } from "@/lib/api-session";
import { loadFieldWindow } from "@/lib/field-day-data";
import { summarizeField } from "@/lib/field-live";
import { readJobFilter } from "@/lib/field-turf";

const H = 3_600_000;

/**
 * P1.7: the live counts behind the field page and the Desk hero, polled
 * every few seconds while those pages are visible. Counts and turf zones
 * only: no shift ids, names or positions. Same window as the field page;
 * `?job=<id>` narrows it to one job, as the Field map's filter does (#111).
 */
export async function GET(req: Request) {
  const auth = await apiArea("field", "read");
  if ("error" in auth) return auth.error;
  const now = new Date();
  const job = readJobFilter(new URL(req.url).searchParams.get("job") ?? undefined);
  const rows = await loadFieldWindow(auth.session.orgId, new Date(now.getTime() - 12 * H), new Date(now.getTime() + 24 * H));
  return Response.json(summarizeField(job ? rows.filter((r) => r.jobId === job) : rows, now), { headers: { "cache-control": "private, no-store" } });
}
