\set ON_ERROR_STOP on
\pset pager off
CREATE TEMP TABLE res(label text, ok boolean, detail text);
CREATE FUNCTION pg_temp.ok(l text, c boolean) RETURNS void LANGUAGE sql AS $$ INSERT INTO res VALUES (l, COALESCE(c, false), NULL) $$;
-- statement must be refused, with an error matching the pattern
CREATE FUNCTION pg_temp.fails(l text, stmt text, pat text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  INSERT INTO res VALUES (l, false, 'was allowed');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO res VALUES (l, SQLERRM ~* pat, CASE WHEN SQLERRM ~* pat THEN NULL ELSE 'wrong error: ' || SQLERRM END);
END $$;
CREATE FUNCTION pg_temp.succeeds(l text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  INSERT INTO res VALUES (l, true, NULL);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO res VALUES (l, false, 'refused: ' || SQLERRM);
END $$;

SELECT gen_random_uuid() AS j2, gen_random_uuid() AS e2, gen_random_uuid() AS s2,
       gen_random_uuid() AS v1, gen_random_uuid() AS v2, gen_random_uuid() AS v3, gen_random_uuid() AS v4,
       gen_random_uuid() AS q1, gen_random_uuid() AS q2, gen_random_uuid() AS q3, gen_random_uuid() AS qv2, gen_random_uuid() AS qv3,
       gen_random_uuid() AS o1, gen_random_uuid() AS o2, gen_random_uuid() AS o3,
       gen_random_uuid() AS imp, gen_random_uuid() AS adr1, gen_random_uuid() AS adr2, gen_random_uuid() AS wb, gen_random_uuid() AS ws1, gen_random_uuid() AS ws2,
       gen_random_uuid() AS so1, gen_random_uuid() AS so1b, gen_random_uuid() AS so2, gen_random_uuid() AS so3, gen_random_uuid() AS so4,
       gen_random_uuid() AS r1, gen_random_uuid() AS r2, gen_random_uuid() AS r3, gen_random_uuid() AS r4, gen_random_uuid() AS r5,
       gen_random_uuid() AS a1, gen_random_uuid() AS a2, gen_random_uuid() AS a3, gen_random_uuid() AS a4, gen_random_uuid() AS a5,
       gen_random_uuid() AS o3b, gen_random_uuid() AS ov3a, gen_random_uuid() AS ov3b,
       gen_random_uuid() AS imp2, gen_random_uuid() AS adr3, gen_random_uuid() AS adr4, gen_random_uuid() AS adr5, gen_random_uuid() AS wb2, gen_random_uuid() AS ws3,
       gen_random_uuid() AS so1c, gen_random_uuid() AS so_nh, gen_random_uuid() AS so_cb, gen_random_uuid() AS so_x, gen_random_uuid() AS so_cb2, gen_random_uuid() AS r6, gen_random_uuid() AS r7, gen_random_uuid() AS r8, gen_random_uuid() AS r9 \gset
SELECT (SELECT "id" FROM "Job" ORDER BY "createdAt" LIMIT 1) AS j1,
       (SELECT "orgId" FROM "Job" ORDER BY "createdAt" LIMIT 1) AS org,
       (SELECT "id" FROM "Profile" ORDER BY "createdAt" LIMIT 1) AS p,
       (SELECT "id" FROM "Engagement" ORDER BY "createdAt" LIMIT 1) AS e1,
       (SELECT "id" FROM "Shift" ORDER BY "createdAt" LIMIT 1) AS s1 \gset

-- Fixtures: a second job with its own engagement and shift.
CREATE TEMP TABLE jclone AS SELECT * FROM "Job" WHERE "id" = :'j1';
UPDATE jclone SET "id" = :'j2', "title" = 'Second job';
INSERT INTO "Job" SELECT * FROM jclone;
CREATE TEMP TABLE eclone AS SELECT * FROM "Engagement" WHERE "id" = :'e1';
UPDATE eclone SET "id" = :'e2', "jobId" = :'j2';
INSERT INTO "Engagement" SELECT * FROM eclone;
CREATE TEMP TABLE sclone AS SELECT * FROM "Shift" WHERE "id" = :'s1';
UPDATE sclone SET "id" = :'s2', "engagementId" = :'e2';
INSERT INTO "Shift" SELECT * FROM sclone;

-- W1 rows (with the amendments applied): two imports; a book on job 1 (two stops) and a book on job 2 (one stop).
-- Rows keep their source record ID and every other column of the file.
INSERT INTO "AddressImport"("id","orgId","uploadedById","fileName","recordSource","purpose","license","rowCount","keptCount") VALUES (:'imp', :'org', :'p', 'f.csv', 'test', 'test', 'test', 3, 3), (:'imp2', :'org', :'p', 'g.csv', 'test', 'test', 'test', 1, 1);
INSERT INTO "ImportedAddress"("id","importId","rowNumber","line1","city","state","zip","sourceRecordId","sourceData") VALUES
  (:'adr1', :'imp', 2, '1 Main St', 'Denver', 'CO', '80202', 'EC-1', '{"Name": "A Voter", "Party": "X", "Vote history": "2022G,2024G"}'),
  (:'adr2', :'imp', 3, '2 Main St', 'Denver', 'CO', '80202', 'EC-2', '{"Name": "B Voter"}'),
  (:'adr3', :'imp', 4, '3 Main St', 'Denver', 'CO', '80202', 'EC-3', NULL),
  (:'adr4', :'imp2', 2, '4 Main St', 'Denver', 'CO', '80202', 'EC-1', '{"Name": "C Voter"}');
INSERT INTO "Walkbook"("id","jobId","importId","number","name","createdById") VALUES (:'wb', :'j1', :'imp', 1, 'Book 1', :'p'), (:'wb2', :'j2', :'imp', 1, 'Book 1 on job 2', :'p');
INSERT INTO "WalkbookStop"("id","walkbookId","addressId","stopNumber") VALUES (:'ws1', :'wb', :'adr1', 1), (:'ws2', :'wb', :'adr2', 2), (:'ws3', :'wb2', :'adr3', 1);

-- ===== W1 amendments: everything stored, and the 30-day clock =====
SELECT pg_temp.fails('a record ID names one row of one import', format($f$INSERT INTO "ImportedAddress"("id","importId","rowNumber","line1","city","state","zip","sourceRecordId") VALUES (%L,%L,9,'9 Main St','Denver','CO','80202','EC-1')$f$, :'adr5', :'imp'), 'ImportedAddress_importId_sourceRecordId_key');
SELECT pg_temp.ok('...the same record ID is fine in another import (adr4 in the second import has EC-1)', (SELECT count(*) FROM "ImportedAddress" WHERE "sourceRecordId" = 'EC-1') = 2);
SELECT pg_temp.fails('stored columns must be a JSON object (an array is refused)', format($f$UPDATE "ImportedAddress" SET "sourceData" = '["a"]' WHERE "id" = %L$f$, :'adr3'), 'ImportedAddress_sourceData');
SELECT pg_temp.fails('stored columns are capped at 16 KB a row', format($f$UPDATE "ImportedAddress" SET "sourceData" = jsonb_build_object('k', repeat('x', 20000)) WHERE "id" = %L$f$, :'adr3'), 'ImportedAddress_sourceData');
SELECT pg_temp.fails('an empty record ID is refused', format($f$UPDATE "ImportedAddress" SET "sourceRecordId" = '' WHERE "id" = %L$f$, :'adr3'), 'ImportedAddress_sourceRecordId_length');
SELECT pg_temp.fails('an unknown source system is refused', format($f$UPDATE "AddressImport" SET "sourceSystem" = 'BOGUS' WHERE "id" = %L$f$, :'imp'), 'AddressImport_sourceSystem');
SELECT pg_temp.succeeds('a known source system is accepted', format($f$UPDATE "AddressImport" SET "sourceSystem" = 'ECANVASSER' WHERE "id" = %L$f$, :'imp'));
SELECT pg_temp.ok('deleteAfter defaults to 30 days after the import', (SELECT "deleteAfter" - "createdAt" = INTERVAL '30 days' FROM "AddressImport" WHERE "id" = :'imp'));
SELECT pg_temp.fails('deleteAfter can not be at or before the import''s own time', format($f$UPDATE "AddressImport" SET "deleteAfter" = "createdAt" WHERE "id" = %L$f$, :'imp'), 'AddressImport_deleteAfter');

-- ===== PollVersion: draft, the one-draft rule, the lock =====
SELECT pg_temp.succeeds('v1 draft on job 1', format($f$INSERT INTO "PollVersion"("id","jobId","version","title","conductedBy","disclosure","createdById") VALUES (%L,%L,1,'t','Acme Research','We are conducting research.',%L)$f$, :'v1', :'j1', :'p'));
SELECT pg_temp.fails('a second draft on the same job is refused', format($f$INSERT INTO "PollVersion"("id","jobId","version","title","conductedBy","disclosure","createdById") VALUES (%L,%L,2,'t','x','y',%L)$f$, :'v3', :'j1', :'p'), 'PollVersion_one_draft_per_job');
SELECT pg_temp.succeeds('v2 draft on job 2', format($f$INSERT INTO "PollVersion"("id","jobId","version","title","conductedBy","disclosure","createdById") VALUES (%L,%L,1,'t','Acme Research','We are conducting research.',%L)$f$, :'v2', :'j2', :'p'));
SELECT pg_temp.succeeds('questions and options on a draft', format($f$
  INSERT INTO "PollQuestion"("id","versionId","position","kind","text") VALUES (%L,%L,1,'CHOICE','Q1'),(%L,%L,2,'SCALE_5','Q2'),(%L,%L,3,'CHOICE','Q3');
  INSERT INTO "PollOption"("id","questionId","position","label") VALUES (%L,%L,1,'Yes'),(%L,%L,2,'No'),(%L,%L,1,'Other question option'),(%L,%L,2,'Other question option 2');
  INSERT INTO "PollQuestion"("id","versionId","position","kind","text") VALUES (%L,%L,1,'CHOICE','Job 2 question');
$f$, :'q1',:'v1', :'q2',:'v1', :'q3',:'v1', :'o1',:'q1', :'o2',:'q1', :'o3',:'q3', :'o3b',:'q3', :'qv2',:'v2'));
SELECT pg_temp.succeeds('a draft can still be edited', format($f$UPDATE "PollQuestion" SET "text" = 'Q1 edited' WHERE "id" = %L$f$, :'q1'));
SELECT pg_temp.fails('lock refused: v2 has a CHOICE question with no options', format($f$UPDATE "PollVersion" SET "status"='LOCKED', "lockedAt"=now(), "researchAttestedById"=%L, "researchAttestedAt"=now() WHERE "id" = %L$f$, :'p', :'v2'), 'at least two options');
SELECT pg_temp.fails('locking without the research statement is refused', format($f$UPDATE "PollVersion" SET "status"='LOCKED', "lockedAt"=now() WHERE "id" = %L$f$, :'v1'), 'PollVersion_locked');
SELECT pg_temp.fails('status LOCKED without lockedAt is refused', format($f$UPDATE "PollVersion" SET "status"='LOCKED', "researchAttestedById"=%L, "researchAttestedAt"=now() WHERE "id" = %L$f$, :'p', :'v1'), 'PollVersion_locked');
SELECT pg_temp.succeeds('lock v1 (statement recorded)', format($f$UPDATE "PollVersion" SET "status"='LOCKED', "lockedAt"=now(), "researchAttestedById"=%L, "researchAttestedAt"=now() WHERE "id" = %L$f$, :'p', :'v1'));
SELECT pg_temp.fails('locked: the version can not be edited', format($f$UPDATE "PollVersion" SET "title"='changed' WHERE "id" = %L$f$, :'v1'), 'is locked');
SELECT pg_temp.fails('locked: the version can not be deleted', format($f$DELETE FROM "PollVersion" WHERE "id" = %L$f$, :'v1'), 'is locked');
SELECT pg_temp.fails('locked: a question can not be added', format($f$INSERT INTO "PollQuestion"("id","versionId","position","kind","text") VALUES (gen_random_uuid(),%L,9,'CHOICE','late')$f$, :'v1'), 'is locked');
SELECT pg_temp.fails('locked: a question can not be edited', format($f$UPDATE "PollQuestion" SET "text"='x' WHERE "id" = %L$f$, :'q1'), 'is locked');
SELECT pg_temp.fails('locked: a question can not be deleted', format($f$DELETE FROM "PollQuestion" WHERE "id" = %L$f$, :'q3'), 'is locked');
SELECT pg_temp.fails('locked: an option can not be added', format($f$INSERT INTO "PollOption"("id","questionId","position","label") VALUES (gen_random_uuid(),%L,9,'late')$f$, :'q1'), 'is locked');
SELECT pg_temp.fails('locked: an option can not be edited', format($f$UPDATE "PollOption" SET "label"='x' WHERE "id" = %L$f$, :'o1'), 'is locked');
SELECT pg_temp.fails('locked: an option can not be deleted', format($f$DELETE FROM "PollOption" WHERE "id" = %L$f$, :'o2'), 'is locked');
SELECT pg_temp.fails('a question can not move to another version (here: into the locked one)', format($f$UPDATE "PollQuestion" SET "versionId"=%L WHERE "id" = %L$f$, :'v1', :'qv2'), 'can not move');
SELECT pg_temp.fails('TRUNCATE of the versions is refused', $f$TRUNCATE "PollVersion" CASCADE$f$, 'append-only');
-- a second version for job 1 (v1 locked), to test correction across versions
SELECT pg_temp.fails('a version can not be created already LOCKED', format($f$INSERT INTO "PollVersion"("id","jobId","version","title","conductedBy","disclosure","createdById","status","lockedAt","researchAttestedById","researchAttestedAt") VALUES (gen_random_uuid(),%L,9,'t','x','y',%L,'LOCKED',now(),%L,now())$f$, :'j2', :'p', :'p'), 'created as a DRAFT');
SELECT pg_temp.succeeds('v3: a new draft after the first is locked', format($f$INSERT INTO "PollVersion"("id","jobId","version","title","conductedBy","disclosure","createdById") VALUES (%L,%L,2,'t','x','y',%L)$f$, :'v3', :'j1', :'p'));
SELECT pg_temp.fails('lock refused: a version with no questions', format($f$UPDATE "PollVersion" SET "status"='LOCKED', "lockedAt"=now(), "researchAttestedById"=%L, "researchAttestedAt"=now() WHERE "id" = %L$f$, :'p', :'v3'), 'no questions');
SELECT pg_temp.succeeds('v3 gets a CHOICE question with one option', format($f$INSERT INTO "PollQuestion"("id","versionId","position","kind","text") VALUES (%L,%L,1,'CHOICE','v3 question'); INSERT INTO "PollOption"("id","questionId","position","label") VALUES (%L,%L,1,'Only option')$f$, :'qv3', :'v3', :'ov3a', :'qv3'));
SELECT pg_temp.fails('lock refused: a CHOICE question with one option', format($f$UPDATE "PollVersion" SET "status"='LOCKED', "lockedAt"=now(), "researchAttestedById"=%L, "researchAttestedAt"=now() WHERE "id" = %L$f$, :'p', :'v3'), 'at least two options');
SELECT pg_temp.succeeds('v3 CHOICE question gets a second option', format($f$INSERT INTO "PollOption"("id","questionId","position","label") VALUES (%L,%L,2,'Second option')$f$, :'ov3b', :'qv3'));
SELECT pg_temp.succeeds('a draft question can change kind', format($f$UPDATE "PollQuestion" SET "kind"='SCALE_5' WHERE "id" = %L$f$, :'qv3'));
SELECT pg_temp.fails('lock refused: a SCALE_5 question that still has options', format($f$UPDATE "PollVersion" SET "status"='LOCKED', "lockedAt"=now(), "researchAttestedById"=%L, "researchAttestedAt"=now() WHERE "id" = %L$f$, :'p', :'v3'), 'SCALE_5 question none');
SELECT pg_temp.succeeds('...and back to CHOICE', format($f$UPDATE "PollQuestion" SET "kind"='CHOICE' WHERE "id" = %L$f$, :'qv3'));
SELECT pg_temp.succeeds('lock v3 (a usable shape)', format($f$UPDATE "PollVersion" SET "status"='LOCKED', "lockedAt"=now(), "researchAttestedById"=%L, "researchAttestedAt"=now() WHERE "id" = %L$f$, :'p', :'v3'));

-- ===== Doors: W2's real StopOutcome rows (append-only; the newest row for a stop is its state) =====
INSERT INTO "StopOutcome"("id","stopId","engagementId","shiftId","outcome","recordedById","createdAt") VALUES
  (:'so1',  :'ws1', :'e1', :'s1', 'DONE', :'p', now()), (:'so1b', :'ws1', :'e1', :'s1', 'DONE', :'p', now()), (:'so1c', :'ws1', :'e1', :'s1', 'DONE', :'p', now()),
  (:'so2',  :'ws3', :'e2', :'s2', 'DONE', :'p', now()),
  -- stop 2's history, oldest first: so4 (DONE), so_cb (COME_BACK), so3 (DONE), so_nh (NOT_HOME), so_cb2 (a later COME_BACK row)
  (:'so4',  :'ws2', :'e1', :'s1', 'DONE', :'p', now() - INTERVAL '5 hours'), (:'so_cb', :'ws2', :'e1', :'s1', 'COME_BACK', :'p', now() - INTERVAL '4 hours'),
  (:'so3',  :'ws2', :'e1', :'s1', 'DONE', :'p', now() - INTERVAL '3 hours'), (:'so_nh', :'ws2', :'e1', :'s1', 'NOT_HOME', :'p', now() - INTERVAL '2 hours'),
  (:'so_cb2', :'ws2', :'e1', :'s1', 'COME_BACK', :'p', now() - INTERVAL '1 hour'),
  -- W2's SQL doesn't tie an outcome's engagement to its stop's walkbook: this one is a job-2 stop recorded under a job-1 engagement.
  (:'so_x', :'ws3', :'e1', :'s1', 'DONE', :'p', now());

-- ===== PollResponse =====
SELECT pg_temp.succeeds('R1: a response on the locked version, for a door on the same job', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId") VALUES (%L,%L,%L,'COMPLETE',true,%L)$f$, :'r1', :'v1', :'so1', :'p'));
SELECT pg_temp.fails('a response on a DRAFT version is refused', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId") VALUES (gen_random_uuid(),%L,%L,'COMPLETE',true,%L)$f$, :'v2', :'so2', :'p'), 'is not locked');
SELECT pg_temp.fails('a response for a door on ANOTHER job is refused (cross-job)', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId") VALUES (gen_random_uuid(),%L,%L,'COMPLETE',true,%L)$f$, :'v1', :'so2', :'p'), 'not all on the same job');
SELECT pg_temp.fails('a response without the disclosure read is refused', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId") VALUES (gen_random_uuid(),%L,%L,'COMPLETE',false,%L)$f$, :'v1', :'so3', :'p'), 'PollResponse_disclosure');
SELECT pg_temp.fails('a second poll for the same door outcome is refused', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId") VALUES (gen_random_uuid(),%L,%L,'COMPLETE',true,%L)$f$, :'v1', :'so1', :'p'), 'PollResponse_stopOutcomeId_key');
SELECT pg_temp.fails('a re-sent door (same id) is saved once', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId") VALUES (%L,%L,%L,'COMPLETE',true,%L)$f$, :'r1', :'v1', :'so3', :'p'), 'PollResponse_pkey');

SELECT pg_temp.fails('a response is refused when the stop is in another job''s walkbook, even if the engagement is on the poll''s job', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId") VALUES (gen_random_uuid(),%L,%L,'COMPLETE',true,%L)$f$, :'v1', :'so_x', :'p'), 'not all on the same job');
SELECT pg_temp.fails('a COMPLETE poll on a NOT_HOME outcome is refused', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId") VALUES (gen_random_uuid(),%L,%L,'COMPLETE',true,%L)$f$, :'v1', :'so_nh', :'p'), 'needs a DONE');
SELECT pg_temp.fails('a PARTIAL poll on a DONE outcome is refused', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId") VALUES (gen_random_uuid(),%L,%L,'PARTIAL',true,%L)$f$, :'v1', :'so1c', :'p'), 'COME_BACK or REFUSED');
SELECT pg_temp.succeeds('a PARTIAL poll on a COME_BACK outcome is accepted (R6)', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId") VALUES (%L,%L,%L,'PARTIAL',true,%L)$f$, :'r6', :'v1', :'so_cb', :'p'));

-- ===== PollAnswer =====
SELECT pg_temp.succeeds('A1: a choice answer', format($f$INSERT INTO "PollAnswer"("id","responseId","versionId","questionId","optionId") VALUES (%L,%L,%L,%L,%L)$f$, :'a1', :'r1', :'v1', :'q1', :'o1'));
SELECT pg_temp.succeeds('A2: a scale answer', format($f$INSERT INTO "PollAnswer"("id","responseId","versionId","questionId","scale") VALUES (%L,%L,%L,%L,4)$f$, :'a2', :'r1', :'v1', :'q2'));
SELECT pg_temp.fails('one answer per question per response', format($f$INSERT INTO "PollAnswer"("id","responseId","versionId","questionId","optionId") VALUES (gen_random_uuid(),%L,%L,%L,%L)$f$, :'r1', :'v1', :'q1', :'o2'), 'PollAnswer_responseId_questionId_key');
SELECT pg_temp.fails('an option from ANOTHER question is refused', format($f$INSERT INTO "PollAnswer"("id","responseId","versionId","questionId","optionId") VALUES (gen_random_uuid(),%L,%L,%L,%L)$f$, :'r1', :'v1', :'q3', :'o1'), 'PollAnswer_option_fkey');
SELECT pg_temp.fails('a question from ANOTHER version is refused', format($f$INSERT INTO "PollAnswer"("id","responseId","versionId","questionId","optionId") VALUES (gen_random_uuid(),%L,%L,%L,%L)$f$, :'r1', :'v1', :'qv2', :'o1'), 'PollAnswer_question_fkey');
SELECT pg_temp.fails('an answer claiming a different version than its response is refused', format($f$INSERT INTO "PollAnswer"("id","responseId","versionId","questionId","optionId") VALUES (gen_random_uuid(),%L,%L,%L,%L)$f$, :'r1', :'v3', :'q3', :'o3'), 'PollAnswer_response_fkey|PollAnswer_question_fkey');
SELECT pg_temp.fails('scale 6 is refused', format($f$INSERT INTO "PollAnswer"("id","responseId","versionId","questionId","scale") VALUES (gen_random_uuid(),%L,%L,%L,6)$f$, :'r1', :'v1', :'q3'), 'PollAnswer_scale|PollAnswer_one_value|does not take');
SELECT pg_temp.fails('an option AND a scale is refused', format($f$INSERT INTO "PollAnswer"("id","responseId","versionId","questionId","optionId","scale") VALUES (gen_random_uuid(),%L,%L,%L,%L,3)$f$, :'r1', :'v1', :'q3', :'o3'), 'PollAnswer_one_value');
SELECT pg_temp.fails('neither an option nor a scale is refused', format($f$INSERT INTO "PollAnswer"("id","responseId","versionId","questionId") VALUES (gen_random_uuid(),%L,%L,%L)$f$, :'r1', :'v1', :'q3'), 'PollAnswer_one_value|does not take this kind');
SELECT pg_temp.fails('a scale answer to a CHOICE question is refused', format($f$INSERT INTO "PollAnswer"("id","responseId","versionId","questionId","scale") VALUES (gen_random_uuid(),%L,%L,%L,3)$f$, :'r1', :'v1', :'q3'), 'does not take this kind');
SELECT pg_temp.fails('an option answer to a SCALE question is refused', format($f$INSERT INTO "PollAnswer"("id","responseId","versionId","questionId","optionId") VALUES (gen_random_uuid(),%L,%L,%L,%L)$f$, :'r1', :'v1', :'q2', :'o1'), 'PollAnswer_option_fkey|does not take');

-- ===== Append-only =====
SELECT pg_temp.fails('a response can not be updated', format($f$UPDATE "PollResponse" SET "completion"='PARTIAL' WHERE "id"=%L$f$, :'r1'), 'append-only');
SELECT pg_temp.fails('a response can not be deleted', format($f$DELETE FROM "PollResponse" WHERE "id"=%L$f$, :'r1'), 'append-only');
SELECT pg_temp.fails('an answer can not be updated', format($f$UPDATE "PollAnswer" SET "scale"=1 WHERE "id"=%L$f$, :'a2'), 'append-only');
SELECT pg_temp.fails('an answer can not be deleted', format($f$DELETE FROM "PollAnswer" WHERE "id"=%L$f$, :'a1'), 'append-only');
SELECT pg_temp.fails('TRUNCATE of responses is refused', $f$TRUNCATE "PollResponse" CASCADE$f$, 'append-only');
SELECT pg_temp.fails('TRUNCATE of answers is refused', $f$TRUNCATE "PollAnswer"$f$, 'append-only');

-- ===== Corrections: a new response that supersedes one earlier response =====
SELECT pg_temp.succeeds('R2 corrects R1 (re-recorded against the door''s corrected outcome row)', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId","supersedesId") VALUES (%L,%L,%L,'COMPLETE',true,%L,%L)$f$, :'r2', :'v1', :'so1b', :'p', :'r1'));
SELECT pg_temp.succeeds('A3: R2''s answer', format($f$INSERT INTO "PollAnswer"("id","responseId","versionId","questionId","optionId") VALUES (%L,%L,%L,%L,%L)$f$, :'a3', :'r2', :'v1', :'q1', :'o2'));
SELECT pg_temp.fails('R1 can be superseded only once', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId","supersedesId") VALUES (gen_random_uuid(),%L,%L,'COMPLETE',true,%L,%L)$f$, :'v1', :'so1c', :'p', :'r1'), 'PollResponse_supersedesId_key|PollResponse_supersedesId_versionId_key');
SELECT pg_temp.fails('a response can not supersede itself', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId","supersedesId") VALUES (%L,%L,%L,'COMPLETE',true,%L,%L)$f$, :'r5', :'v1', :'so4', :'p', :'r5'), 'PollResponse_not_self');
SELECT pg_temp.fails('a correction can not move a response to another version', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId","supersedesId") VALUES (gen_random_uuid(),%L,%L,'COMPLETE',true,%L,%L)$f$, :'v3', :'so1c', :'p', :'r2'), 'PollResponse_supersedes_fkey');
SELECT pg_temp.fails('a correction must be on the same stop as the response it supersedes', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId","supersedesId") VALUES (gen_random_uuid(),%L,%L,'COMPLETE',true,%L,%L)$f$, :'v1', :'so3', :'p', :'r2'), 'same stop');
-- results rule: count only responses nothing supersedes
SELECT pg_temp.ok('results count only current responses: R1 is superseded, so its answers are left out',
  (SELECT count(*) FROM "PollAnswer" a WHERE a."versionId"=:'v1' AND a."questionId"=:'q1' AND NOT EXISTS (SELECT 1 FROM "PollResponse" s WHERE s."supersedesId" = a."responseId")) = 1
  AND (SELECT a."optionId" FROM "PollAnswer" a WHERE a."versionId"=:'v1' AND a."questionId"=:'q1' AND NOT EXISTS (SELECT 1 FROM "PollResponse" s WHERE s."supersedesId" = a."responseId")) = :'o2');

-- A stop can be visited twice (a PARTIAL at COME_BACK, then a COMPLETE at DONE): both are kept, and results use the newest
-- response per stop that nothing supersedes, a COMPLETE one before a PARTIAL one, then by the stop outcome's time (W2's own "newest"),
-- not by when the response row was inserted. The database doesn't force one response per stop; that is this rule's job.
SELECT pg_temp.succeeds('R7: a COMPLETE poll on the same stop as R6 (a second visit)', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId") VALUES (%L,%L,%L,'COMPLETE',true,%L)$f$, :'r7', :'v1', :'so3', :'p'));
SELECT pg_temp.succeeds('R8: a later row corrects the older PARTIAL visit (R6) on the same stop', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId","supersedesId") VALUES (%L,%L,%L,'PARTIAL',true,%L,%L)$f$, :'r8', :'v1', :'so_cb2', :'p', :'r6'));
SELECT pg_temp.succeeds('R9: a COMPLETE poll for the OLDEST visit (so4) reaches the server last', format($f$INSERT INTO "PollResponse"("id","versionId","stopOutcomeId","completion","disclosureRead","actorId") VALUES (%L,%L,%L,'COMPLETE',true,%L)$f$, :'r9', :'v1', :'so4', :'p'));
WITH cur AS (
  SELECT DISTINCT ON (so."stopId") so."stopId" AS stop, r."id" AS rid
    FROM "PollResponse" r JOIN "StopOutcome" so ON so."id" = r."stopOutcomeId"
   WHERE r."versionId" = :'v1' AND NOT EXISTS (SELECT 1 FROM "PollResponse" s WHERE s."supersedesId" = r."id")
   ORDER BY so."stopId", (r."completion" = 'COMPLETE') DESC, so."createdAt" DESC, r."createdAt" DESC, r."id" DESC)
SELECT pg_temp.ok('results: one current response per stop (stop 1 -> R2; stop 2 -> R7: COMPLETE beats the newer corrected PARTIAL R8, and the newest visit beats R9, which arrived last for the oldest visit)',
  (SELECT rid FROM cur WHERE stop = :'ws1') = :'r2' AND (SELECT rid FROM cur WHERE stop = :'ws2') = :'r7' AND (SELECT count(*) FROM cur) = 2);

-- ===== The 30-day purge: the import's addresses (with every stored column and record ID) go; stops, outcomes and poll rows stay =====
CREATE TEMP TABLE before AS SELECT (SELECT count(*) FROM "PollResponse") AS r, (SELECT count(*) FROM "PollAnswer") AS a, (SELECT count(*) FROM "StopOutcome") AS o, (SELECT count(*) FROM "WalkbookStop") AS s, (SELECT count(*) FROM "Walkbook") AS w;
SELECT pg_temp.succeeds('purge: delete the import''s addresses, with stop outcomes and poll rows present', format($f$DELETE FROM "ImportedAddress" WHERE "importId" = %L$f$, :'imp'));
SELECT pg_temp.ok('purge left every response, answer, outcome, stop and book in place', (SELECT r = (SELECT count(*) FROM "PollResponse") AND a = (SELECT count(*) FROM "PollAnswer") AND o = (SELECT count(*) FROM "StopOutcome") AND s = (SELECT count(*) FROM "WalkbookStop") AND w = (SELECT count(*) FROM "Walkbook") FROM before));
SELECT pg_temp.ok('purge: the stops now have no address', (SELECT count(*) FROM "WalkbookStop" WHERE "walkbookId" IN (:'wb', :'wb2')) = 3 AND (SELECT count(*) FROM "WalkbookStop" WHERE "walkbookId" IN (:'wb', :'wb2') AND "addressId" IS NOT NULL) = 0);
SELECT pg_temp.ok('purge: no address, record ID or stored column is left for the import', (SELECT count(*) FROM "ImportedAddress" WHERE "importId" = :'imp') = 0);
SELECT pg_temp.ok('purge: another import''s addresses are untouched', (SELECT count(*) FROM "ImportedAddress" WHERE "importId" = :'imp2' AND "sourceRecordId" = 'EC-1' AND "sourceData" IS NOT NULL) = 1);
SELECT pg_temp.succeeds('the import can then be marked purged (it is not append-only)', format($f$UPDATE "AddressImport" SET "purgedAt" = now() WHERE "id" = %L$f$, :'imp'));

-- ===== Server-only =====
SELECT pg_temp.ok('RLS is on for all five poll tables', (SELECT count(*) FROM pg_class c WHERE c.relname IN ('PollVersion','PollQuestion','PollOption','PollResponse','PollAnswer') AND c.relrowsecurity) = 5);
SELECT pg_temp.fails('anon can not read', 'SET LOCAL ROLE anon; SELECT count(*) FROM "PollAnswer"', 'permission denied');
SELECT pg_temp.fails('authenticated can not read', 'SET LOCAL ROLE authenticated; SELECT count(*) FROM "PollResponse"', 'permission denied');

\echo
SELECT label, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail FROM res ORDER BY ok, label;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM res;
