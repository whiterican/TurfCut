/**
 * Pieces of the walkbook loaders that both staff and workers use, with
 * nothing sensitive in them: who may hold a book, which book a worker holds
 * now, and the explicit address fields a stop is read with. This file is on
 * the isolation test's guarded list, so it can never name the import tables
 * or the stored columns (src/lib/walkbook-isolation.test.ts).
 */
import { db } from "@/lib/db";

/** Confirmed workers: hired on the job (accepted offer or instant claim). */
export const HIRED = ["ACTIVE", "CLAIMED"] as const;

/** The newest assignment row of each walkbook: who holds it now. */
export async function holders(walkbookIds: string[]) {
  if (!walkbookIds.length) return new Map<string, { engagementId: string | null; at: Date }>();
  // DISTINCT ON in the database: one row per book, however long its history grows.
  const rows = await db().$queryRaw<Array<{ walkbookId: string; engagementId: string | null; createdAt: Date }>>`
    SELECT DISTINCT ON ("walkbookId") "walkbookId", "engagementId", "createdAt"
    FROM "public"."WalkbookAssignment"
    WHERE "walkbookId" = ANY(${walkbookIds}::uuid[])
    ORDER BY "walkbookId", "createdAt" DESC`;
  return new Map(rows.map((r) => [r.walkbookId, { engagementId: r.engagementId, at: r.createdAt }]));
}

/** What a stop shows where its address used to be, once the import's names and addresses are deleted. */
export const NO_ADDRESS = { line1: "", unit: null, city: "", state: "", zip: "", lat: null, lng: null } as const;
/** A stop's address fields, flat, with `purged` set when the address is gone. Explicit fields only: the import's stored columns are never selected here. */
export const flat = (a: { line1: string; unit: string | null; city: string; state: string; zip: string; lat: number | null; lng: number | null } | null) => ({ ...(a ?? NO_ADDRESS), purged: a === null });

export const STOP_SELECT = {
  id: true,
  stopNumber: true,
  address: { select: { line1: true, unit: true, city: true, state: true, zip: true, lat: true, lng: true } },
} as const;

