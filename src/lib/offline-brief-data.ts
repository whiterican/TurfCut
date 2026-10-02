import { db } from "@/lib/db";

/**
 * The field pages a worker's phone keeps for dead zones (offline brief,
 * public/sw.js): Today, My shifts, and the shift pages from now through the
 * next two days, soonest first. Every page that turns the brief on sends
 * this same list, since the phone keeps only what's on it.
 */
export async function briefPaths(workerId: string, now = new Date()): Promise<string[]> {
  const soon = await db().shift.findMany({
    where: { engagement: { workerId }, status: { not: "CANCELLED" }, endsAt: { gte: now }, startsAt: { lt: new Date(now.getTime() + 48 * 3_600_000) } },
    select: { id: true },
    orderBy: { startsAt: "asc" },
    take: 10,
  });
  return ["/dashboard", "/shifts", ...soon.map((s) => `/shifts/${s.id}`)];
}
