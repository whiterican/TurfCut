import { requireRole } from "@/lib/auth";

/** Signed-in worker with a linked Worker row, or a redirect. */
export async function requireWorker(): Promise<{ workerId: string; userId: string }> {
  const session = await requireRole(["WORKER"]);
  if (!session.workerId) {
    throw new Error("This login isn't linked to a worker profile yet.");
  }
  return { workerId: session.workerId, userId: session.userId };
}
