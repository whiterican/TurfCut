/* W4 acceptance checks: the campaign-category filter on real Postgres. It intersects with the work type and the other filters, reads the disclosure the way the cards do (a malformed one has no category), leaves legacy jobs in every unfiltered view, and never lets a worker's own do-not-match answer be bypassed (tests/acceptance/run.sh). */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createJob, publishJob, loadFeed } from "@/lib/jobs-data";
import { jobDiscoveryLabel, parseFeedFilters, validateJob } from "@/lib/jobs";
import { savePreferences } from "@/lib/political-fit-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const SEEDED = "00000000-0000-0000-0000-000000000011";
const W1 = "00000000-0000-0000-0000-000000000101";
const W3 = "00000000-0000-0000-0000-000000000103";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };

(async () => {
  const p = db();
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" }] });
  await p.organization.update({ where: { id: ORG }, data: { approved: true, contractorTermsSignedAt: new Date(), classificationReviewedAt: new Date() } });
  const seeded = await p.job.findUniqueOrThrow({ where: { id: SEEDED } });
  const year = new Date().getUTCFullYear() + 1;
  const make = async (title: string, type: "CANVASS" | "PETITION", campaignType: string, campaignName = "") => {
    const v = validateJob({
      type, title, jurisdictionId: seeded.jurisdictionId, startsAt: `${year}-03-01`, endsAt: `${year}-04-01`, city: "Denver", state: "CO",
      compensationMethod: "HOURLY", payRate: "24", headcount: "40", hiringModes: ["instant_claim"], campaignType, affiliation: "nonpartisan", campaignName,
      message: "A public campaign.", contactEmergency: "a", contactDisputes: "b", contactLostMaterials: "c", launchMode: "SELF",
    });
    if (!v.ok) throw new Error(`${title}: ${JSON.stringify(v.errors)}`);
    const job = await createJob(ORG, OWNER, v.value);
    if (!(await publishJob(job.id, ORG, OWNER)).ok) throw new Error(`${title}: publish`);
    return job.id;
  };
  const cand = await make("Candidate canvass", "CANVASS", "candidate", "Dana Whitfield");
  const candPet = await make("Candidate petition", "PETITION", "candidate");
  const ballotPet = await make("Ballot petition", "PETITION", "ballot_measure");
  const ballotCan = await make("Ballot canvass", "CANVASS", "ballot_measure");
  const civic = await make("Civic canvass", "CANVASS", "nonpartisan_civic");
  // Older jobs: no disclosure at all, and a malformed one that names a category but not the rest.
  const legacy = await make("Legacy canvass", "CANVASS", "ballot_measure");
  await p.job.update({ where: { id: legacy }, data: { campaignDisclosure: Prisma.DbNull } });
  const malformed = await make("Malformed canvass", "CANVASS", "ballot_measure");
  await p.job.update({ where: { id: malformed }, data: { campaignDisclosure: { campaignType: "candidate" } } });

  const ids = async (w: string | null, qs: string) => (await loadFeed(w, parseFeedFilters(new URLSearchParams(qs)))).jobs.map((j) => j.id);
  const has = (list: string[], ...want: string[]) => want.every((x) => list.includes(x));

  // --- The filter ---
  const all = await ids(W1, "");
  check("unfiltered, every job is there: legacy and malformed included", has(all, cand, candPet, ballotPet, ballotCan, civic, legacy, malformed, SEEDED), all.length);
  const c = await ids(W1, "campaign=candidate");
  check("campaign=candidate: the two candidate-category jobs, whatever their work type", c.length === 2 && has(c, cand, candPet), c);
  check("…and never the legacy job or the malformed one that merely mentions 'candidate' (the card shows it neutrally)", !c.includes(legacy) && !c.includes(malformed));
  check("candidate + type=CANVASS is candidate canvassing: just the one job", JSON.stringify(await ids(W1, "campaign=candidate&type=CANVASS")) === JSON.stringify([cand]));
  check("candidate + type=PETITION: the candidate petition", JSON.stringify(await ids(W1, "campaign=candidate&type=PETITION")) === JSON.stringify([candPet]));
  const b = await ids(W1, "campaign=ballot_measure");
  check("campaign=ballot_measure: the ballot jobs only", b.length === 2 && has(b, ballotPet, ballotCan), b);
  check("another category: civic", JSON.stringify(await ids(W1, "campaign=nonpartisan_civic")) === JSON.stringify([civic]));
  check("an unknown category is ignored by the parser, so the list is the unfiltered one", (await ids(W1, "campaign=%27%3B%20DROP")).length === all.length);
  check("intersects with the other filters: candidate + a rate nobody pays is empty", (await ids(W1, "campaign=candidate&minRate=900")).length === 0);
  check("intersects with the search box: candidate + 'petition' finds the candidate petition only", JSON.stringify(await ids(W1, "campaign=candidate&q=petition")) === JSON.stringify([candPet]));
  check("signed out (no worker) the filter works the same", JSON.stringify(await ids(null, "campaign=candidate&type=CANVASS")) === JSON.stringify([cand]));

  // --- The card and the filter agree ---
  const feed = (await loadFeed(W1, parseFeedFilters(new URLSearchParams("campaign=candidate")))).jobs;
  check("every job the candidate filter returns is labelled by its card as candidate (canvassing) or petition circulation", feed.every((j) => ["Candidate campaign canvassing", "Petition circulation"].includes(jobDiscoveryLabel(j.type, j.campaignDisclosure))));

  // --- A worker's own do-not-match answer still rules the job out ---
  await savePreferences(W3, W3, { visibilityMode: "APPLIED_TO", identityLabels: [], partyRelationship: null, issuePositions: {}, campaignBoundaries: [{ kind: "campaign_type", target: "candidate", stance: "do_not_match" }] } as never, null);
  const dnm = await loadFeed(W3, parseFeedFilters(new URLSearchParams("campaign=candidate")));
  check("a worker who said 'do not match me' to candidate campaigns sees none under the candidate filter", dnm.jobs.length === 0, dnm.jobs.map((j) => j.title));
  check("…and the same two jobs are in their 'hidden, with the reason' list, as without the filter", dnm.hidden.length === 2 && has(dnm.hidden.map((h) => h.id), cand, candPet), dnm.hidden);
  const dnmAll = await loadFeed(W3, {});
  check("without the filter they are hidden too: the filter neither adds nor removes anything for them", !dnmAll.jobs.some((j) => j.id === cand || j.id === candPet) && has(dnmAll.jobs.map((j) => j.id), ballotCan, civic, legacy));
  check("another worker is unaffected by that answer", has(await ids(W1, "campaign=candidate"), cand, candPet));

  await p.$disconnect();
  if (fails) { console.log(`${fails} failed`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
