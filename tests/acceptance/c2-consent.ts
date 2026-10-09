/* C2.1 acceptance checks: the sharing model on real Postgres — versions, defaults, races, append-only history, credential supersession and no browser access (tests/acceptance/run.sh). */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { alreadyConfirmed, loadSharing, orgViewer, saveSharing } from "@/lib/sharing-data";
import { DEFAULT_SHARING, SHARE_PARTS, SHARING_TEXT_VERSION, sharingToRow, visibleParts } from "@/lib/sharing";
import { savePreferences } from "@/lib/political-fit-data";
import { applyToJob } from "@/lib/engagements-data";
import type { HiringSnapshot } from "@/lib/engagements";
import { loadOrgScorecard, loadOrgScorecardPeriods } from "@/lib/shared-scorecard-data";
import { loadAvailability, loadOrgAvailabilities, loadOrgAvailability, saveAvailability } from "@/lib/availability-data";
import { addCredential, editCredential, loadCredentials, loadOrgCredentials, removeCredential } from "@/lib/credentials-data";
import { exportAccount } from "@/lib/account-data";
import { loadOrgProfile, previewOrgProfile } from "@/lib/org-profile-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const ORG2 = "00000000-0000-0000-0000-000000000002";
const W1 = "00000000-0000-0000-0000-000000000101"; // applied to ORG's job (seed)
const W2 = "00000000-0000-0000-0000-000000000102"; // no engagement with ORG2
const W3 = "00000000-0000-0000-0000-000000000103";
const ACTOR = W1; // the worker's profile id equals the worker id in the seed
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const refused = (q: Promise<unknown>) => q.then(() => "allowed", (e: unknown) => String(e));
const all = (a: string) => Object.fromEntries(SHARE_PARTS.map((p) => [p, a]));

