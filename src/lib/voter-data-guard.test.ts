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
  it("refuses a protected column, and any import table outside addressSql, however it is spelled", () => {
    const outside = [
      'SELECT ia."sourceRecordId" FROM "ImportedAddress" ia',
      'SELECT ia."line1" FROM "ImportedAddress" ia', // even readable columns: the tag names which queries may
      'SELECT * FROM "ImportedAddress"',
      'TABLE "ImportedAddress"',
      'SELECT c11, c12 FROM "ImportedAddress" t(c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12)',
      'SELECT to_jsonb("ia") FROM "ImportedAddress" ia',
      'SELECT to_jsonb("on") FROM "ImportedAddress" AS "on"',
      'SELECT to_jsonb(ia) FROM "ImportedAddress"ia',
      "SELECT to_jsonb(ia) FROM \"ImportedAddress\" --x\n ia",
      'SELECT 1 FROM public.importedaddress',
      "SELECT 'ImportedAddress'",
      'SELECT x."importId" FROM "AddressImport" x',
    ];
    for (const sql of outside) expect(rawQueryProblem(sql), sql).not.toBeNull();
  });

  it("refuses, even inside addressSql, SQL that can run or spell SQL the guard can't read (every way the reviewer found)", () => {
    const opaque = [
      'SELECT U&"sourc\\0065Data" FROM U&"Imported\\0041ddress"',
      "SELECT query_to_xml($1, true, false, '')::text",
      'SELECT "query_to_xml"($1, true, false, \'\')',
      "SELECT query_to_xml_and_xmlschema($1, true, false, '')",
      "SELECT pg_catalog.query_to_xml/**/($1, true, false, '')",
      "SELECT schema_to_xml_and_xmlschema('public', true, false, '')",
      "SELECT table_to_xml('x', true, false, '')",
      "SELECT word FROM ts_stat($1)",
      "SELECT ts_rewrite($1, $2)",
      "CREATE FUNCTION f() RETURNS SETOF jsonb LANGUAGE sql AS E'SELECT 1'",
      "SELECT E'\\x49'",
      "CREATE OR REPLACE VIEW v AS SELECT 1",
      "DO $$ BEGIN PERFORM 1; END $$",
      "SELECT 1; EXECUTE p",
      "COPY (SELECT 1) TO STDOUT",
      "SELECT pg_read_file('/etc/passwd')",
      "SELECT lo_import('/x')",
    ];
    for (const sql of opaque) {
      expect(rawQueryProblem(sql), sql).not.toBeNull();
      expect(rawQueryProblem(sql, true), sql).not.toBeNull();
    }
    expect(rawQueryProblem('SELECT ia."sourceData" FROM "ImportedAddress" ia', true)).not.toBeNull();
  });

  it("lets through addressSql's queries, and everything that doesn't touch the import tables", () => {
    const cut = 'SELECT a."id", a."line1", a."unit", a."zip" FROM "public"."ImportedAddress" a WHERE a."importId" = ::uuid AND NOT EXISTS ( SELECT 1 FROM "public"."WalkbookStop" s JOIN "public"."ImportedAddress" b ON b."id" = s."addressId" WHERE b."zip" = a."zip" AND upper(coalesce(b."unit", \'\')) = upper(coalesce(a."unit", \'\')))';
    expect(rawQueryProblem(cut, true)).toBeNull();
    expect(rawQueryProblem(cut)).not.toBeNull();
    expect(rawQueryProblem("SELECT pg_advisory_xact_lock(hashtext($1))")).toBeNull();
    expect(rawQueryProblem('SELECT * FROM "Shift" s WHERE s."id" = $1')).toBeNull();
    expect(rawQueryProblem("SET LOCAL ROLE authenticated")).toBeNull();
    expect(rawQueryProblem(`SELECT count(*) FILTER (WHERE o."outcome" <> 'COME_BACK')::int, 'none' AS x FROM "StopOutcome" o`)).toBeNull();
    // DDL and upserts elsewhere in the app (the rate limiter's counter) are not the guard's business.
    expect(rawQueryProblem('ALTER TABLE "RateLimitCounter" RENAME TO "RateLimitCounter_away"')).toBeNull();
    expect(rawQueryProblem('INSERT INTO "RateLimitCounter" ("bucket") VALUES ($1) ON CONFLICT ("bucket") DO UPDATE SET "count" = 1')).toBeNull();
  });
});
