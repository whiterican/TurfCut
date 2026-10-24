/* P1.6 acceptance checks: saved and hidden jobs are the worker's own, append-only and server-only (tests/acceptance/run.sh p1). */
import { db } from "@/lib/db";
import { loadMarks, markJob } from "@/lib/job-marks-data";
import { applyMarks } from "@/lib/job-marks";
import { loadFeed } from "@/lib/jobs-data";

const JOB = "00000000-0000-0000-0000-000000000011"; // published (seed)
const W1 = "00000000-0000-0000-0000-000000000101";
const W2 = "00000000-0000-0000-0000-000000000102";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const refused = (p: Promise<unknown>) => p.then(() => "allowed", (e: unknown) => String(e));

(async () => {
  const p = db();
  const feedBefore = JSON.stringify((await loadFeed(W1, {})).jobs.map((j) => j.id));

  // --- Marks are the worker's own, idempotent, and never rank ---
  check("saving an open job works, twice is still one open row", (await markJob(W1, JOB, "save")).ok && (await markJob(W1, JOB, "save")).ok && (await p.savedJob.count({ where: { workerId: W1, jobId: JOB, removedAt: null } })) === 1);
  check("the other worker's marks are empty", (await loadMarks(W2)).saved.size === 0 && (await loadMarks(W2)).hidden.size === 0);
  check("the feed's data layer is unchanged by a save (a mark is not a rank)", JSON.stringify((await loadFeed(W1, {})).jobs.map((j) => j.id)) === feedBefore);
  check("hiding removes the job from the worker's shown list and keeps the save", (await markJob(W1, JOB, "hide")).ok && !applyMarks((await loadFeed(W1, {})).jobs, await loadMarks(W1)).shown.some((j) => j.id === JOB) && (await loadMarks(W1)).saved.has(JOB));
  check("unhiding brings it back, still saved", (await markJob(W1, JOB, "unhide")).ok && applyMarks((await loadFeed(W1, {})).jobs, await loadMarks(W1)).shown.some((j) => j.id === JOB) && (await loadMarks(W1)).saved.has(JOB));
  check("unsaving ends the row; saving again starts a new one", (await markJob(W1, JOB, "unsave")).ok && !(await loadMarks(W1)).saved.has(JOB) && (await markJob(W1, JOB, "save")).ok && (await p.savedJob.count({ where: { workerId: W1, jobId: JOB } })) === 2);
  check("a draft or unknown job can't be saved or hidden", !(await markJob(W1, "00000000-0000-0000-0000-0000000000ff", "save")).ok && !(await markJob(W1, "nope", "hide")).ok);

  // --- Append-only: a row ends once and is never deleted ---
  const open = await p.savedJob.findFirstOrThrow({ where: { workerId: W1, jobId: JOB, removedAt: null } });
  check("a mark can't be deleted", /append-only/.test(await refused(p.savedJob.delete({ where: { id: open.id } }))));
  check("a mark can't be rewritten", /append-only/.test(await refused(p.savedJob.update({ where: { id: open.id }, data: { jobId: "00000000-0000-0000-0000-000000000012" } }))));
  check("a mark can't be reopened once ended", /append-only/.test(await refused((async () => { await markJob(W1, JOB, "unsave"); const ended = await p.savedJob.findFirstOrThrow({ where: { id: open.id } }); await p.savedJob.update({ where: { id: ended.id }, data: { removedAt: null } }); })())));

  // --- Server-only: nothing through the Data API roles ---
  for (const t of ["SavedJob", "DismissedJob"]) {
    const rows = await p.$queryRawUnsafe<Array<{ grantee: string }>>(`SELECT grantee FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name = '${t}' AND grantee IN ('anon', 'authenticated')`);
    const rls = await p.$queryRawUnsafe<Array<{ relrowsecurity: boolean }>>(`SELECT relrowsecurity FROM pg_class WHERE relname = '${t}'`);
    const policies = await p.$queryRawUnsafe<Array<{ policyname: string }>>(`SELECT policyname FROM pg_policies WHERE tablename = '${t}'`);
    check(`${t}: no API grants, RLS on, no policies`, rows.length === 0 && rls[0]?.relrowsecurity === true && policies.length === 0, { rows, rls, policies });
  }

  console.log(fails ? `\n${fails} check(s) FAILED` : "\nAll P1.6 checks passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