(async () => {
  const p = db();

  // --- 1. Defaults and versions ---
  const fresh = await loadSharing(W1);
  check("a worker who never saved gets the defaults (version none)", fresh.version === null && JSON.stringify(fresh.choices) === JSON.stringify(DEFAULT_SHARING));
  const first = await saveSharing(W1, ACTOR, DEFAULT_SHARING);
  check("a first save is recorded even when it equals the defaults (confirmed ≠ never looked)", first.ok && first.changed && first.version === 1 && (await p.workerSharing.count({ where: { workerId: W1 } })) === 1, first);
  check("…and says nothing changes for organizations (they already saw the defaults)", first.ok && first.sameForOrgs === true, first);
  const noop = await saveSharing(W1, ACTOR, DEFAULT_SHARING);
  check("saving the same choices again is a no-op", noop.ok && !noop.changed && noop.version === 1, noop);
  const s2 = await saveSharing(W1, ACTOR, { audiences: { ...all("RELATIONSHIP"), quality: "NOBODY" } });
  check("a change appends version 2 and an audit event per version", s2.ok && s2.changed && s2.version === 2 && (await p.auditEvent.count({ where: { action: "sharing.saved", entityId: W1 } })) === 2, s2);
  check("a real change isn't reported as the same for organizations", s2.ok && s2.sameForOrgs === false, s2);
  const bad = await saveSharing(W1, ACTOR, { audiences: all("EVERYONE") });
  check("invalid choices are refused before the database", !bad.ok && (await p.workerSharing.count({ where: { workerId: W1 } })) === 2);
  const loaded = await loadSharing(W1);
  check("the latest version wins", loaded.version === 2 && loaded.choices.audiences.quality === "NOBODY" && loaded.choices.audiences.output === "RELATIONSHIP");
  // A row saved under older wording: the same choices are asked (and recorded) again.
  await p.workerSharing.create({ data: { workerId: W3, version: 1, ...sharingToRow(DEFAULT_SHARING), consentTextVersion: "c2-old-wording", actorId: W3 } });
  const reworded = await saveSharing(W3, W3, DEFAULT_SHARING);
  check("after a wording change, saving identical choices appends a new version (the same for organizations)", reworded.ok && reworded.changed && reworded.version === 2 && reworded.sameForOrgs === true, reworded);

  // Read receipts aren't on the form until C3: a save that leaves them out keeps the saved value.
  await p.workerSharing.create({ data: { workerId: W3, version: 3, ...sharingToRow({ ...DEFAULT_SHARING, readReceipts: true }), consentTextVersion: "c2-old-wording", actorId: W3 } });
  const keep = await saveSharing(W3, W3, { audiences: all("NOBODY") });
  check("a save without read receipts keeps the saved setting", keep.ok && (await loadSharing(W3)).choices.readReceipts === true, keep);

  // --- 2. Races: concurrent saves each get the next version ---
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    saveSharing(W2, W2, { audiences: all("RELATIONSHIP"), findable: true, workTypes: ["PETITION"], homeArea: "Denver", travelMiles: 10 + i })));
  const versions = (await p.workerSharing.findMany({ where: { workerId: W2 }, select: { version: true }, orderBy: { version: "asc" } })).map((r) => r.version);
  check("8 simultaneous different saves → versions 1..8, none lost or doubled", results.every((r) => r.ok && r.changed) && versions.join() === "1,2,3,4,5,6,7,8", versions);
  const twins = await Promise.all(Array.from({ length: 5 }, () => saveSharing(W2, W2, { audiences: all("NOBODY") })));
  check("5 simultaneous identical saves → exactly one new version and one audit event",
    twins.filter((r) => r.ok && r.changed).length === 1 && (await p.workerSharing.count({ where: { workerId: W2 } })) === 9 && (await p.auditEvent.count({ where: { action: "sharing.saved", entityId: W2 } })) === 9, twins);
  const dup = await refused(p.workerSharing.create({ data: { workerId: W2, version: 8, outputAudience: "NOBODY", qualityAudience: "NOBODY", reliabilityAudience: "NOBODY", historyAudience: "NOBODY", availabilityAudience: "NOBODY", credentialsAudience: "NOBODY", consentTextVersion: "x", actorId: W2 } }));
  check("a second row can't claim an existing version (unique backstop)", /Unique constraint/.test(dup), dup);

  // --- 3. Database shape checks ---
  const notFindable = await refused(p.$executeRaw`INSERT INTO "public"."WorkerSharing" ("id","workerId","version","outputAudience","qualityAudience","reliabilityAudience","historyAudience","availabilityAudience","credentialsAudience","findable","consentTextVersion","actorId") VALUES (${randomUUID()}::uuid, ${W3}::uuid, 1, 'NOBODY','NOBODY','NOBODY','NOBODY','NOBODY','NOBODY', true, 'x', ${W3}::uuid)`);
  check("the database refuses findable without a typed area and radius", /WorkerSharing_findable_shape/.test(notFindable), notFindable);
  const badAvail = await refused(p.workerAvailability.create({ data: { workerId: W3, version: 1, weekly: [], exceptions: [], actorId: W3 } }));
  check("the database refuses an availability that isn't a week object plus an exception list", /WorkerAvailability_shape/.test(badAvail), badAvail);

  // --- 4. Append-only on all three tables ---
  const av = await p.workerAvailability.create({ data: { workerId: W3, version: 1, weekly: { sat: [{ from: "09:00", to: "15:00" }] }, exceptions: [], actorId: W3 } });
  const cred = await p.workerCredential.create({ data: { workerId: W3, kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "CO-12345", actorId: W3 } });
  const tries: Array<[string, Promise<unknown>]> = [
    ["WorkerSharing update", p.$executeRaw`UPDATE "public"."WorkerSharing" SET "findable" = false WHERE "workerId" = ${W1}::uuid`],
    ["WorkerSharing delete", p.$executeRaw`DELETE FROM "public"."WorkerSharing" WHERE "workerId" = ${W1}::uuid`],
    ["WorkerSharing truncate", p.$executeRawUnsafe(`TRUNCATE "public"."WorkerSharing"`)],
    ["WorkerAvailability update", p.$executeRaw`UPDATE "public"."WorkerAvailability" SET "note" = 'x' WHERE "id" = ${av.id}::uuid`],
    ["WorkerAvailability delete", p.$executeRaw`DELETE FROM "public"."WorkerAvailability" WHERE "id" = ${av.id}::uuid`],
    ["WorkerAvailability truncate", p.$executeRawUnsafe(`TRUNCATE "public"."WorkerAvailability"`)],
    ["WorkerCredential update", p.$executeRaw`UPDATE "public"."WorkerCredential" SET "removed" = true WHERE "id" = ${cred.id}::uuid`],
    ["WorkerCredential delete", p.$executeRaw`DELETE FROM "public"."WorkerCredential" WHERE "id" = ${cred.id}::uuid`],
    ["WorkerCredential truncate", p.$executeRawUnsafe(`TRUNCATE "public"."WorkerCredential"`)],
  ];
  for (const [label, q] of tries) { const r = await refused(q); check(`${label} is refused`, /append-only/.test(r), r); }
  check("history is intact after the attempts", (await p.workerSharing.count({ where: { workerId: W1 } })) === 2 && (await p.workerCredential.count()) === 1);

  // --- 5. Credentials: supersede, remove, and the races ---
  const edit = await p.workerCredential.create({ data: { workerId: W3, kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "CO-54321", supersedesId: cred.id, actorId: W3 } });
  check("an edit appends a row that supersedes the old one", !!edit.id);
  const second = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "CIRCULATOR_REGISTRATION", state: "CO", supersedesId: cred.id, actorId: W3 } }));
  check("two edits can't both supersede the same row", /Unique constraint/.test(second), second);
  const other = await refused(p.workerCredential.create({ data: { workerId: W2, kind: "TRAINING", label: "x", supersedesId: edit.id, actorId: W2 } }));
  check("another worker's row can't supersede this worker's credential", /same worker/.test(other), other);
  const noTarget = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "TRAINING", removed: true, actorId: W3 } }));
  check("a removal must say what it removes", /WorkerCredential_removal_supersedes/.test(noTarget), noTarget);
  const removal = await p.workerCredential.create({ data: { workerId: W3, kind: "CIRCULATOR_REGISTRATION", removed: true, supersedesId: edit.id, actorId: W3 } });
  const revive = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "CIRCULATOR_REGISTRATION", supersedesId: removal.id, actorId: W3 } }));
  check("nothing supersedes a removal (a removed credential is added again as new)", /removed credential/.test(revive), revive);
  const current = await p.workerCredential.findMany({ where: { workerId: W3, removed: false, supersededBy: null } });
  check("current credentials = rows nothing supersedes that aren't removed (none left)", current.length === 0, current);
  const ghost = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "TRAINING", label: "x", supersedesId: randomUUID(), actorId: W3 } }));
  check("superseding a credential that doesn't exist is refused as a missing reference", /doesn't exist|Foreign key constraint/.test(ghost), ghost);

  // Verification can't be self-set or carried forward by an edit.
  const fakeVerified = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "TRAINING", label: "Petition basics", verification: "PLATFORM", verificationMethod: "REGISTRY_LOOKUP", actorId: W3 } }));
  check("a verified level needs a verification time", /WorkerCredential_verification_shape/.test(fakeVerified), fakeVerified);
  const selfWithVerifier = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "TRAINING", label: "x", verifiedById: W1, verifiedAt: new Date(), actorId: W3 } }));
  check("self-reported can't name a verifier", /WorkerCredential_verification_shape/.test(selfWithVerifier), selfWithVerifier);
  const VERIFIER = "00000000-0000-0000-0000-0000000000aa";
  const selfVerified = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "CO-1", verification: "PLATFORM", verificationMethod: "REGISTRY_LOOKUP", verifiedAt: new Date(), actorId: W3 } }));
  check("Turfcut verification names its verifier (a worker can't self-verify)", /WorkerCredential_verification_shape/.test(selfVerified), selfVerified);
  const otherWriter = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "CO-1", verification: "ORGANIZATION", verificationMethod: "REGISTRY_LOOKUP", verifiedById: VERIFIER, verifiedAt: new Date(), actorId: W3 } }));
  check("only the verifier writes a verified row", /WorkerCredential_verification_shape/.test(otherWriter), otherWriter);
  const future = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "CO-1", verification: "ORGANIZATION", verificationMethod: "REGISTRY_LOOKUP", verifiedById: VERIFIER, verifiedAt: new Date("2999-01-01"), actorId: VERIFIER } }));
  check("a verification time can't be in the future", /WorkerCredential_verification_shape/.test(future), future);
  const ownVerifier = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "CO-1", verification: "PLATFORM", verificationMethod: "REGISTRY_LOOKUP", verifiedById: W3, verifiedAt: new Date(), actorId: W3 } }));
  check("a worker can't name themselves as the verifier", /verify their own credential/.test(ownVerifier), ownVerifier);
  const imported = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "TRAINING", label: "x", verification: "IMPORTED", verificationMethod: "REGISTRY_LOOKUP", verifiedAt: new Date(), actorId: W3 } }));
  check("an imported credential names who imported it", /WorkerCredential_verification_shape/.test(imported), imported);
  const backdated = await p.workerCredential.create({ data: { workerId: W3, kind: "TRAINING", label: "y", createdAt: new Date("2999-01-01"), actorId: W3 } });
  check("the database's clock sets createdAt, whatever the writer sends", backdated.createdAt.getTime() < Date.now() + 60_000, backdated.createdAt);
  const verified = await p.workerCredential.create({ data: { workerId: W3, kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "CO-1", verification: "PLATFORM", verificationMethod: "REGISTRY_LOOKUP", verifiedById: VERIFIER, verifiedAt: new Date(), actorId: VERIFIER } });
  const carried = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "CO-999", verification: "PLATFORM", verificationMethod: "REGISTRY_LOOKUP", verifiedById: VERIFIER, verifiedAt: verified.verifiedAt, supersedesId: verified.id, actorId: VERIFIER } }));
  check("an edit can't carry the earlier verification forward", /earlier verification/.test(carried), carried);
  const kindSwap = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "OTHER", label: "x", supersedesId: verified.id, actorId: W3 } }));
  check("an edit keeps the credential's kind", /keeps the credential's kind/.test(kindSwap), kindSwap);
  const busyRemoval = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "CIRCULATOR_REGISTRATION", removed: true, identifier: "CO-777", supersedesId: verified.id, actorId: W3 } }));
  check("a removal carries no new content", /WorkerCredential_removal_bare/.test(busyRemoval), busyRemoval);
  const reEdit = await p.workerCredential.create({ data: { workerId: W3, kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "CO-999", supersedesId: verified.id, actorId: W3 } });
  check("an edit of a verified credential goes back to self-reported", reEdit.verification === "SELF_REPORTED");

  // Proof files stay in the worker's own folder.
  const foreignProof = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "TRAINING", label: "x", proofPath: `${W2}/secret.pdf`, actorId: W3 } }));
  check("a proof path in another worker's folder is refused", /WorkerCredential_proof_path/.test(foreignProof), foreignProof);
  const climb = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "TRAINING", label: "x", proofPath: `${W3}/../${W2}/secret.pdf`, actorId: W3 } }));
  check("a proof path can't climb out of the folder", /WorkerCredential_proof_path/.test(climb), climb);
  const bareFolder = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "TRAINING", label: "x", proofPath: `${W3}/`, actorId: W3 } }));
  check("a proof path names a file, not just the folder", /WorkerCredential_proof_path/.test(bareFolder), bareFolder);
  const nested = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "TRAINING", label: "x", proofPath: `${W3}//x.pdf`, actorId: W3 } }));
  check("a proof path is one file directly in the folder", /WorkerCredential_proof_path/.test(nested), nested);
  const ownProof = await p.workerCredential.create({ data: { workerId: W3, kind: "TRAINING", label: "x", proofPath: `${W3}/${randomUUID()}.pdf`, actorId: W3 } });
  check("a proof path in the worker's own folder is accepted", !!ownProof.id);

  const nullType = await refused(p.$executeRaw`INSERT INTO "public"."WorkerSharing" ("id","workerId","version","outputAudience","qualityAudience","reliabilityAudience","historyAudience","availabilityAudience","credentialsAudience","workTypes","consentTextVersion","actorId") VALUES (${randomUUID()}::uuid, ${W3}::uuid, 50, 'NOBODY','NOBODY','NOBODY','NOBODY','NOBODY','NOBODY', ARRAY['PETITION', NULL]::"public"."JobType"[], 'x', ${W3}::uuid)`);
  check("a work-type list with a blank entry is refused (it would break reading the row)", /WorkerSharing_work_types_shape/.test(nullType), nullType);
  const badState = await refused(p.workerCredential.create({ data: { workerId: W3, kind: "OTHER", label: "x", state: "colorado", actorId: W3 } }));
  check("a state must be a two-letter code", /WorkerCredential_state_code/.test(badState), badState);

  // --- 6. Viewers ---
  const v1 = await orgViewer(W1, ORG);
  check("an approved org the worker applied to is a related viewer", v1.kind === "org" && v1.approved && v1.relationship, v1);
  await p.organization.create({ data: { id: ORG2, name: "Other Campaign Co", approved: true, updatedAt: new Date() } });
  const v2 = await orgViewer(W1, ORG2);
  check("an approved org with no engagement is an unrelated viewer", v2.kind === "org" && v2.approved && !v2.relationship, v2);
  const parts = visibleParts((await loadSharing(W1)).choices, v1);
  check("the related org sees what W1 shares and not the hidden group", parts.output && !parts.quality && parts.history, parts);
  check("an unrelated org sees none of W1's parts shared with related orgs only", Object.values(visibleParts((await loadSharing(W1)).choices, v2)).every((x) => !x));
  await saveSharing(W1, ACTOR, { audiences: { ...all("RELATIONSHIP"), quality: "NOBODY", availability: "ANY_APPROVED_ORG" } });
  const wide = visibleParts((await loadSharing(W1)).choices, v2);
  check("a part shared with any approved organization reaches an unrelated approved org, and only that part", wide.availability && !wide.output && !wide.quality, wide);

  // An invitation alone, or a cancelled engagement, is not a relationship.
  const job2 = await p.job.create({ data: { orgId: ORG2, jurisdictionId: (await p.job.findFirstOrThrow({ where: { orgId: ORG } })).jurisdictionId, type: "CANVASS", title: "Invite-only canvass" } });
  const inv = await p.engagement.create({ data: { jobId: job2.id, workerId: W1, status: "INVITED" } });
  const vInvited = await orgViewer(W1, ORG2);
  check("an org that only invited the worker is unrelated", vInvited.kind === "org" && !vInvited.relationship, vInvited);
  await p.engagement.update({ where: { id: inv.id }, data: { status: "CANCELLED" } });
  const vCancelled = await orgViewer(W1, ORG2);
  check("an org whose engagement was cancelled is unrelated", vCancelled.kind === "org" && !vCancelled.relationship, vCancelled);
  await p.organization.update({ where: { id: ORG }, data: { approved: false } });
  const v3 = await orgViewer(W1, ORG);
  check("an org whose approval is withdrawn sees nothing", Object.values(visibleParts((await loadSharing(W1)).choices, v3)).every((x) => !x), v3);
  await p.organization.update({ where: { id: ORG }, data: { approved: true } });
  await p.worker.update({ where: { id: W1 }, data: { closedAt: new Date() } });
  const vClosed = await orgViewer(W1, ORG);
  check("a closed account shows nothing, even to a related org", Object.values(visibleParts((await loadSharing(W1)).choices, vClosed)).every((x) => !x), vClosed);
  await p.worker.update({ where: { id: W1 }, data: { closedAt: null } });

  // --- 6b. C2.3: live views follow sharing at once; snapshots stay as the record ---
  const JOB = "00000000-0000-0000-0000-000000000011"; // ORG's seeded petition job
  await p.job.update({ where: { id: JOB }, data: { hiringMethod: { modes: ["application"] } } });
  await saveSharing(W2, W2, { audiences: all("RELATIONSHIP") });
  await savePreferences(W2, W2, { visibilityMode: "APPLIED_TO", identityLabels: [{ label: "independent", shared: true }], partyRelationship: null, issuePositions: {}, campaignBoundaries: [] }, null);
  const applied = await applyToJob(W2, W2, JOB);
  check("W2 applies to ORG's job with everything shared", applied.ok, applied);
  const eng = await p.engagement.findFirstOrThrow({ where: { workerId: W2, jobId: JOB } });
  const snap = eng.applicationSnapshot as unknown as HiringSnapshot;
  check("the snapshot records what was shared, and the sharing version", !!snap.scorecard.shared && Object.values(snap.scorecard.shared).every(Boolean) && typeof snap.scorecard.sharingVersion === "number" && snap.scorecard.showRate !== null, snap.scorecard);
  check("an approved organization the worker applied to gets the fit answers they share", snap.fit.fields.identity.shared === true, snap.fit);
  const before = await loadOrgScorecard(W2, ORG);
  check("ORG's live view shows reliability and history while shared", before.showRate !== null && before.shared.history);
  await saveSharing(W2, W2, { audiences: { ...all("RELATIONSHIP"), reliability: "NOBODY", history: "NOBODY", quality: "NOBODY" } });
  const after = await loadOrgScorecard(W2, ORG, { period: "90d", state: "CO" });
  check("after narrowing, ORG's live view drops those groups straight away", after.showRate === null && !after.shared.history && after.segments.every((g) => g.history === null && g.averages.acceptanceRate === null), after);
  check("without history, period and state filters are ignored (lifetime, all states)", after.period === "lifetime", after.period);
  check("the live view carries no dates, states, totals or a rate's counts", !/"CO"|shiftsCount|statesWorked|"numerator":\d|"denominator":\d/.test(JSON.stringify(after)), JSON.stringify(after));
  const periods = await loadOrgScorecardPeriods(W2, ORG);
  check("the worker-page view gives every period the lifetime view without history", periods["90d"] === periods.lifetime || JSON.stringify(periods["90d"]) === JSON.stringify(periods.lifetime));
  const again = (await p.engagement.findFirstOrThrow({ where: { id: eng.id } })).applicationSnapshot;
  check("the earlier snapshot still shows exactly what it captured", JSON.stringify(again) === JSON.stringify(snap));
  const stranger = await loadOrgScorecard(W2, ORG2);
  check("an unrelated org's live view has no numbers at all", stranger.showRate === null && stranger.segments.every((g) => g.history === null && Object.values(g.averages).every((m) => m === null)), stranger);

  // --- 8. C2.4: availability ---
  const week = { weekly: { sat: [{ from: "09:00", to: "15:00" }], sun: [{ from: "00:00", to: "24:00" }] }, exceptions: [{ date: "2099-10-12", ranges: [] }], note: "Weekends." };
  const a0 = await saveAvailability(W2, W2, { weekly: {}, exceptions: [] });
  check("saving an empty week before any save writes nothing", a0.ok && !a0.changed && (await p.workerAvailability.count({ where: { workerId: W2 } })) === 0, a0);
  const a1 = await saveAvailability(W2, W2, week);
  check("a week appends version 1 with an audit event", a1.ok && a1.changed && a1.version === 1 && (await p.auditEvent.count({ where: { action: "availability.saved", entityId: W2 } })) === 1, a1);
  const a2 = await saveAvailability(W2, W2, week);
  check("the same week again is a no-op", a2.ok && !a2.changed && a2.version === 1, a2);
  const aBad = await saveAvailability(W2, W2, { weekly: { sat: [{ from: "15:00", to: "09:00" }] }, exceptions: [] });
  check("a backwards time is refused before the database", !aBad.ok);
  const racers = await Promise.all(Array.from({ length: 6 }, (_, i) => saveAvailability(W2, W2, { ...week, note: `n${i}` })));
  const avs = (await p.workerAvailability.findMany({ where: { workerId: W2 }, select: { version: true }, orderBy: { version: "asc" } })).map((r) => r.version);
  check("6 simultaneous saves → versions 1..7, none lost", racers.every((r) => r.ok && r.changed) && avs.join() === "1,2,3,4,5,6,7", avs);
  await saveSharing(W2, W2, { audiences: { ...all("RELATIONSHIP"), availability: "RELATIONSHIP" } });
  const seenAvail = await loadOrgAvailability(W2, ORG, "2026-10-06");
  check("a related org sees the plain summary", seenAvail !== "withheld" && seenAvail?.usual === "Usually free Sat 9am–3pm; Sun all day." && seenAvail.dates[0]?.includes("not available"), seenAvail);
  check("an unrelated org sees availability as not shared", (await loadOrgAvailability(W2, ORG2)) === "withheld");
  await saveSharing(W2, W2, { audiences: { ...all("RELATIONSHIP"), availability: "NOBODY" } });
  check("after the worker hides it, the related org sees not shared at once", (await loadOrgAvailability(W2, ORG)) === "withheld");
  check("a worker who set nothing but shares it reads as no availability (not a blank score)", (await loadOrgAvailability(W1, ORG)) === null);
  for (const org of [ORG, ORG2]) {
    const batch = await loadOrgAvailabilities([W1, W2, W3], org, "2026-10-06");
    const single = await Promise.all([W1, W2, W3].map((w) => loadOrgAvailability(w, org, "2026-10-06")));
    check(`the applicants-page batch matches one-by-one for ${org === ORG ? "a related" : "an unrelated"} org`, JSON.stringify([W1, W2, W3].map((w) => batch.get(w))) === JSON.stringify(single), { batch: [...batch], single });
  }
  const old = await saveAvailability(W3, W3, { weekly: {}, exceptions: [{ date: "2020-01-01", ranges: [] }, { date: "2099-01-01", ranges: [] }] }, "2026-10-06");
  check("dates that are over are dropped on save", old.ok && (await loadAvailability(W3)).availability.exceptions.map((e) => e.date).join() === "2099-01-01", old);

  // --- 9. C2.5: credentials wallet ---
  const W2C = W2; // W2's profile id equals the worker id in the seed
  const add = await addCredential(W2, W2C, { kind: "CIRCULATOR_REGISTRATION", state: "co", identifier: "CO-778899", expiresOn: "2099-01-01" });
  check("a worker adds a self-reported credential, audited", add.ok && (await p.workerCredential.findUniqueOrThrow({ where: { id: add.ok ? add.id : "" } })).verification === "SELF_REPORTED" && (await p.auditEvent.count({ where: { action: "credential.added" } })) === 1, add);
  const badAdd = await addCredential(W2, W2C, { kind: "CIRCULATOR_REGISTRATION" });
  check("a registration without a state is refused with a field message", !badAdd.ok && !!badAdd.errors?.state, badAdd);
  const id1 = add.ok ? add.id : "";
  const notMine = await editCredential(W3, W3, id1, { kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "X" });
  check("another worker can't edit it (reads as changed/not found)", !notMine.ok && (await loadCredentials(W2)).length === 1, notMine);
  const kindChange = await editCredential(W2, W2C, id1, { kind: "TRAINING", label: "x" });
  check("an edit can't change the kind", !kindChange.ok && /kind/.test(kindChange.ok ? "" : kindChange.reason));
  const [e1, e2] = await Promise.all([
    editCredential(W2, W2C, id1, { kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "CO-1" }),
    editCredential(W2, W2C, id1, { kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "CO-2" }),
  ]);
  check("two edits racing on one credential: exactly one lands, the other is told to reload", [e1, e2].filter((r) => r.ok).length === 1 && [e1, e2].some((r) => !r.ok && /Reload/.test(r.reason)), [e1, e2]);
  const wallet = await loadCredentials(W2);
  check("the wallet shows one current credential, with the winning edit", wallet.length === 1 && ["CO-1", "CO-2"].includes(wallet[0].identifier ?? "") && wallet[0].rootId === id1, wallet);
  check("only the last four characters of a number are ever stored", (await p.workerCredential.findMany({ where: { workerId: W2 } })).every((r) => !r.identifier || r.identifier.length <= 4));
  const credRows = await p.workerCredential.count({ where: { workerId: W2 } });
  const same = await editCredential(W2, W2C, wallet[0].id, { kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "", expiresOn: "" });
  check("an edit with a blank number and nothing changed writes nothing", same.ok && same.changed === false && (await p.workerCredential.count({ where: { workerId: W2 } })) === credRows, same);
  const stale = await editCredential(W2, W2C, id1, { kind: "CIRCULATOR_REGISTRATION", state: "CO", identifier: "CO-3" });
  check("editing the superseded row is refused", !stale.ok);
  await addCredential(W2, W2C, { kind: "TRAINING", label: "Petition basics" });
  const exported = await exportAccount({ userId: W2, workerId: W2 });
  check("the data export includes credentials, sharing and availability", ["credentials.csv", "sharing.json", "availability.json"].every((n) => exported.some((f) => f.name === n)) && exported.find((f) => f.name === "credentials.csv")!.text.includes("CIRCULATOR_REGISTRATION"));
  const rm = await removeCredential(W2, W2C, wallet[0].id);
  check("removing appends a removal row; history stays", rm.ok && (await loadCredentials(W2)).length === 1 && (await p.workerCredential.count({ where: { workerId: W2 } })) === 4, rm); // add, winning edit, training, removal
  const rmAgain = await removeCredential(W2, W2C, wallet[0].id);
  check("removing it twice is refused", !rmAgain.ok);
  await saveSharing(W2, W2, { audiences: { ...all("RELATIONSHIP"), credentials: "RELATIONSHIP" } });
  const orgView = await loadOrgCredentials(W2, ORG);
  check("a related org sees name, level and expiry, never the number", orgView !== "withheld" && orgView.length === 1 && !JSON.stringify(orgView).includes("CO-") && !("identifier" in orgView[0]), orgView);
  check("an unrelated org sees credentials as not shared", (await loadOrgCredentials(W2, ORG2)) === "withheld");
  await saveSharing(W2, W2, { audiences: { ...all("RELATIONSHIP"), credentials: "NOBODY" } });
  check("hidden straight away when the worker narrows sharing", (await loadOrgCredentials(W2, ORG)) === "withheld");

  // --- 10. C2.6: the preview is the organization's page; setup confirms what it showed ---
  await saveSharing(W2, W2, { audiences: all("RELATIONSHIP") });
  await p.experienceRecord.create({
    data: { workerId: W2, campaign: "Clean Water Initiative", role: "Circulator", state: "CO", startDate: new Date("2024-05-01"), unitType: "signatures", unitCount: 900, referenceContact: "ref-lead@example.org" },
  });
  const at = new Date();
  const real = await loadOrgProfile(W2, ORG, at);
  const preview = await previewOrgProfile(W2, { kind: "org", approved: true, relationship: true }, at);
  check("the preview for 'an organization you applied to' is exactly what that organization sees", !!real && JSON.stringify(real) === JSON.stringify(preview), { real, preview });
  check("it includes the name and experience, never a reference's contact details (only that there is one)",
    !!real && !!real.displayName && real.experience !== "withheld" && real.experience.length === 1 && real.experience[0].hasReference === true &&
      real.experience.every((r) => !("referenceContact" in r)) && !JSON.stringify(real).includes("ref-lead@"), real);
  const strangerView = await loadOrgProfile(W2, ORG2, at);
  check("an unrelated organization sees every shared part as not shared, experience too", !!strangerView && strangerView.availability === "withheld" && strangerView.credentials === "withheld" && strangerView.experience === "withheld", strangerView);
  check("no such worker: no profile", (await loadOrgProfile(randomUUID(), ORG, at)) === null);
  await saveSharing(W2, W2, { audiences: { ...all("RELATIONSHIP"), history: "NOBODY" } });
  const noHistory = await loadOrgProfile(W2, ORG, at);
  check("experience goes with hours and history: hidden from a related org once history is", !!noHistory && noHistory.experience === "withheld", noHistory?.experience);
  await saveSharing(W2, W2, { audiences: all("RELATIONSHIP") });

  const shownNow = (await loadSharing(W1)).version;
  const rowsBefore = await p.workerSharing.count({ where: { workerId: W1 } });
  const staleConfirm = await saveSharing(W1, ACTOR, { audiences: all("NOBODY") }, { expectedVersion: (shownNow ?? 0) - 1 });
  check("a confirm of an older version is refused and writes nothing", !staleConfirm.ok && !!staleConfirm.errors.stale && (await p.workerSharing.count({ where: { workerId: W1 } })) === rowsBefore, staleConfirm);
  const neverConfirm = await saveSharing(W1, ACTOR, { audiences: all("NOBODY") }, { expectedVersion: null });
  check("a confirm of 'never saved' is refused once a version exists", !neverConfirm.ok && !!neverConfirm.errors.stale, neverConfirm);
  const goodConfirm = await saveSharing(W1, ACTOR, (await loadSharing(W1)).choices, { expectedVersion: shownNow });
  check("a confirm of the version on screen goes through", goodConfirm.ok, goodConfirm);
  check("a save under today's wording is current", (await loadSharing(W1)).current === true);
  // A stale confirm counts as done only if the choices it showed are what's confirmed now.
  await saveSharing(W1, ACTOR, { audiences: { ...all("RELATIONSHIP"), output: "NOBODY" } });
  check("a stale confirm isn't done once different choices were saved meanwhile", (await alreadyConfirmed(W1, shownNow)) === false);
  const latest = (await loadSharing(W1)).version ?? 0;
  await p.workerSharing.create({ data: { workerId: W1, version: latest + 1, ...sharingToRow(DEFAULT_SHARING), consentTextVersion: "c2-old-wording", actorId: W1 } });
  check("a latest save under older wording is not current (the worker is asked again)", (await loadSharing(W1)).current === false);
  check("…and a confirm of it isn't counted as done", (await alreadyConfirmed(W1, latest + 1)) === false);

  // The wording a screen was drawn with: a save across a wording change is refused.
  const rowsOld = await p.workerSharing.count({ where: { workerId: W1 } });
  const oldPage = await saveSharing(W1, ACTOR, DEFAULT_SHARING, { expectedVersion: latest + 1, textVersion: "c2-old-wording" });
  check("a save from a page drawn under older wording is refused and writes nothing",
    !oldPage.ok && !!oldPage.errors.reworded && (await p.workerSharing.count({ where: { workerId: W1 } })) === rowsOld, oldPage);
  const reconfirm = await saveSharing(W1, ACTOR, DEFAULT_SHARING, { expectedVersion: latest + 1, textVersion: SHARING_TEXT_VERSION });
  check("the same choices under today's wording append a version marked as the same for organizations",
    reconfirm.ok && reconfirm.changed && reconfirm.sameForOrgs === true && (await loadSharing(W1)).current === true, reconfirm);
  // The latest choices are the defaults now, so a missing version can't pass by comparing with the defaults.
  check("a stale confirm of a version that doesn't exist isn't done", (await alreadyConfirmed(W1, 999)) === false);
  // Done pressed twice (or in two tabs): the second press is stale, writes nothing, and counts as done.
  const rowsDone = await p.workerSharing.count({ where: { workerId: W1 } });
  const secondPress = await saveSharing(W1, ACTOR, DEFAULT_SHARING, { expectedVersion: latest + 1, textVersion: SHARING_TEXT_VERSION });
  check("pressing Done again on the same page is refused as stale and writes nothing",
    !secondPress.ok && !!secondPress.errors.stale && (await p.workerSharing.count({ where: { workerId: W1 } })) === rowsDone, secondPress);
  check("…and counts as done, since the choices it showed are confirmed under today's wording", (await alreadyConfirmed(W1, latest + 1)) === true);
  const realChange = await saveSharing(W1, ACTOR, { audiences: all("NOBODY") }, { textVersion: SHARING_TEXT_VERSION });
  check("a real change isn't marked as the same for organizations", realChange.ok && realChange.changed && realChange.sameForOrgs === false, realChange);

  // A worker who never saved presses Done twice: the defaults are confirmed once, and the second press counts as done.
  const W4 = randomUUID();
  await p.profile.create({ data: { id: W4, role: "WORKER" } });
  await p.worker.create({ data: { id: W4, profileId: W4, displayName: "Riley Quinn" } });
  check("a worker who never saved has nothing confirmed yet", (await alreadyConfirmed(W4, null)) === false);
  const press1 = await saveSharing(W4, W4, DEFAULT_SHARING, { expectedVersion: null, textVersion: SHARING_TEXT_VERSION });
  const press2 = await saveSharing(W4, W4, DEFAULT_SHARING, { expectedVersion: null, textVersion: SHARING_TEXT_VERSION });
  check("never saved, Done twice: the first confirms the defaults; the second is stale, writes nothing, and counts as done",
    press1.ok && press1.version === 1 && !press2.ok && !!press2.errors.stale && (await p.workerSharing.count({ where: { workerId: W4 } })) === 1 && (await alreadyConfirmed(W4, null)) === true, { press1, press2 });

  // An organization Turfcut doesn't approve gets no political fit on a hiring snapshot, as it gets no scorecard.
  await savePreferences(W3, W3, { visibilityMode: "APPLIED_TO", identityLabels: [{ label: "independent", shared: true }], partyRelationship: null, issuePositions: {}, campaignBoundaries: [] }, null);
  await p.organization.update({ where: { id: ORG }, data: { approved: false } });
  const unapprovedApply = await applyToJob(W3, W3, JOB);
  await p.organization.update({ where: { id: ORG }, data: { approved: true } });
  const w3snap = (await p.engagement.findFirst({ where: { workerId: W3, jobId: JOB } }))?.applicationSnapshot as unknown as HiringSnapshot | undefined;
  check("an unapproved organization's snapshot carries no political fit and no scorecard part",
    unapprovedApply.ok && !!w3snap && Object.values(w3snap.fit.fields).every((f) => !f.shared) && !!w3snap.scorecard.shared && Object.values(w3snap.scorecard.shared).every((x) => !x), { unapprovedApply, w3snap });
  const w3view = await loadOrgProfile(W3, ORG, at);
  check("once approved again, the live page shows the fit the worker shares with it", !!w3view && w3view.fit.fields.identity.shared === true, w3view?.fit);

  const numbered = await addCredential(W3, W3, { kind: "NOTARY_OR_AFFIDAVIT", state: "CO", identifier: "N-445566" });
  const numberedId = numbered.ok ? numbered.id : "";
  const kept = await editCredential(W3, W3, numberedId, { kind: "NOTARY_OR_AFFIDAVIT", state: "CO", identifier: "", expiresOn: "2099-02-02" });
  const keptRow = (await loadCredentials(W3)).find((c) => c.rootId === numberedId);
  check("a blank number keeps the saved one", kept.ok && keptRow?.identifier === "5566", keptRow);
  const cleared = await editCredential(W3, W3, keptRow?.id ?? "", { kind: "NOTARY_OR_AFFIDAVIT", state: "CO", identifier: "", expiresOn: "2099-02-02", clearIdentifier: true });
  const clearedRow = (await loadCredentials(W3)).find((c) => c.rootId === numberedId);
  check("asking to take the number off appends a row without it; the old row stays", cleared.ok && cleared.changed === true && clearedRow?.identifier === null && (await p.workerCredential.count({ where: { workerId: W3, identifier: "5566" } })) === 2, clearedRow);
  const typed = await editCredential(W3, W3, clearedRow?.id ?? "", { kind: "NOTARY_OR_AFFIDAVIT", state: "CO", identifier: "N-778899", expiresOn: "2099-02-02", clearIdentifier: true });
  check("a number typed in wins over the box", typed.ok && (await loadCredentials(W3)).find((c) => c.rootId === numberedId)?.identifier === "8899", typed);

  // --- 7. Browsers have no access ---
  for (const table of ["WorkerSharing", "WorkerAvailability", "WorkerCredential"]) {
    for (const role of ["anon", "authenticated"]) {
      const r = await p.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        return tx.$queryRawUnsafe(`SELECT 1 FROM "public"."${table}" LIMIT 1`);
      }).then(() => "allowed", (e: unknown) => String(e));
      check(`${role} can't read ${table}`, /permission denied/.test(r), r);
    }
  }

  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
