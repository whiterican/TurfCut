/* S1 acceptance checks: campaign profiles, posts, talking points, job embeds and the brief, against a fresh database (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import {
  createCampaign, createPost, deletePost, editPost, loadPinned, loadPosts, loadPublicCampaign, loadPublicPost, loadRevisions,
  setCampaignPublished, setJobCampaign, setPostPinned, updateCampaign,
} from "@/lib/campaign-social-data";
import { loadTalkingPoints } from "@/lib/job-brief-data";
import { loadFeed } from "@/lib/jobs-data";
import { MAX_PINNED, PAGE_SIZE } from "@/lib/campaign-social";

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
  const A = { profileId: OWNER, orgId: ORG, manages: true };
  const B = { profileId: OWNER2, orgId: ORG2, manages: true };
  const RECRUITER = "00000000-0000-0000-0000-0000000000dd";
  const R = { profileId: RECRUITER, orgId: ORG, manages: false };
  await p.organization.create({ data: { id: ORG2, name: "Pending Org", approved: false } });
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" }, { id: OWNER2, role: "OWNER", orgId: ORG2 }, { id: RECRUITER, role: "RECRUITER", orgId: ORG }] });
  const jurisdictionId = (await p.job.findUniqueOrThrow({ where: { id: JOB } })).jurisdictionId;
  const otherJob = await p.job.create({ data: { orgId: ORG2, jurisdictionId, type: "PETITION", title: "Other org job", status: "PUBLISHED" } });
  const draftJob = await p.job.create({ data: { orgId: ORG, jurisdictionId, type: "PETITION", title: "Draft job", status: "DRAFT" } });
  // The worker's feed as matching sees it, minus the row's bookkeeping (when it was touched, and which campaign it's linked to, which the feed never reads).
  const feedView = async () => {
    const f = await loadFeed(W1, {});
    return JSON.stringify({ ...f, jobs: f.jobs.map((j) => ({ ...j, updatedAt: undefined, campaignProfileId: undefined })) });
  };
  const feedBefore = await feedView();

  // --- Profiles ---
  const c = await createCampaign(A, { handle: "yes_on_7", displayName: "Yes on 7", bio: "Protected bike lanes.\nhttps://yeson7.org" });
  check("an organization creates a campaign as a draft", c.ok && (await loadPublicCampaign("yes_on_7")) === null, c);
  const id = c.ok ? c.id : "";
  check("a handle is unique", !(await createCampaign(B, { handle: "yes_on_7", displayName: "x", bio: "" })).ok);
  const b = await createCampaign(B, { handle: "pending_c", displayName: "Pending", bio: "" });
  const bPublish = b.ok ? await setCampaignPublished(B, b.id, true) : null;
  check("an organization Turfcut hasn't approved can't publish", !!bPublish && !bPublish.ok && /approved/.test(bPublish.reason), bPublish);
  check("…and another organization can't touch the campaign", !(await updateCampaign(B, id, { handle: "yes_on_7", displayName: "Hijack", bio: "" })).ok && !(await setCampaignPublished(B, id, true)).ok);
  check("publishing makes it public", (await setCampaignPublished(A, id, true)).ok && (await loadPublicCampaign("YES_on_7"))?.id === id);
  const rename = await updateCampaign(A, id, { handle: "yes7", displayName: "Yes on 7", bio: "" });
  check("a public campaign keeps its handle", !rename.ok && /can't change/.test(rename.errors?.handle ?? ""), rename);
  await setCampaignPublished(A, id, false);
  const renameLater = await updateCampaign(A, id, { handle: "yes7", displayName: "Yes on 7", bio: "" });
  check("…even after unpublishing: a handle that was public stays its address", !renameLater.ok, renameLater);
  await setCampaignPublished(A, id, true);
  await p.organization.update({ where: { id: ORG }, data: { approved: false } });
  check("a malformed address is simply not found", (await loadPublicCampaign("%E0%A4")) === null);
  check("a campaign disappears from public while its organization isn't approved", (await loadPublicCampaign("yes_on_7")) === null);
  await p.organization.update({ where: { id: ORG }, data: { approved: true } });
  check("a campaign can't move to another organization (database)", /can't move/.test(await refused(p.campaignProfile.update({ where: { id }, data: { orgId: ORG2 } }))));

  // --- Posts, embeds, revisions ---
  const hiring = await createPost(A, id, { body: "We're hiring circulators. Apply below.", jobId: JOB });
  check("a post embeds one of the organization's published jobs", hiring.ok, hiring);
  check("…not another organization's job", !(await createPost(A, id, { body: "x", jobId: otherJob.id })).ok);
  check("…and not a draft", !(await createPost(A, id, { body: "x", jobId: draftJob.id })).ok);
  check("the database refuses an embed of another organization's job", /own organization/.test(await refused(p.campaignPost.create({ data: { profileId: id, authorId: OWNER, body: "x", jobId: otherJob.id } }))));
  check("the database refuses a post over 500 characters or blank", /check constraint/.test(await refused(p.campaignPost.create({ data: { profileId: id, authorId: OWNER, body: "x".repeat(501) } }))) && /check constraint/.test(await refused(p.campaignPost.create({ data: { profileId: id, authorId: OWNER, body: "   " } }))));
  const hid = hiring.ok ? hiring.id : "";
  await editPost(A, hid, { body: "We're hiring circulators for the final push. Apply below.", jobId: JOB });
  const revs = await loadRevisions(ORG, hid);
  check("an edit is a new revision; the first is the post as written", revs.length === 2 && revs[0].body.startsWith("We're hiring circulators.") && revs[1].body.includes("final push"), revs);
  check("revisions are append-only", /append-only/.test(await refused(p.campaignPostRevision.update({ where: { id: revs[0].id }, data: { body: "rewritten" } }))));
  check("another organization can't edit or delete the post", !(await editPost(B, hid, { body: "x", jobId: null })).ok && !(await deletePost(B, hid)).ok);

  // --- Pins: the talking points ---
  const ids: string[] = [hid];
  for (let i = 0; i < 4; i++) {
    const r = await createPost(A, id, { body: `Talking point ${i + 1}`, jobId: null });
    if (r.ok) ids.push(r.id);
  }
  const pins = await Promise.all(ids.slice(1).map((pid) => setPostPinned(A, pid, true)));
  const pinned = await loadPinned(id);
  check(`at most ${MAX_PINNED} talking points, even pinned all at once`, pinned.length === MAX_PINNED && pins.filter((r) => r.ok).length === MAX_PINNED && pins.some((r) => !r.ok && /up to 3/.test(r.reason)), pins);
  const mine = await createPost(R, id, { body: "Recruiter's hiring call.", jobId: null });
  const rEditPin = await editPost(R, pinned[0].id, { body: "Rewritten talking point" });
  const rEditOther = await editPost(R, hid, { body: "Rewritten" });
  const rEditOwn = mine.ok ? await editPost(R, mine.id, { body: "Recruiter's hiring call, edited." }) : null;
  check("a recruiter writes and edits their own posts, but not the talking points or other people's", mine.ok && !rEditPin.ok && /talking point/.test(rEditPin.reason) && !rEditOther.ok && !!rEditOwn?.ok && !(await deletePost(R, pinned[0].id)).ok, { rEditPin, rEditOther, rEditOwn });
  const kept = await editPost(A, hid, { body: "We're hiring circulators for the final push. Apply below!" });
  check("an edit that leaves the embed out keeps it", kept.ok && (await p.campaignPost.findUniqueOrThrow({ where: { id: hid } })).jobId === JOB, kept);
  await deletePost(A, pinned[0].id);
  check("deleting a pinned post unpins it and hides it, keeping the row", (await loadPinned(id)).length === MAX_PINNED - 1 && !(await loadPosts(id)).posts.some((x) => x.id === pinned[0].id) && (await p.campaignPost.findUniqueOrThrow({ where: { id: pinned[0].id } })).deletedById === OWNER);
  check("a deleted post's permalink is gone", (await loadPublicPost("yes_on_7", pinned[0].id)) === null);

  // --- The feed: newest first, every post once, even with tied times ---
  const tied = new Date("2026-09-01T12:00:00.000Z");
  for (let i = 0; i < PAGE_SIZE + 5; i++) await createPost(A, id, { body: `Tied ${i}`, jobId: null }, tied);
  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page: Awaited<ReturnType<typeof loadPosts>> = await loadPosts(id, cursor);
    seen.push(...page.posts.map((x) => x.id));
    cursor = page.next;
    pages++;
  } while (cursor && pages < 10);
  const live = await p.campaignPost.count({ where: { profileId: id, deletedAt: null } });
  const ordered = await p.campaignPost.findMany({ where: { profileId: id, deletedAt: null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
  check("paging returns every live post exactly once, newest first (time is the only order)", seen.length === live && new Set(seen).size === live && JSON.stringify(seen) === JSON.stringify(ordered.map((x) => x.id)), { seen: seen.length, live });

  // --- Embeds read the job as it is now ---
  const open = (await loadPosts(id)).posts.find((x) => x.id === hid) ?? (await loadPublicPost("yes_on_7", hid))?.post;
  await p.job.update({ where: { id: JOB }, data: { status: "CLOSED" } });
  const closed = (await loadPublicPost("yes_on_7", hid))?.post;
  await p.job.update({ where: { id: JOB }, data: { status: "PUBLISHED" } });
  check("an embedded job shows as it is now: open, then no longer hiring with no details", !!open?.job && open.job.id === JOB && !!closed && closed.job === null && closed.jobGone, { open: open?.job?.status, closed });

  // --- The brief ---
  check("a job not linked to a campaign has no talking points", (await loadTalkingPoints(JOB)) === null);
  check("a job links only to its own organization's campaign", !(await setJobCampaign(B, JOB, id)).ok && /own organization/.test(await refused(p.job.update({ where: { id: otherJob.id }, data: { campaignProfileId: id } }))));
  await setJobCampaign(A, JOB, id);
  const brief = await loadTalkingPoints(JOB);
  check("a linked job's brief carries the campaign's pinned posts, verbatim", !!brief && brief.points.length === MAX_PINNED - 1 && brief.points.every((x) => x.body.startsWith("Talking point")), brief);
  check("a job embedded in posts can't move to another organization (database)", /can't move/.test(await refused(p.job.update({ where: { id: JOB }, data: { orgId: ORG2, campaignProfileId: null } }))));

  // --- Public reads through the Data API roles ---
  const anon = await p.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE anon");
    const posts = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "CampaignPost"`);
    const profiles = await tx.$queryRawUnsafe<{ handle: string }[]>(`SELECT "handle" FROM "CampaignProfile"`);
    return { posts: Number(posts[0].n), profiles: profiles.map((x) => x.handle) };
  });
  const author = await refused(p.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE anon");
    return tx.$queryRawUnsafe(`SELECT "authorId" FROM "CampaignPost"`);
  }));
  check("anyone can read published campaigns and their live posts, never drafts, deleted posts or authors", anon.posts === live && JSON.stringify(anon.profiles) === JSON.stringify(["yes_on_7"]) && /permission denied/.test(author), { anon, author });

  // --- Social activity is invisible to matching and the feed ---
  check("a worker's job feed is exactly what it was before any campaign activity", (await feedView()) === feedBefore);
  check("every campaign write is on the audit record", (await p.auditEvent.count({ where: { action: { startsWith: "campaign." } } })) >= 10 && (await p.auditEvent.count({ where: { action: "job.campaign_set" } })) === 1);

  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
