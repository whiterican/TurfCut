-- Negative control: run BEFORE w1-amendments.sql. With W1's and W2's SQL as they are, deleting a book's stops (what a 30-day
-- purge would do) fails as soon as one stop has an outcome. run.sh checks for the error below. If W1/W2 later contain the fix,
-- the error no longer appears: delete this file and the "not reproduced" branch in run.sh.
\set ON_ERROR_STOP off
BEGIN;
SELECT "id" AS j, "orgId" AS org FROM "Job" LIMIT 1 \gset
SELECT "id" AS p FROM "Profile" LIMIT 1 \gset
SELECT "id" AS e FROM "Engagement" LIMIT 1 \gset
SELECT gen_random_uuid() AS imp, gen_random_uuid() AS adr, gen_random_uuid() AS wb, gen_random_uuid() AS ws, gen_random_uuid() AS so \gset
INSERT INTO "AddressImport"("id","orgId","uploadedById","fileName","recordSource","purpose","license","rowCount","keptCount") VALUES (:'imp',:'org',:'p','f.csv','t','t','t',1,1);
INSERT INTO "ImportedAddress"("id","importId","rowNumber","line1","city","state","zip") VALUES (:'adr',:'imp',2,'1 Main St','Denver','CO','80202');
INSERT INTO "Walkbook"("id","jobId","importId","number","name","createdById") VALUES (:'wb',:'j',:'imp',1,'Book',:'p');
INSERT INTO "WalkbookStop"("id","walkbookId","addressId","stopNumber") VALUES (:'ws',:'wb',:'adr',1);
INSERT INTO "StopOutcome"("id","stopId","engagementId","outcome","recordedById") VALUES (:'so',:'ws',:'e','DONE',:'p');
DELETE FROM "WalkbookStop" WHERE "walkbookId" = :'wb';
ROLLBACK;
