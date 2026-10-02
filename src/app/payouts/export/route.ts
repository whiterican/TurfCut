import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { PAY_ROLES } from "@/lib/access";
import { exportLedger } from "@/lib/pay-data";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Finance export (spec p.11, p.15): the organization's pay lines recorded
 * between two dates (inclusive), as CSV. Owners and finance only.
 */
export async function GET(req: Request) {
  const s = await getSessionProfile();
  if (!s) return new NextResponse("Sign in to export pay records.", { status: 401 });
  if (!PAY_ROLES.includes(s.role) || !s.orgId) return new NextResponse("Only owners and finance can export pay records.", { status: 403 });
  const q = new URL(req.url).searchParams;
  const [from, to] = [q.get("from") ?? "", q.get("to") ?? ""];
  if (!DAY.test(from) || !DAY.test(to)) return new NextResponse("Pick a start and end date.", { status: 400 });
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return new NextResponse("The end date must be on or after the start date.", { status: 400 });
  if (end.getTime() - start.getTime() > 400 * 86_400_000) return new NextResponse("Export at most about a year at a time.", { status: 400 });
  const csv = await exportLedger(s.orgId, start, end);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="turfcut-pay-${from}-to-${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
