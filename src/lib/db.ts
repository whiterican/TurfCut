import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl } from "@/lib/env";
import { voterDataGuard } from "@/lib/voter-data-guard";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Shared Prisma client. Created lazily so `next build` and page renders work
 * without DATABASE_URL set; the first real query throws a clear error.
 * Reads of imported voter data outside the importer, the purge and the staff
 * export are refused (src/lib/voter-data-guard.ts).
 */
export function db(): PrismaClient {
  if (!globalForPrisma.prisma) {
    // Every query goes through the voter-data guard. It only adds query hooks and no models or methods, so the
    // extended client has PrismaClient's shape and the cast is sound.
    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url: getDatabaseUrl() } },
    }).$extends(voterDataGuard) as unknown as PrismaClient;
  }
  return globalForPrisma.prisma;
}
