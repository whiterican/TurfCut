-- Turfcut M0 seed — SQL version of prisma/seed.ts
-- Run AFTER the DDL above. Idempotent: safe to re-run (ON CONFLICT DO NOTHING).

-- --- Jurisdiction: CO / Denver v1, approved & current ---
INSERT INTO "public"."JurisdictionProfile"
  ("id","state","locality","version","isCurrent","approved","approvedAt","rules","createdAt")
VALUES
  ('00000000-0000-0000-0000-000000000021','CO','Denver',1,true,true,NOW(),
   '{"compensationAllowed":["HOURLY","SHIFT_RATE"],"perUnitAllowed":false,"workerRegistrationRequired":true,"badgeRequired":true,"affidavitRequired":true,"notes":"Seed rules - replace with counsel-approved text before pilot."}',
   NOW())
ON CONFLICT ("state","locality","version") DO NOTHING;

-- --- Organization: one approved circulation company ---
INSERT INTO "public"."Organization" ("id","name","approved","createdAt","updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001','Front Range Circulators',true,NOW(),NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Job: one published petition drive ---
INSERT INTO "public"."Job"
  ("id","orgId","jurisdictionId","type","title","description","status","startsAt","endsAt",
   "geography","compensationMethod","payRateCents","headcount","hiringMethod","requirements",
   "createdAt","updatedAt")
VALUES
  ('00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000021',
   'PETITION','Denver Ballot Initiative - Signature Drive',
   'Seed job for M0. Collect signatures, return packets daily.',
   'PUBLISHED',NOW(),NOW() + interval '30 days',
   '{"city":"Denver","state":"CO"}','HOURLY',2500,10,
   '{"mode":"application"}','{"badge":true,"training":"petition-basics"}',
   NOW(),NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Profiles + workers: three seeded circulators ---
INSERT INTO "public"."Profile" ("id","role","createdAt","updatedAt") VALUES
  ('00000000-0000-0000-0000-000000000101','WORKER',NOW(),NOW()),
  ('00000000-0000-0000-0000-000000000102','WORKER',NOW(),NOW()),
  ('00000000-0000-0000-0000-000000000103','WORKER',NOW(),NOW())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "public"."Worker" ("id","profileId","displayName","createdAt","updatedAt") VALUES
  ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000101','Alex Rivera',NOW(),NOW()),
  ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000102','Jordan Blake',NOW(),NOW()),
  ('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000103','Sam Torres',NOW(),NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Political preferences: worker 1 = matching_only, others private ---
INSERT INTO "public"."PoliticalPreference"
  ("id","workerId","visibilityMode","identityLabels","consentVersion","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000101',
   'MATCHING_ONLY','["unaffiliated"]',1,NOW()),
  ('00000000-0000-0000-0000-000000000112','00000000-0000-0000-0000-000000000102',
   'PRIVATE',NULL,1,NOW()),
  ('00000000-0000-0000-0000-000000000113','00000000-0000-0000-0000-000000000103',
   'PRIVATE',NULL,1,NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Audit: workers seeded ---
INSERT INTO "public"."AuditEvent"
  ("id","action","entityType","entityId","metadata","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000121','worker.seeded','Worker','00000000-0000-0000-0000-000000000101','{"displayName":"Alex Rivera"}',NOW()),
  ('00000000-0000-0000-0000-000000000122','worker.seeded','Worker','00000000-0000-0000-0000-000000000102','{"displayName":"Jordan Blake"}',NOW()),
  ('00000000-0000-0000-0000-000000000123','worker.seeded','Worker','00000000-0000-0000-0000-000000000103','{"displayName":"Sam Torres"}',NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Engagement + shift for worker 1 ---
INSERT INTO "public"."Engagement"
  ("id","jobId","workerId","status","applicationSnapshot","createdAt","updatedAt") VALUES
  ('00000000-0000-0000-0000-000000000031',
   '00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000101',
   'ACTIVE','{"seeded":true}',NOW(),NOW())
ON CONFLICT ("jobId","workerId") DO NOTHING;

INSERT INTO "public"."Shift"
  ("id","engagementId","startsAt","endsAt","status","checkInAt","checkOutAt","createdAt","updatedAt") VALUES
  ('00000000-0000-0000-0000-000000000201',
   '00000000-0000-0000-0000-000000000031',
   NOW() - interval '4 hours', NOW(), 'COMPLETED',
   NOW() - interval '4 hours', NOW(), NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Sample work events (append-only) ---
INSERT INTO "public"."WorkEvent" ("id","shiftId","type","payload","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000131','00000000-0000-0000-0000-000000000201',
   'PACKET_PICKUP','{"packetId":"PKT-0001","sheets":25}',NOW()),
  ('00000000-0000-0000-0000-000000000132','00000000-0000-0000-0000-000000000201',
   'DOOR_KNOCK','{"count":40}',NOW()),
  ('00000000-0000-0000-0000-000000000133','00000000-0000-0000-0000-000000000201',
   'CONTACT','{"count":18}',NOW()),
  ('00000000-0000-0000-0000-000000000134','00000000-0000-0000-0000-000000000201',
   'SIGNATURE_SUBMITTED','{"count":22}',NOW()),
  ('00000000-0000-0000-0000-000000000135','00000000-0000-0000-0000-000000000201',
   'PACKET_RETURN','{"packetId":"PKT-0001","sheetsReturned":25,"signatures":22}',NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Supervisor validation of the shift ---
INSERT INTO "public"."Validation" ("id","shiftId","status","reason","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000141','00000000-0000-0000-0000-000000000201',
   'APPROVED','Seed validation - packet reconciled.',NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Versioned metric snapshot for worker 1 ---
INSERT INTO "public"."ProfileMetric" ("id","workerId","version","metrics","computedAt") VALUES
  ('00000000-0000-0000-0000-000000000151','00000000-0000-0000-0000-000000000101',1,
   '{"doorsKnocked":40,"contacts":18,"signaturesSubmitted":22,"signaturesAccepted":22,"activeHours":4,"doorsPerActiveHour":10,"contactRate":0.45,"signaturesPerActiveHour":5.5}',
   NOW())
ON CONFLICT ("workerId","version") DO NOTHING;

-- --- Payout: approved earnings for the shift (4h x $25/h, 15% fee) ---
INSERT INTO "public"."Payout"
  ("id","workerId","engagementId","amountCents","feeCents","status","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000101',
   '00000000-0000-0000-0000-000000000031',10000,1500,'APPROVED',NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Audit: seed completed ---
INSERT INTO "public"."AuditEvent"
  ("id","action","entityType","entityId","metadata","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000124','seed.completed','Seed','m0',
   '{"org":"Front Range Circulators","job":"Denver Ballot Initiative - Signature Drive","workers":["Alex Rivera","Jordan Blake","Sam Torres"]}',
   NOW())
ON CONFLICT ("id") DO NOTHING;
