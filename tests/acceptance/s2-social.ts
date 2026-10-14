/* S2 acceptance checks: follows, the home feed, likes and their privacy, against a fresh database (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { createCampaign, createPost, deletePost, setCampaignPublished, setJobCampaign } from "@/lib/campaign-social-data";
import { campaignsOn, feedCampaigns, followState, likeCounts, likedPostIds, loadHomeFeed, newFeedCount, openFollows, setFollow, setLike } from "@/lib/campaign-follow-data";
import { FEED_PAGE_SIZE } from "@/lib/campaign-follow";
import { loadFeed } from "@/lib/jobs-data";
import { loadScorecard } from "@/lib/scorecard-data";
import { loadNotifications, unreadNotifications } from "@/lib/notifications-data";
import { postNoticeText } from "@/lib/campaign-follow";

const ORG = "00000000-0000-0000-0000-000000000001";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const ORG2 = "00000000-0000-0000-0000-000000000002";
const OWNER2 = "00000000-0000-0000-0000-0000000000cc";
const JOB = "00000000-0000-0000-0000-000000000011"; // W1 is ACTIVE on it (seed)
const W1 = "00000000-0000-0000-0000-000000000101";
const W2 = "00000000-0000-0000-0000-000000000102";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const refused = (p: Promise<unknown>) => p.then(() => "allowed", (e: unknown) => String(e));

(async () => {
  const p = db();
  const A = { profileId: OWNER, orgId: ORG, manages: true };
  const B = { profileId: OWNER2, orgId: ORG2, manages: true };
  await p.organization.create({ data: { id: ORG2, name: "Other Org", approved: true } });
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" }, { id: OWNER2, role: "OWNER", orgId: ORG2 }] });
  // What matching and the scorecard see of W1, before any social activity.
  const matchingView = async () => {
    const f = await loadFeed(W1, {});
    const s = await loadScorecard(W1);
    return JSON.stringify({ jobs: f.jobs.map((j) => ({ ...j, updatedAt: undefined, campaignProfileId: undefined })), scorecard: { ...s, computedAt: undefined } });
  };
  const before = await matchingView();

  // --- Campaigns: one hiring W1 (linked to the seed job), one followed, one unapproved, one draft ---
  const mk = async (actor: typeof A, handle: string) => {
    const c = await createCampaign(actor, { handle, displayName: handle, bio: "" });
    if (!c.ok) throw new Error(c.reason);
    return c.id;
  };
  const hiring = await mk(A, "yes_on_7");
  const followed = await mk(B, "other_campaign");
  const draft = await mk(A, "draft_campaign");
  await setCampaignPublished(A, hiring, true);
  await setCampaignPublished(B, followed, true);
  await setJobCampaign(A, JOB, hiring);

  // --- Follows ---
  check("a worker follows a public campaign", (await setFollow(W1, followed, { follow: true })).ok && (await followState(W1, followed)).following);
  check("following again changes nothing", (await setFollow(W1, followed, { follow: true })).ok && (await p.campaignFollow.count({ where: { workerId: W1, campaignId: followed } })) === 1);
  check("a draft campaign can't be followed", !(await setFollow(W1, draft, { follow: true })).ok);
  check("nor one that doesn't exist", !(await setFollow(W1, "00000000-0000-0000-0000-00000000dead", { follow: true })).ok && !(await setFollow(W1, "nope", { follow: true })).ok);
  check("turning notices on closes the row and opens a new one (rows never change)", (await setFollow(W1, followed, { follow: true, notify: true })).ok && (await followState(W1, followed)).notify && (await p.campaignFollow.count({ where: { workerId: W1, campaignId: followed } })) === 2 && (await p.campaignFollow.count({ where: { workerId: W1, campaignId: followed, revokedAt: null } })) === 1);
  check("the database refuses a second open follow", /unique|duplicate/i.test(await refused(p.campaignFollow.create({ data: { workerId: W1, campaignId: followed } }))));
  const open = await p.campaignFollow.findFirstOrThrow({ where: { workerId: W1, campaignId: followed, revokedAt: null } });
  check("the database refuses changing a follow row", /append-only/.test(await refused(p.campaignFollow.update({ where: { id: open.id }, data: { notify: false } }))));
  check("…or deleting one", /append-only/.test(await refused(p.campaignFollow.delete({ where: { id: open.id } }))));
  await setCampaignPublished(B, followed, false);
  check("a campaign that went private can still have notices turned off, and be unfollowed", (await setFollow(W1, followed, { follow: true, notify: false })).ok && !(await followState(W1, followed)).notify && (await openFollows(W1)).length === 0 && (await setFollow(W1, followed, { follow: false })).ok && !(await followState(W1, followed)).following);
  check("…but not followed", !(await setFollow(W1, followed, { follow: true })).ok);
  await setCampaignPublished(B, followed, true);
  await setFollow(W1, followed, { follow: true, notify: true });
  check("unfollowing closes the row; the history stays", (await setFollow(W1, followed, { follow: false })).ok && (await p.campaignFollow.count({ where: { workerId: W1, campaignId: followed, revokedAt: { not: null } } })) === 4);
  await setFollow(W1, followed, { follow: true });

  // --- The feed: followed + hiring campaigns, newest first, by keyset ---
  const posts: string[] = [];
  for (let i = 0; i < FEED_PAGE_SIZE + 3; i++) {
    const r = await createPost(i % 2 ? A : B, i % 2 ? hiring : followed, { body: `Post ${i + 1}`, jobId: i === 1 ? JOB : null });
    if (!r.ok) throw new Error(r.reason);
    posts.push(r.id);
    await p.campaignPost.update({ where: { id: r.id }, data: { createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)) } });
  }
  await createPost(A, draft, { body: "Draft campaign post", jobId: null });
  const sources = await feedCampaigns(W1);
  check("the feed draws from the campaign that hired the worker and the one they follow, with the reason", sources.get(hiring) === "hired" && sources.get(followed) === "following" && sources.size === 2, [...sources]);
  const page1 = await loadHomeFeed(W1);
  const page2 = await loadHomeFeed(W1, page1.next);
  const all = [...page1.posts, ...page2.posts];
  check("…newest first, 20 a page, then the rest, nothing from the draft campaign", page1.posts.length === FEED_PAGE_SIZE && page2.posts.length === 3 && page2.next === null && all.every((x, i) => i === 0 || x.createdAt <= all[i - 1].createdAt) && !all.some((x) => x.body === "Draft campaign post"), { p1: page1.posts.length, p2: page2.posts.length });
  check("…time is the only order: the same posts, as the database orders them by time", JSON.stringify(all.map((x) => x.id)) === JSON.stringify((await p.campaignPost.findMany({ where: { profileId: { in: [hiring, followed] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } })).map((x) => x.id)));
  check("a job embed rides along with Apply (the job is open)", !!all.find((x) => x.jobId === JOB)?.job);
  check("a junk cursor reads as the first page", (await loadHomeFeed(W1, "not-a-cursor")).posts.length === FEED_PAGE_SIZE);
  await deletePost(B, posts[0]);
  check("a deleted post leaves the feed", !(await loadHomeFeed(W1)).posts.some((x) => x.id === posts[0]) && (await loadHomeFeed(W1, page1.next)).posts.length === 2);
  check("a worker with nothing to follow has an empty feed, not someone else's", (await loadHomeFeed(W2)).sources === 0);
  check("Today's strip: the campaign whose job the worker is on", JSON.stringify((await campaignsOn(W1)).map((c) => c.handle)) === JSON.stringify(["yes_on_7"]) && (await campaignsOn(W2)).length === 0);
  check("new posts since a time are counted, capped", (await newFeedCount(W1, null)) === 10 && (await newFeedCount(W1, new Date(Date.UTC(2026, 9, 1, 0, 20)))) === 2 && (await newFeedCount(W2, null)) === 0);

  // --- Likes ---
  const liked = posts[posts.length - 1]; // the newest: on the first page
  check("a worker likes a live post", (await setLike(W1, liked, true)).ok && (await likedPostIds(W1, [liked])).has(liked));
  check("liking again changes nothing", (await setLike(W1, liked, true)).ok && (await p.postLike.count({ where: { workerId: W1, postId: liked } })) === 1);
  check("the feed carries the worker's own like state", (await loadHomeFeed(W1)).posts.find((x) => x.id === liked)?.liked === true);
  check("a deleted post can't be liked", !(await setLike(W1, posts[0], true)).ok);
  await setLike(W2, liked, true);
  const counts = await likeCounts(ORG2, [liked, posts[2]]); // the newest post is the followed campaign's
  check("the campaign sees a total per post, nothing about who", counts.get(liked) === 2 && counts.get(posts[2]) === undefined);
  check("…and only for its own posts", (await likeCounts(ORG, [liked])).size === 0);
  check("unliking closes the row; liking again opens another", (await setLike(W1, liked, false)).ok && !(await likedPostIds(W1, [liked])).has(liked) && (await setLike(W1, liked, true)).ok && (await p.postLike.count({ where: { workerId: W1, postId: liked } })) === 2);
  const like = await p.postLike.findFirstOrThrow({ where: { workerId: W1, postId: liked, removedAt: null } });
  check("the database refuses changing or deleting a like", /append-only/.test(await refused(p.postLike.update({ where: { id: like.id }, data: { workerId: W2 } }))) && /append-only/.test(await refused(p.postLike.delete({ where: { id: like.id } }))));

  // --- Notices of new posts (S2.4) ---
  const pw1 = (await p.worker.findUniqueOrThrow({ where: { id: W1 }, select: { profileId: true } })).profileId;
  const pw2 = (await p.worker.findUniqueOrThrow({ where: { id: W2 }, select: { profileId: true } })).profileId;
  await setFollow(W1, followed, { follow: true, notify: true });
  await setFollow(W2, followed, { follow: true });
  const noticed = (pid: string) => p.notification.count({ where: { recipientId: pid, kind: "CAMPAIGN_POST" } });
  const at = new Date(); // one moment for every post here, so the day's cap can't straddle midnight
  const n0 = await noticed(pw1);
  const first = await createPost(B, followed, { body: `A new canvass weekend starts Saturday. ${"Details ".repeat(30)}`, jobId: null }, at);
  if (!first.ok) throw new Error(first.reason);
  check("a post reaches a follower who asked for notices", (await noticed(pw1)) === n0 + 1);
  check("…but not one who follows without notices", (await noticed(pw2)) === 0);
  const more: string[] = [];
  for (let i = 0; i < 3; i++) { const r = await createPost(B, followed, { body: `Update ${i + 1}`, jobId: null }, at); if (r.ok) more.push(r.id); }
  check("at most 3 notices a day from one campaign", (await noticed(pw1)) === n0 + 3);
  await createPost(A, hiring, { body: "From the campaign whose job W1 is on", jobId: null }, at);
  check("working a campaign's job doesn't send its posts as notices (only asking does)", (await noticed(pw1)) === n0 + 3);
  const viewer = { userId: pw1, role: "WORKER" as const, workerId: W1, orgId: null };
  const listed = (await loadNotifications(viewer)).filter((n) => n.post);
  const t = listed[0]?.post ? postNoticeText(listed[0].post) : null;
  check("the worker's notices list them, in the campaign's words, linked to the post", listed.length === 3 && !!t && t.href === `/c/other_campaign/p/${listed[0].post!.id}` && t.text.startsWith("other_campaign posted: “") && t.text.length < 140, t);
  const unread0 = await unreadNotifications(viewer);
  check("…and count on the bell", unread0 >= 3);
  await deletePost(B, first.id);
  check("a deleted post takes its notice off the list and the bell", (await loadNotifications(viewer)).filter((n) => n.post).length === 2 && (await unreadNotifications(viewer)) === unread0 - 1);
  await setCampaignPublished(B, followed, false);
  check("a campaign gone private hides its notices", (await loadNotifications(viewer)).filter((n) => n.post).length === 0);
  await setCampaignPublished(B, followed, true);
  check("…and they come back when it's public again", (await loadNotifications(viewer)).filter((n) => n.post).length === 2);
  const staff = { userId: OWNER2, role: "OWNER" as const, workerId: null, orgId: ORG2 };
  check("the campaign's staff never see who was notified", !(await loadNotifications(staff)).some((n) => n.post));
  check("the database refuses a post notice without its post, or a hiring notice about a post",
    /Notification_subject/.test(await refused(p.notification.create({ data: { recipientId: pw1, kind: "CAMPAIGN_POST" } }))) &&
    /Notification_subject/.test(await refused(p.notification.create({ data: { recipientId: pw1, kind: "OFFER_RECEIVED", postId: more[0] } }))));

  // --- Privacy: nothing readable through the Data API ---
  const readAs = (role: "anon" | "authenticated", sub: string | null, sql: string) =>
    refused(p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      if (sub) await tx.$executeRawUnsafe(`SELECT set_config('request.jwt.claim.sub', '${sub}', true)`);
      return tx.$queryRawUnsafe(sql);
    }));
  check("nobody reads follows, likes or notices through the Data API, not even the signed-in worker or the campaign's owner",
    /permission denied/.test(await readAs("anon", null, `SELECT "workerId" FROM "CampaignFollow"`)) &&
    /permission denied/.test(await readAs("authenticated", W1, `SELECT count(*) FROM "CampaignFollow"`)) &&
    /permission denied/.test(await readAs("authenticated", OWNER, `SELECT "workerId" FROM "PostLike"`)) &&
    /permission denied/.test(await readAs("authenticated", W1, `INSERT INTO "PostLike"("id","workerId","postId") VALUES (gen_random_uuid(), '${W1}', '${liked}')`)) &&
    /permission denied/.test(await readAs("authenticated", OWNER2, `SELECT "recipientId" FROM "Notification"`)));

  // --- Social activity is invisible to matching ---
  const after = await matchingView();
  check("a worker's job feed and scorecard are exactly what they were before any follows or likes", after === before, after === before ? undefined : { before: before.slice(0, 400), after: after.slice(0, 400) });
  check("no audit record names who follows or likes (it's the worker's own)", (await p.auditEvent.count({ where: { OR: [{ entityType: "CampaignFollow" }, { entityType: "PostLike" }] } })) === 0);

  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
