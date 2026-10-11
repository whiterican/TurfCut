/* C4 acceptance checks: job launch and tools on real Postgres (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { createJob, publishJob, updateDraftJob } from "@/lib/jobs-data";
import { validateJob } from "@/lib/jobs";
import { radiusFor, readLaunch } from "@/lib/job-launch";
import { scheduleShift } from "@/lib/field-day-data";
import { claimJob } from "@/lib/engagements-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const W1 = "00000000-0000-0000-0000-000000000101";
const JOB = "00000000-0000-0000-0000-000000000011";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };

(async () => {
  const p = db();
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" }] });
  await p.organization.update({ where: { id: ORG }, data: { approved: true, contractorTermsSignedAt: new Date(), classificationReviewedAt: new Date() } });
  const seeded = await p.job.findUniqueOrThrow({ where: { id: JOB } });
  const year = new Date().getUTCFullYear() + 1;
  const base = {
    type: "PETITION", title: "Launch test", jurisdictionId: seeded.jurisdictionId, startsAt: `${year}-03-01`, endsAt: `${year}-04-01`, city: "Denver", state: "CO",
    compensationMethod: "HOURLY", payRate: "24", headcount: "4", hiringModes: ["instant_claim"], campaignType: "ballot_measure", affiliation: "nonpartisan",
    message: "Qualify a measure.", contactEmergency: "a", contactDisputes: "b", contactLostMaterials: "c",
  };
  const input = (over: Record<string, unknown>) => {
    const v = validateJob({ ...base, ...over });
    if (!v.ok) throw new Error(JSON.stringify(v.errors));
    return v.value;
  };
  const org = { profileId: OWNER, orgId: ORG };

  // --- C4.2: launch mode and staging points ---
  const staged = await createJob(ORG, OWNER, input({ launchMode: "STAGED" }));
  const blocked = await publishJob(staged.id, ORG, OWNER);
  check("a staged job with no staging point can't publish, and says why", !blocked.ok && blocked.reasons.some((r) => /staging point/.test(r)), blocked);
  const self = await createJob(ORG, OWNER, input({ launchMode: "SELF", point_0_name: "ignored", point_0_lat: "39.7", point_0_lng: "-104.9" }));
  check("self-launch keeps no points and publishes", readLaunch(self.launch).points.length === 0 && (await publishJob(self.id, ORG, OWNER)).ok);
  const legacy = await createJob(ORG, OWNER, input({}));
  check("a job that says nothing about its launch (API callers from before C4) stores none and publishes as before", legacy.launch === null && (await publishJob(legacy.id, ORG, OWNER)).ok);
  const withPoint = input({ launchMode: "STAGED", point_0_name: "Library steps", point_0_address: "10 W 14th Ave", point_0_lat: "39.737", point_0_lng: "-104.989", point_0_radius: "400" });
  const edited = await updateDraftJob(staged.id, ORG, OWNER, withPoint);
  const launch = readLaunch((await p.job.findUniqueOrThrow({ where: { id: staged.id } })).launch);
  check("adding a point to the draft stores it with its radius, and the job publishes", edited && launch.points.length === 1 && launch.points[0].radiusM === 400 && (await publishJob(staged.id, ORG, OWNER)).ok, launch);
  const claim = await claimJob(W1, W1, staged.id);
  const shift = claim.ok
    ? await scheduleShift(org, claim.engagementId, { startsAt: new Date(Date.UTC(year, 2, 2, 15)).toISOString(), endsAt: new Date(Date.UTC(year, 2, 2, 19)).toISOString(), stagingLocation: "Library steps, 10 W 14th Ave", stagingLat: "39.737", stagingLng: "-104.989" })
    : null;
  const row = shift?.ok ? await p.shift.findUniqueOrThrow({ where: { id: shift.shiftId } }) : null;
  check("a shift at the job's point gets that point's check-in radius; elsewhere, the default", !!row && radiusFor(launch, { lat: row.stagingLat, lng: row.stagingLng }) === 400 && radiusFor(launch, { lat: 39.8, lng: -104.989 }) === 250, { shift, row });

  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
