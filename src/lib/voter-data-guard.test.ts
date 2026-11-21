import { describe, expect, it } from "vitest";
import { modelQueryProblem, rawQueryProblem } from "./voter-data-guard";

describe("voter-data guard: model queries", () => {
  it("refuses a protected column named anywhere, including a select built elsewhere or a key computed at run time", () => {
    const built = { select: { id: true, sourceData: true } };
    expect(modelQueryProblem("ImportedAddress", "findMany", built)).toMatch(/ImportedAddress/);
    const key = ["source", "RecordId"].join("");
    expect(modelQueryProblem("ImportedAddress", "findFirst", { select: { [key]: true } })).not.toBeNull();
    expect(modelQueryProblem("ImportedAddress", "findMany", { select: { id: true }, where: { sourceRecordId: "123" } })).not.toBeNull();
    expect(modelQueryProblem("ImportedAddress", "groupBy", { by: ["sourceRecordId"] })).not.toBeNull();
    expect(modelQueryProblem("ImportedAddress", "findMany", { select: { id: true }, orderBy: [{ sourceData: "asc" }] })).not.toBeNull();
    expect(modelQueryProblem("AddressImport", "findMany", { select: { droppedColumns: true } })).not.toBeNull();
    expect(modelQueryProblem("WalkbookStop", "findMany", { select: { address: { select: { sourceData: true } } } })).not.toBeNull();
  });

  it("refuses a whole row of an import table, at the top or through a relation", () => {
    for (const op of ["findMany", "findFirst", "findUnique", "create", "update", "upsert", "delete", "createManyAndReturn"]) {
      expect(modelQueryProblem("ImportedAddress", op, { where: { id: "x" } })).toMatch(/without a select/);
      expect(modelQueryProblem("AddressImport", op, {})).toMatch(/without a select/);
    }
    expect(modelQueryProblem("WalkbookStop", "findMany", { include: { address: true } })).toMatch(/WalkbookStop.address/);
    expect(modelQueryProblem("WalkbookStop", "findMany", { select: { address: true } })).toMatch(/WalkbookStop.address/);
    expect(modelQueryProblem("Walkbook", "findMany", { include: { import: true } })).toMatch(/Walkbook.import/);
    // Two relations deep: a stop's walkbook's import, whole.
    expect(modelQueryProblem("WalkbookStop", "findMany", { select: { walkbook: { select: { import: true } } } })).toMatch(/Walkbook.import/);
    expect(modelQueryProblem("Walkbook", "findMany", { include: { import: { include: { addresses: true } } } })).not.toBeNull();
  });

  it("lets through what walkbooks are for: the address itself, counts, deletes, and everything else in the app", () => {
    expect(modelQueryProblem("WalkbookStop", "findMany", { select: { stopNumber: true, address: { select: { line1: true, unit: true, city: true, state: true, zip: true, lat: true, lng: true } } } })).toBeNull();
    expect(modelQueryProblem("ImportedAddress", "count", { where: { importId: "x" } })).toBeNull();
    expect(modelQueryProblem("ImportedAddress", "deleteMany", { where: { importId: "x" } })).toBeNull();
    expect(modelQueryProblem("ImportedAddress", "createMany", { data: [{ line1: "1 Main St" }] })).toBeNull();
    expect(modelQueryProblem("AddressImport", "findFirst", { select: { id: true, purgedAt: true } })).toBeNull();
    expect(modelQueryProblem("Walkbook", "findMany", { include: { import: { select: { fileName: true } } } })).toBeNull();
    expect(modelQueryProblem("Shift", "findMany", { include: { events: true } })).toBeNull();
    // A value that happens to read like a column name is only a value.
    expect(modelQueryProblem("Job", "findMany", { where: { title: "sourceData" } })).toBeNull();
  });
});

