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
 *
 * It is a scan of source text, so it has limits it can't pass; it closes the
 * obvious ways round (a new file reading the table without naming a column, a
 * raw SELECT *, a key assembled from pieces) and pins the allowed files down
 * to the functions that may read.
 */
const NAMES = /\b(sourceData|sourceRecordId|droppedColumns)\b/;
/** The import tables, by their Prisma accessor, model or SQL name. */
const TABLES = /\b(importedAddress|ImportedAddress|addressImport|AddressImport)\b/;
/** A column name built from pieces ("source" + "Data"), or read by a computed key. */
const ASSEMBLED = /["'`]source["'`]\s*\+|\[\s*["'`]source(Data|RecordId)|["'`]\s*\+\s*["'`](Data|RecordId)["'`]/;

const ALLOWED = [
  /^src\/lib\/walkbooks(-data)?(\.test)?\.ts$/, // the reader and the importer/purge
  /^src\/lib\/walkbooks-import-failure\.test\.ts$/,
  /^src\/lib\/stop-console(-data)?(\.test)?\.ts$/, // the staff export (record ID only)
  /^src\/lib\/walkbook-isolation\.test\.ts$/,
  /^src\/instrumentation\.test\.ts$/, // checks the error scrubber redacts a DB message naming them
  /^src\/components\/staff\/WalkbookImport\.tsx$/, // the uploader's own browser, previewing the file they chose
  /^src\/app\/jobs\/\[jobId\]\/walkbooks\/(page|actions)\.tsx?$/, // staff: the import form's action, and the file list
  /^src\/app\/api\/cron\/purge-imports\//, // the daily purge
  /^src\/app\/zz-preview\//,
];
/** Code that ranks, matches, scores or explains, and everything a worker is served: stricter, and never allowed. */
const GUARDED = /^src\/(lib\/(.*match.*|scorecard.*|political-fit.*|priority|metrics|jobs-data|jobs|hiring.*|desk.*|experience.*|applicants.*|invitations.*|engagements.*|org-profile.*|field-day.*|shift.*|pay.*|profile.*|worker.*|availability.*|credentials.*|walkbook-shared|walkbooks-worker-data|poll.*|stop-outcomes.*)\.ts|components\/(FitSignals|ScorecardPanel|JobCard|OrgProfileSections|FieldDayLive|OfflineBrief|ShiftDayList|WalkbookStops)\.tsx|components\/stops\/.*\.tsx?|app\/(shifts|earnings|pay|profile|workers|hiring|desk|walkbooks|api\/workers|api\/shifts|api\/feed)\/.*\.tsx?)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}
const root = process.cwd();
const rel = (p: string) => relative(root, p).replace(/\\/g, "/");
const all = files(join(root, "src")).map((p) => ({ path: rel(p), text: readFileSync(p, "utf8") }));
const isTest = (p: string) => /\.test\.tsx?$/.test(p);
const allowed = (p: string) => ALLOWED.some((a) => a.test(p));
const get = (path: string) => all.find((f) => f.path === path)!.text;

