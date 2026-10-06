/* C2.1 acceptance checks: the sharing model on real Postgres — versions, defaults, races, append-only history, credential supersession and no browser access (tests/acceptance/run.sh). */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { loadSharing, orgViewer, saveSharing } from "@/lib/sharing-data";
import { DEFAULT_SHARING, SHARE_PARTS, visibleParts } from "@/lib/sharing";

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
  const noop = await saveSharing(W1, ACTOR, DEFAULT_SHARING);
  check("saving the defaults before any save writes nothing", noop.ok && !noop.changed && (await p.workerSharing.count({ where: { workerId: W1 } })) === 0, noop);
  const s1 = await saveSharing(W1, ACTOR, { audiences: { ...all("RELATIONSHIP"), quality: "NOBODY" } });
  check("a change appends version 1 and an audit event", s1.ok && s1.changed && s1.version === 1 && (await p.auditEvent.count({ where: { action: "sharing.saved", entityId: W1 } })) === 1, s1);
  const same = await saveSharing(W1, ACTOR, { audiences: { ...all("RELATIONSHIP"), quality: "NOBODY" } });
  check("saving the same choices again is a no-op", same.ok && !same.changed && same.version === 1, same);
  const bad = await saveSharing(W1, ACTOR, { audiences: all("EVERYONE") });
  check("invalid choices are refused before the database", !bad.ok && (await p.workerSharing.count({ where: { workerId: W1 } })) === 1);
  const loaded = await loadSharing(W1);
  check("the latest version wins", loaded.version === 1 && loaded.choices.audiences.quality === "NOBODY" && loaded.choices.audiences.output === "RELATIONSHIP");

  // --- 2. Races: concurrent saves each get the next version ---
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    saveSharing(W2, W2, { audiences: all("RELATIONSHIP"), findable: true, workTypes: ["PETITION"], homeArea: "Denver", travelMiles: 10 + i })));
  const versions = (await p.workerSharing.findMany({ where: { workerId: W2 }, select: { version: true }, orderBy: { version: "asc" } })).map((r) => r.version);
  check("8 simultaneous different saves → versions 1..8, none lost or doubled", results.every((r) => r.ok && r.changed) && versions.join() === "1,2,3,4,5,6,7,8", versions);
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
  check("history is intact after the attempts", (await p.workerSharing.count({ where: { workerId: W1 } })) === 1 && (await p.workerCredential.count()) === 1);

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
  check("the unrelated org sees nothing by default", Object.values(visibleParts((await loadSharing(W1)).choices, v2)).every((x) => !x));
  await p.organization.update({ where: { id: ORG }, data: { approved: false } });
  const v3 = await orgViewer(W1, ORG);
  check("an org whose approval is withdrawn sees nothing", Object.values(visibleParts((await loadSharing(W1)).choices, v3)).every((x) => !x), v3);
  await p.organization.update({ where: { id: ORG }, data: { approved: true } });

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