describe("voter-data guard: raw SQL", () => {
  it("refuses a protected column, or an import table read whole", () => {
    expect(rawQueryProblem('SELECT ia."sourceRecordId" FROM "ImportedAddress" ia')).not.toBeNull();
    expect(rawQueryProblem('SELECT * FROM "ImportedAddress"')).not.toBeNull();
    expect(rawQueryProblem('SELECT ia.* FROM "WalkbookStop" s JOIN "ImportedAddress" ia ON ia."id" = s."addressId"')).not.toBeNull();
    expect(rawQueryProblem('SELECT to_jsonb(ia) FROM "ImportedAddress" ia')).not.toBeNull();
    expect(rawQueryProblem('SELECT row_to_json(x) FROM "AddressImport" x')).not.toBeNull();
    expect(rawQueryProblem('SELECT ia::text FROM "ImportedAddress" ia')).not.toBeNull();
  });
  it("refuses every way round the reviewer found (Nov 21): a whole row however it is spelled, cast or wrapped", () => {
    const bypasses = [
      'SELECT DISTINCT ON (ia."importId") * FROM "ImportedAddress" ia',
      'SELECT*FROM "ImportedAddress"',
      'SELECT/**/* FROM "ImportedAddress"',
      'SELECT ALL * FROM "ImportedAddress"',
      'TABLE "ImportedAddress"',
      'TABLE public."AddressImport"',
      'SELECT (ia).* FROM "ImportedAddress" ia',
      'SELECT json_build_array(ia) FROM "ImportedAddress" ia',
      "SELECT jsonb_build_object('r', ia) FROM \"ImportedAddress\" ia",
      'SELECT jsonb_object_agg(ia."id", ia) FROM "ImportedAddress" ia',
      'SELECT array_to_json(ARRAY[ia]) FROM "ImportedAddress" ia',
      'SELECT CAST(ia AS text) FROM "ImportedAddress" ia',
      'SELECT ia::varchar FROM "ImportedAddress" ia',
      'SELECT ia::"text" FROM "ImportedAddress" AS ia',
      "SELECT format('%s', ia) FROM \"ImportedAddress\" ia",
      'SELECT concat(ia) FROM "public"."ImportedAddress" ia',
      'SELECT x FROM "ImportedAddress" x',
      'SELECT "ImportedAddress" FROM "ImportedAddress"',
      'SELECT s."id", "IA" FROM "WalkbookStop" s JOIN "ImportedAddress" "IA" ON "IA"."id" = s."addressId"',
      "SELECT table_to_xml('public.\"ImportedAddress\"', true, false, '')",
      'SELECT U&"sourc\\0065Data" FROM U&"Imported\\0041ddress"',
      "SELECT query_to_xml($1, true, false, '')::text",
      "SELECT query_to_xml('sel'||'ect * fr'||'om \"Imported'||'Address\"', true, false, '')",
      'CREATE VIEW v AS SELECT * FROM "ImportedAddress"',
      'ALTER TABLE "ImportedAddress" RENAME TO x',
      "DO $$ BEGIN PERFORM 1; END $$",
      'SELECT ia."droppedColumns" FROM "AddressImport" ia',
      'SELECT "ImportedAddress"."sourceData" FROM "ImportedAddress"',
    ];
    for (const sql of bypasses) expect(rawQueryProblem(sql), sql).not.toBeNull();
  });

  it("lets through the raw SQL the app runs: the cut, the counts and the console's join", () => {
    const cut = 'SELECT a."id", a."line1", a."unit", a."zip" FROM "public"."ImportedAddress" a WHERE a."importId" = ::uuid AND NOT EXISTS ( SELECT 1 FROM "public"."WalkbookStop" s JOIN "public"."Walkbook" w ON w."id" = s."walkbookId" JOIN "public"."ImportedAddress" b ON b."id" = s."addressId" WHERE w."jobId" = ::uuid AND b."zip" = a."zip" AND upper(b."line1") = upper(a."line1") AND upper(coalesce(b."unit", \'\')) = upper(coalesce(a."unit", \'\')))';
    expect(rawQueryProblem(cut)).toBeNull();
    expect(rawQueryProblem('SELECT a."importId", count(*)::int AS n FROM "public"."ImportedAddress" a WHERE a."importId" = ANY( ::uuid[]) GROUP BY a."importId"')).toBeNull();
    const console = 'SELECT s."id", ia."line1", ia."lat", ia."lng" FROM "public"."WalkbookStop" s JOIN "public"."Walkbook" w ON w."id" = s."walkbookId" LEFT JOIN "public"."ImportedAddress" ia ON ia."id" = s."addressId" LEFT JOIN LATERAL ( SELECT a."engagementId" FROM "public"."WalkbookAssignment" a WHERE a."walkbookId" = w."id" LIMIT 1 ) h ON true WHERE ia."lat" IS NOT NULL';
    expect(rawQueryProblem(console)).toBeNull();
  });

  it("lets through the address columns, counts and everything that doesn't touch the import tables", () => {
    expect(rawQueryProblem('SELECT ia."line1", ia."zip"::text, count(*)::int AS n FROM "ImportedAddress" ia GROUP BY 1, 2')).toBeNull();
    expect(rawQueryProblem("SELECT pg_advisory_xact_lock(hashtext($1))")).toBeNull();
    expect(rawQueryProblem('SELECT * FROM "Shift" s WHERE s."id" = $1')).toBeNull();
    expect(rawQueryProblem("SET LOCAL ROLE authenticated")).toBeNull();
    // DDL and upserts elsewhere in the app (the rate limiter's counter) are not the guard's business.
    expect(rawQueryProblem('ALTER TABLE "RateLimitCounter" RENAME TO "RateLimitCounter_away"')).toBeNull();
    expect(rawQueryProblem('INSERT INTO "RateLimitCounter" ("bucket") VALUES ($1) ON CONFLICT ("bucket") DO UPDATE SET "count" = 1')).toBeNull();
  });
});
