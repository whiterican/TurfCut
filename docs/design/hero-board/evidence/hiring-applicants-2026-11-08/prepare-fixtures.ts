import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";
import { applyToJob } from "@/lib/engagements-data";

const p = db();
async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55438" || url.pathname !== "/turfcut_acc_c3" || url.search !== "") throw Error("Codex local test database only");
  const job = await p.job.findFirstOrThrow({ where: { title: "Applicants job", orgId: "00000000-0000-0000-0000-000000000001", status: "PUBLISHED" } });
  const workers = [];
  for (const letter of ["A", "B"]) {
    const id = randomUUID();
    const displayName = `Selection fixture ${letter} ${id.slice(0, 8)} (local)`;
    await p.profile.create({ data: { id, role: "WORKER" } });
    await p.worker.create({ data: { id, profileId: id, displayName } });
    const result = await applyToJob(id, id, job.id);
    if (!result.ok || !("engagementId" in result)) throw Error(JSON.stringify(result));
    workers.push({ id, displayName, engagementId: result.engagementId });
  }
  const emptyJob = await p.job.findFirst({ where: { orgId: job.orgId, engagements: { none: {} } }, select: { id: true, title: true } });
  const data = { jobId: job.id, workers, emptyJob, fixture: "Two new fictional local workers apply through applyToJob. No political preferences supplied. A browser test marks one application in review after checking failure preservation." };
  writeFileSync(process.env.CASES_PATH || "/tmp/turfcut-applicants-cases.json", JSON.stringify(data, null, 2));
  console.log(JSON.stringify(data));
}
main().finally(() => p.$disconnect());
