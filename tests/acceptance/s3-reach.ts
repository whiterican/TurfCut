/* S3 acceptance checks: the campaign directory and link previews, against a fresh database (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { createCampaign, createPost, deletePost, listPublicCampaigns, setCampaignPublished, setJobCampaign } from "@/lib/campaign-social-data";
import { campaignPreview, directoryJson } from "@/lib/campaign-api";
import { DIRECTORY_PAGE_SIZE } from "@/lib/campaign-social";
import { loadFeed } from "@/lib/jobs-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const ORG2 = "00000000-0000-0000-0000-000000000002";
const OWNER2 = "00000000-0000-0000-0000-0000000000cc";
const JOB = "00000000-0000-0000-0000-000000000011";
const W1 = "00000000-0000-0000-0000-000000000101";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };

(async () => {
  const p = db();
  const A = { profileId: OWNER, orgId: ORG, manages: true };
  const B = { profileId: OWNER2, orgId: ORG2, manages: true };
  await p.organization.create({ data: { id: ORG2, name: "Pending Org", approved: false } });
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" }, { id: OWNER2, role: "OWNER", orgId: ORG2 }] });
  const feedBefore = JSON.stringify((await loadFeed(W1, {})).jobs.map((j) => j.id));
  const mk = async (actor: typeof A, handle: string, displayName: string, bio = "") => {
    const c = await createCampaign(actor, { handle, displayName, bio });
    if (!c.ok) throw new Error(c.reason);
    return c.id;
  };
  const at = (id: string, when: Date) => p.campaignProfile.update({ where: { id }, data: { publishedAt: when } });
  const day = (d: number) => new Date(Date.UTC(2026, 8, d));

  // --- Who's listed: published campaigns of approved organizations only ---
  const yes7 = await mk(A, "yes_on_7", "Yes on 7: Safe Streets", "Protected bike lanes on every arterial.\n\nhttps://yeson7.org");
  const quiet = await mk(A, "quiet_campaign", "Quiet Campaign");
  await mk(A, "draft_campaign", "Draft Campaign"); // never published: never listed
  const pending = await mk(B, "pending_org", "Pending Org Campaign");
  for (const id of [yes7, quiet]) await setCampaignPublished(A, id, true);
  await setCampaignPublished(B, pending, true);
  await at(yes7, day(1));
  await at(quiet, day(5));
  let page = await listPublicCampaigns();
  check("the directory lists published campaigns of approved organizations, nothing else", JSON.stringify(page.campaigns.map((c) => c.handle)) === JSON.stringify(["quiet_campaign", "yes_on_7"]), page.campaigns.map((c) => c.handle));
  check("a campaign that hasn't posted is dated from publishing", page.campaigns[0].lastPostAt === null && page.campaigns[0].activeAt.getTime() === day(5).getTime());

  // --- Order: the one that posted most recently first; a deleted post doesn't count ---
  const post = await createPost(A, yes7, { body: "We're hiring circulators.", jobId: JOB });
  if (!post.ok) throw new Error(post.reason);
  await p.campaignPost.update({ where: { id: post.id }, data: { createdAt: day(10) } });
  page = await listPublicCampaigns();
  check("posting moves a campaign to the top; the row says when", page.campaigns[0].handle === "yes_on_7" && page.campaigns[0].lastPostAt?.getTime() === day(10).getTime());
  await setJobCampaign(A, JOB, yes7);
  page = await listPublicCampaigns();
  check("…and how many of its jobs are hiring", page.campaigns[0].hiring === 1 && page.campaigns[1].hiring === 0);
  await deletePost(A, post.id);
  page = await listPublicCampaigns();
  check("a deleted post doesn't count", page.campaigns[0].handle === "quiet_campaign" && page.campaigns[1].lastPostAt === null);
  await p.organization.update({ where: { id: ORG }, data: { approved: false } });
  check("an organization losing approval takes its campaigns out of the directory", (await listPublicCampaigns()).campaigns.length === 0);
  await p.organization.update({ where: { id: ORG }, data: { approved: true } });

  // --- Search: the name or handle the reader typed, order unchanged ---
  check("a search matches a name", JSON.stringify((await listPublicCampaigns({ q: "safe STREETS" })).campaigns.map((c) => c.handle)) === JSON.stringify(["yes_on_7"]));
  check("…or a handle, with or without the @", (await listPublicCampaigns({ q: "@quiet" })).campaigns.length === 1 && (await listPublicCampaigns({ q: "quiet_" })).campaigns.length === 1);
  check("wildcards in a search are taken literally", (await listPublicCampaigns({ q: "%" })).campaigns.length === 0 && (await listPublicCampaigns({ q: "_" })).campaigns.length === 2);
  check("a search over everything keeps the order", JSON.stringify((await listPublicCampaigns({ q: "campaign" })).campaigns.map((c) => c.handle)) === JSON.stringify(["quiet_campaign"]));
  check("junk is an empty search, not an error", (await listPublicCampaigns({ q: ["x"] })).q === "" && (await listPublicCampaigns({ q: "\u0000" })).campaigns.length === 2);

  // --- Pages: keyset cursor over activeAt, id ---
  // (Straight into the table: an organization runs at most 5 campaigns through the app.)
  await p.campaignProfile.createMany({ data: Array.from({ length: DIRECTORY_PAGE_SIZE + 2 }, (_, i) => ({ orgId: ORG, handle: `c_${String(i).padStart(2, "0")}`, displayName: `Campaign ${i}`, publishedAt: day(20) })) });
  const p1 = await listPublicCampaigns();
  const p2 = await listPublicCampaigns({ cursor: p1.next });
  const all = [...p1.campaigns, ...p2.campaigns];
  check("20 a page, then the rest, each campaign once, newest activity first", p1.campaigns.length === DIRECTORY_PAGE_SIZE && p2.campaigns.length === 4 && p2.next === null && new Set(all.map((c) => c.id)).size === all.length && all.every((c, i) => i === 0 || c.activeAt <= all[i - 1].activeAt), { p1: p1.campaigns.length, p2: p2.campaigns.length });
  check("a junk cursor reads as the first page", (await listPublicCampaigns({ cursor: "junk" })).campaigns[0].id === p1.campaigns[0].id);
  check("a cursor keeps the search", (await listPublicCampaigns({ q: "Campaign", cursor: p1.next })).campaigns.every((c) => /campaign/i.test(c.displayName)));
  check("the API row carries the public fields only", JSON.stringify(Object.keys(directoryJson(p1.campaigns[0])).sort()) === JSON.stringify(["avatarUrl", "bio", "displayName", "handle", "hiring", "lastPostAt"]));

  // --- Link previews: the campaign's own words, nothing Turfcut adds ---
  const c = await p.campaignProfile.findUniqueOrThrow({ where: { id: yes7 } });
  const prev = campaignPreview(c);
  check("a campaign's preview is its name, handle and bio excerpt", prev.title === "Yes on 7: Safe Streets (@yes_on_7)" && prev.description === "Protected bike lanes on every arterial. https://yeson7.org" && prev.openGraph.type === "profile");
  const pp = campaignPreview(c, { id: "x", body: "  Knock,   listen first.\n\nThanks. " });
  check("a post's preview is the post's text", pp.description === "Knock, listen first. Thanks." && pp.openGraph.type === "article" && /on Turfcut$/.test(pp.title));
  check("without SITE_URL no absolute link is made up", !("url" in pp.openGraph) && !("alternates" in pp));

  // --- Nothing here reaches matching ---
  check("a worker's job feed is exactly what it was", JSON.stringify((await loadFeed(W1, {})).jobs.map((j) => j.id)) === feedBefore);

  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