/** The text of one top-level function: from its declaration to the closing brace at column 0. */
function body(text: string, name: string): string {
  const start = text.search(new RegExp(`^(export )?(async )?function ${name}\\b`, "m"));
  expect(start, `function ${name} exists`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf("\n}\n", start);
  return text.slice(start, end < 0 ? undefined : end + 3);
}
/** Every match of `re` in `text` that falls outside the given function bodies. */
function outside(text: string, re: RegExp, fns: string[]): string[] {
  let rest = text;
  for (const f of fns) rest = rest.replace(body(text, f), "");
  return [...rest.matchAll(new RegExp(re.source, "g"))].map((m) => m[0]);
}

describe("imported columns stay where they are meant to", () => {
  it("scans the app", () => {
    expect(all.length).toBeGreaterThan(300);
  });

  it("only the importer, the purge, the staff export and the uploader's own preview name the stored columns", () => {
    const strays = all.filter((f) => NAMES.test(f.text) && !allowed(f.path)).map((f) => f.path);
    expect(strays, `these name sourceData, sourceRecordId or droppedColumns: ${strays.join(", ")}`).toEqual([]);
  });

  it("no other file reads the import tables at all, by accessor, model or raw SQL (even without naming a column)", () => {
    const strays = all.filter((f) => !isTest(f.path) && TABLES.test(f.text) && !allowed(f.path)).map((f) => f.path);
    expect(strays, `these reach the import tables: ${strays.join(", ")}`).toEqual([]);
  });

  it("no file builds a stored column's name from pieces or reads it by a computed key", () => {
    const hits = all.filter((f) => !isTest(f.path) && ASSEMBLED.test(f.text)).map((f) => f.path);
    expect(hits, `computed access to source columns: ${hits.join(", ")}`).toEqual([]);
  });

  it("nothing that matches, ranks, scores or is served to a worker names those columns or the import tables, in any form", () => {
    const hits = all.filter((f) => GUARDED.test(f.path) && !isTest(f.path) && (NAMES.test(f.text) || TABLES.test(f.text))).map((f) => f.path);
    expect(hits, `guarded code touches imported data: ${hits.join(", ")}`).toEqual([]);
  });

  it("no query that could reach an address selects every column ('SELECT *') or an address whole", () => {
    const star = /\bSELECT\s+(\w+\.)?\*/i;
    const whole = /\b(address|importedAddress)\s*:\s*true\b|include\s*:\s*\{[^}]*\baddress\b/;
    const wholeAddress = all
      .filter((f) => !isTest(f.path) && ((allowed(f.path) && star.test(f.text)) || (!allowed(f.path) && whole.test(f.text))))
      .map((f) => f.path);
    expect(wholeAddress, `these select whole rows: ${wholeAddress.join(", ")}`).toEqual([]);
  });

  describe("inside the allowed files, only the functions meant to read them do", () => {
    const wd = get("src/lib/walkbooks-data.ts");
    it("walkbooks-data: the stored columns are written by importAddresses and nowhere else; the record ID likewise", () => {
      expect(outside(wd, /\b(sourceData|sourceRecordId)\b/, ["importAddresses"])).toEqual([]);
      expect(body(wd, "importAddresses")).toMatch(/sourceData/);
    });
    it("walkbooks-data: the import tables are touched only by import, cut, the file list, the staff walkbook, the purge, and the one SQL fragment that skips repeats", () => {
      const fns = ["importAddresses", "cutWalkbooks", "loadJobWalkbooks", "loadWalkbookForStaff", "purgeImport", "purgeOwnImport", "purgeDueImports", "failedCount"];
      const rest = outside(wd.replace(/\/\*[\s\S]*?\*\//g, ""), TABLES, fns);
      // Only notOnJob's join (a plain equality on addressId) is left outside those functions.
      expect(rest.length).toBeLessThanOrEqual(1);
    });
    const sc = get("src/lib/stop-console-data.ts");
    it("stop-console-data: the record ID is read by the export only; the console page and the inspector never read it", () => {
      expect(body(sc, "loadConsole")).not.toMatch(/sourceRecordId/);
      expect(body(sc, "loadStopHistory")).not.toMatch(/sourceRecordId/);
      expect(body(sc, "loadExportRows")).toMatch(/sourceRecordId/);
      expect(sc).not.toMatch(/\bsourceData\b/);
    });
    it("the pure export code never sees the stored columns", () => {
      expect(get("src/lib/stop-console.ts")).not.toMatch(/sourceData/);
    });
  });

  it("the worker's loader lives in a file of its own that can't name the import tables, and reads an address through the explicit field list", () => {
    const worker = get("src/lib/walkbooks-worker-data.ts");
    expect(TABLES.test(worker)).toBe(false);
    expect(NAMES.test(worker)).toBe(false);
    expect(worker).toMatch(/STOP_SELECT/);
    expect(worker).not.toMatch(/\binclude\s*:/);
    const shared = get("src/lib/walkbook-shared.ts");
    const block = shared.slice(shared.indexOf("export const STOP_SELECT"), shared.indexOf("} as const;", shared.indexOf("export const STOP_SELECT")) + 11);
    expect(block).toMatch(/address: \{ select: \{ line1: true, unit: true, city: true, state: true, zip: true, lat: true, lng: true \} \}/);
    expect(block).not.toMatch(/sourceData|sourceRecordId|include/);
  });
});
