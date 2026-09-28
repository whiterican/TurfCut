import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Shared Prisma client. Created lazily so `next build` and page renders work
 * without DATABASE_URL set; the first real query throws a clear error.
 */
export function db(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasources: { db: { url: getDatabaseUrl() } },
    });
  }
  return globalForPrisma.prisma;
}
