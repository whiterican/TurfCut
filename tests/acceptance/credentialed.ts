/* Hiring checks credentials (src/lib/job-credentials.ts): a worker applying to or claiming a job that needs a circulator
   registration, a badge or an affidavit status must hold them. The checks that are about something else give their
   workers a current Colorado set first, self-reported, as a worker would add it on Profile → Credentials. */
import type { PrismaClient } from "@prisma/client";

export async function credentialed(p: PrismaClient, workerIds: string[]): Promise<void> {
  const expiresOn = new Date(Date.UTC(new Date().getUTCFullYear() + 2, 0, 1));
  await p.workerCredential.createMany({
    data: workerIds.flatMap((workerId) => [
      { workerId, kind: "CIRCULATOR_REGISTRATION" as const, state: "CO", expiresOn, actorId: workerId },
      { workerId, kind: "NOTARY_OR_AFFIDAVIT" as const, state: "CO", actorId: workerId },
      { workerId, kind: "OTHER" as const, label: "Badge", actorId: workerId },
    ]),
  });
}
