import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Imported files keep every column and each row's source record ID
 * (Caden, Nov 17 2026), which means names, phone numbers, party and vote
 * history sit in the database for up to 30 days. They are the most sensitive
 * data in the system, so this enforces where they may be read: the importer
 * that writes them, the purge that deletes them, and the staff export that
 * returns a file's record IDs. Nothing else, and above all nothing a worker's
 * phone is served from, and nothing that matches, ranks, scores or explains
 * (CLAUDE.md rules 4 and 5). Same shape as the other isolation tests.
 */
const NAMES = /\b(sourceData|sourceRecordId|droppedColumns)\b/;
const ALLOWED = [
  /^src\/lib\/walkbooks(-data)?(\.test)?\.ts$/, // the reader and the importer/purge
  /^src\/lib\/stop-console(-data)?(\.test)?\.ts$/, // the staff export (record ID only: never sourceData)
  /^src\/lib\/walkbook-isolation\.test\.ts$/,
  /^src\/components\/staff\/WalkbookImport\.tsx$/, // the uploader's own browser, previewing the file they chose
  /^src\/app\/jobs\/\[jobId\]\/walkbooks\/page\.tsx$/, // staff: an import's file list (what was kept and what was left out)
  /^src\/app\/zz-preview\//,
];
/** Code that ranks, matches, scores or explains, and everything a worker is served: none of it may name those columns or the import tables. */
const GUARDED = /^src\/(lib\/(.*match.*|scorecard.*|political-fit.*|priority|metrics|jobs-data|jobs|hiring.*|desk.*|experience.*|applicants.*|invitations.*|engagements.*|org-profile.*|field-day.*|shift.*|pay.*|profile.*|worker.*|availability.*|credentials.*)\.ts|components\/(FitSignals|ScorecardPanel|JobCard|OrgProfileSections|FieldDayLive|OfflineBrief|ShiftDayList)\.tsx|app\/(shifts|earnings|pay|profile|workers|hiring|desk|api\/workers|api\/shifts|api\/feed)\/.*\.tsx?)$/;
const TABLES = /\b(importedAddress|ImportedAddress|addressImport|AddressImport)\b/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}
const root = process.cwd();
const rel = (p: string) => relative(root, p).replace(/\\/g, "/");
const all = files(join(root, "src")).map((p) => ({ path: rel(p), text: readFileSync(p, "utf8") }));

describe("imported columns stay where they are meant to", () => {
  it("scans the app", () => {
    expect(all.length).toBeGreaterThan(300);
  });

  it("only the importer, the purge, the staff export and the uploader's own preview name the stored columns", () => {
    const strays = all.filter((f) => NAMES.test(f.text) && !ALLOWED.some((a) => a.test(f.path))).map((f) => f.path);
    expect(strays, `these read sourceData, sourceRecordId or droppedColumns: ${strays.join(", ")}`).toEqual([]);
  });

  it("nothing that matches, ranks, scores or is served to a worker names those columns or the import tables", () => {
    const hits = all.filter((f) => GUARDED.test(f.path) && !/\.test\.tsx?$/.test(f.path) && (NAMES.test(f.text) || TABLES.test(f.text))).map((f) => f.path);
    expect(hits, `guarded code touches imported data: ${hits.join(", ")}`).toEqual([]);
  });

  it("no query reads a stop's address whole: always explicit fields, so a new column can't ride along to a worker", () => {
    const wholeAddress = all.filter((f) => !/\.test\.tsx?$/.test(f.path) && /\b(address|importedAddress)\s*:\s*true\b|include\s*:\s*\{[^}]*\baddress\b/.test(f.text)).map((f) => f.path);
    expect(wholeAddress, `these select an address whole: ${wholeAddress.join(", ")}`).toEqual([]);
  });

  it("the staff export reads the record ID and never sourceData", () => {
    const exportData = all.find((f) => f.path === "src/lib/stop-console-data.ts")!.text;
    expect(exportData).toMatch(/sourceRecordId/);
    expect(exportData).not.toMatch(/sourceData/);
    const exportPure = all.find((f) => f.path === "src/lib/stop-console.ts")!.text;
    expect(exportPure).not.toMatch(/sourceData/);
  });

  it("the worker's loader selects an address by name, field by field", () => {
    const data = all.find((f) => f.path === "src/lib/walkbooks-data.ts")!.text;
    const block = data.slice(data.indexOf("const STOP_SELECT"), data.indexOf("const STOP_SELECT") + 400);
    expect(block).toMatch(/address: \{ select: \{ line1: true, unit: true, city: true, state: true, zip: true, lat: true, lng: true \} \}/);
  });
});
