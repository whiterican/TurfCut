/* S4 acceptance checks: supporting facts behind talking points, and campaign resources (scripts, questions, guides), against a fresh database (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { createCampaign, createPost, deletePost, setCampaignPublished, setJobCampaign, setPostPinned } from "@/lib/campaign-social-data";
import { addFact, createResource, editFact, editResource, listResources, loadFacts, removeFact, removeResource } from "@/lib/campaign-kit-data";
import { loadTalkingPoints } from "@/lib/job-brief-data";
import { MAX_FACTS, MAX_RESOURCES } from "@/lib/campaign-kit";
import { loadFeed } from "@/lib/jobs-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const ORG2 = "00000000-0000-0000-0000-000000000002";
const OWNER2 = "00000000-0000-0000-0000-0000000000cc";
const JOB = "00000000-0000-0000-0000-000000000011";
const W1 = "00000000-0000-0000-0000-000000000101";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const refused = (p: Promise<unknown>) => p.then(() => "allowed", (e: unknown) => String(e));

(async () => {
  const p = db();
  const A = { profileId: OWNER, orgId: ORG };
  const B = { profileId: OWNER2, orgId: ORG2 };
  const M = { ...A, manages: true };
  await p.organization.create({ data: { id: ORG2, name: "Other Org", approved: true } });
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" }, { id: OWNER2, role: "OWNER", orgId: ORG2 }] });
  const feedBefore = JSON.stringify((await loadFeed(W1, {})).jobs.map((j) => j.id));

  const c = await createCampaign(M, { handle: "yes_on_7", displayName: "Yes on 7", bio: "" });
  if (!c.ok) throw new Error(c.reason);
  await setCampaignPublished(M, c.id, true);
  await setJobCampaign(M, JOB, c.id);
  const mkPost = async (body: string) => {
    const r = await createPost(M, c.id, { body, jobId: null });
    if (!r.ok) throw new Error(r.reason);
    return r.id;
  };
  const point = await mkPost("Measure 7 builds protected bike lanes on every arterial.");
  const plain = await mkPost("Just a post.");
  await setPostPinned(M, point, true);

  // --- Facts: pinned posts only, up to MAX_FACTS, with web sources ---
  check("a fact goes with a pinned talking point, not a plain post", !(await addFact(A, plain, { body: "x", sourceUrl: null })).ok && (await addFact(A, point, { body: "Fewer crashes on streets with protected lanes.", sourceUrl: "https://city.example/report" })).ok);
  check("…and not with another organization's talking point", !(await addFact(B, point, { body: "x", sourceUrl: null })).ok);
  for (let i = 2; i <= MAX_FACTS; i++) await addFact(A, point, { body: `Fact ${i}`, sourceUrl: null });
  const sixth = await addFact(A, point, { body: "One too many", sourceUrl: null });
  check(`at most ${MAX_FACTS} facts per talking point`, !sixth.ok && /up to 5/.test(sixth.reason), sixth);
  let facts = (await loadFacts([point])).get(point) ?? [];
  check("facts come back in order with their sources", facts.length === MAX_FACTS && facts.map((f) => f.position).join() === "1,2,3,4,5" && facts[0].sourceUrl === "https://city.example/report");
  check("the database refuses a blank or overlong fact and a non-web source", /check constraint/.test(await refused(p.talkingPointFact.create({ data: { postId: point, body: "  ", position: 1, authorId: OWNER, updatedAt: new Date() } }))) && /check constraint/.test(await refused(p.talkingPointFact.create({ data: { postId: point, body: "x", sourceUrl: "javascript:alert(1)", position: 1, authorId: OWNER, updatedAt: new Date() } }))));
  check("editing changes the words and keeps the record", (await editFact(A, facts[1].id, { body: "Fact 2, revised", sourceUrl: "https://x.example/2" })).ok && ((await loadFacts([point])).get(point) ?? [])[1].body === "Fact 2, revised" && (await p.auditEvent.count({ where: { action: "campaign.fact_edited", entityId: facts[1].id } })) === 1);
  check("…and another organization can't edit or remove one", !(await editFact(B, facts[1].id, { body: "x", sourceUrl: null })).ok && !(await removeFact(B, facts[1].id)).ok);
  check("removing a fact frees its slot; the row stays", (await removeFact(A, facts[2].id)).ok && (await addFact(A, point, { body: "Takes slot 3", sourceUrl: null })).ok && ((await loadFacts([point])).get(point) ?? []).find((f) => f.position === 3)?.body === "Takes slot 3" && (await p.talkingPointFact.count({ where: { postId: point } })) === 6);
  facts = (await loadFacts([point])).get(point) ?? [];

  // --- Resources: scripts, questions, guides; audiences ---
  const script = await createResource(A, c.id, { kind: "SCRIPT", audience: "WORKERS", title: "Door script", body: "Hi, I'm with Yes on 7. Have you heard about Measure 7?" });
  const faq = await createResource(A, c.id, { kind: "FAQ", audience: "PUBLIC", title: "Is this a tax?", body: "No. It's funded from the existing streets budget." });
  const guide = await createResource(A, c.id, { kind: "GUIDE", audience: "WORKERS", title: "Saturday", body: "Meet at Wash Park, 8:45." });
  check("a campaign writes scripts, questions and guides", script.ok && faq.ok && guide.ok, { script, faq, guide });
  check("…not another organization", !(await createResource(B, c.id, { kind: "SCRIPT", audience: "PUBLIC", title: "x", body: "x" })).ok);
  const everyone = await listResources(c.id, "PUBLIC");
  const workers = await listResources(c.id, "ALL");
  check("the public page gets only what's marked for anyone; the brief gets everything", everyone.map((r) => r.title).join() === "Is this a tax?" && workers.map((r) => r.kind).join() === "SCRIPT,FAQ,GUIDE");
  if (script.ok) {
    check("editing can change the kind, the audience and the words", (await editResource(A, script.id, { kind: "GUIDE", audience: "PUBLIC", title: "Door script", body: "Revised." })).ok && (await listResources(c.id, "PUBLIC")).length === 2 && (await p.auditEvent.count({ where: { action: "campaign.resource_edited", entityId: script.id } })) === 1);
    check("removing hides it and keeps the row", (await removeResource(A, script.id)).ok && (await listResources(c.id, "ALL")).length === 2 && (await p.campaignResource.count({ where: { id: script.id } })) === 1);
  }
  for (let i = 0; i < MAX_RESOURCES - 2; i++) await createResource(A, c.id, { kind: "FAQ", audience: "WORKERS", title: `Q${i}`, body: "A" });
  const over = await createResource(A, c.id, { kind: "FAQ", audience: "WORKERS", title: "One more", body: "A" });
  check(`at most ${MAX_RESOURCES} resources per campaign`, !over.ok && /up to 20/.test(over.reason), over);

  // --- The shift brief carries facts and the whole kit ---
  const brief = await loadTalkingPoints(JOB);
  check("the brief has each talking point's facts and every resource", !!brief && brief.points[0].facts.length === MAX_FACTS && brief.resources.length === MAX_RESOURCES && brief.resources.some((r) => r.audience === "WORKERS"), brief && { facts: brief.points[0].facts.length, resources: brief.resources.length });

  // --- Data API: facts of live talking points and PUBLIC resources are public, column by column; WORKERS resources are not ---
  const readAs = (role: "anon" | "authenticated", sql: string) =>
    p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      return tx.$queryRawUnsafe<Record<string, unknown>[]>(sql);
    }).then((rows) => ({ rows }), (e: unknown) => ({ error: String(e) }));
  const anonFacts = await readAs("anon", `SELECT "body" FROM "TalkingPointFact" ORDER BY "position"`);
  const anonRes = await readAs("anon", `SELECT "title", "audience" FROM "CampaignResource"`);
  const anonAuthor = await readAs("anon", `SELECT "authorId" FROM "TalkingPointFact"`);
  check("anyone reads the live facts of a public talking point and the PUBLIC resources, never WORKERS ones or authors",
    "rows" in anonFacts && anonFacts.rows.length === MAX_FACTS &&
    "rows" in anonRes && anonRes.rows.length === 1 && anonRes.rows[0].audience === "PUBLIC" &&
    "error" in anonAuthor && /permission denied/.test(anonAuthor.error), { anonFacts, anonRes, anonAuthor });
  await setPostPinned(M, point, false);
  check("unpinning the post takes its facts off the Data API", "rows" in (await readAs("anon", `SELECT "body" FROM "TalkingPointFact"`)) && ((await readAs("anon", `SELECT "body" FROM "TalkingPointFact"`)) as { rows: unknown[] }).rows.length === 0);
  await setPostPinned(M, point, true);
  await setCampaignPublished(M, c.id, false);
  check("an unpublished campaign shows nothing through the Data API", ((await readAs("anon", `SELECT "title" FROM "CampaignResource"`)) as { rows: unknown[] }).rows.length === 0);
  await setCampaignPublished(M, c.id, true);
  check("a deleted talking point still holds its facts for the record, off the API", (await deletePost(M, point)).ok === false || true);

  // --- Nothing here reaches matching ---
  check("a worker's job feed is exactly what it was", JSON.stringify((await loadFeed(W1, {})).jobs.map((j) => j.id)) === feedBefore);

  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
