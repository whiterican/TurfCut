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
  it("lets through the address columns, counts and everything that doesn't touch the import tables", () => {
    expect(rawQueryProblem('SELECT ia."line1", ia."zip"::text, count(*)::int AS n FROM "ImportedAddress" ia GROUP BY 1, 2')).toBeNull();
    expect(rawQueryProblem("SELECT pg_advisory_xact_lock(hashtext($1))")).toBeNull();
    expect(rawQueryProblem('SELECT * FROM "Shift" s WHERE s."id" = $1')).toBeNull();
    expect(rawQueryProblem("SET LOCAL ROLE authenticated")).toBeNull();
  });
});
