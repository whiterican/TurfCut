import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
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
 * raw SELECT *, a key assembled from pieces, any spelling of an import path, a
 * quoted relation key, an unsafe raw query) and pins the allowed files down to
 * the functions that may read. What it can't see: a select object built
 * elsewhere and passed in, or a key computed at run time. The runtime guard
 * covers those: src/lib/voter-data-guard.ts, a Prisma extension on db() that
 * refuses reads of these columns outside withVoterData (the importer, the
 * purge, the staff file list and the staff export).
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
  /^src\/lib\/voter-data-guard(\.test)?\.ts$/, // the runtime guard, which names the columns to refuse them
  /^src\/instrumentation\.test\.ts$/, // checks the error scrubber redacts a DB message naming them
  /^src\/components\/staff\/WalkbookImport\.tsx$/, // the uploader's own browser, previewing the file they chose
  /^src\/app\/jobs\/\[jobId\]\/walkbooks\/(page|actions)\.tsx?$/, // staff: the import form's action, and the file list
  /^src\/app\/api\/cron\/purge-imports\//, // the daily purge
  /^src\/app\/zz-preview\//,
];
/** Code that ranks, matches, scores or explains, and everything a worker is served: stricter, and never allowed. */
const GUARDED = /^src\/(lib\/(.*match.*|scorecard.*|political-fit.*|priority|metrics|jobs-data|jobs|hiring.*|desk.*|experience.*|applicants.*|invitations.*|engagements.*|org-profile.*|field-day.*|shift.*|pay.*|profile.*|worker.*|availability.*|credentials.*|walkbook-shared|walkbooks-worker-data|poll.*|stop-outcomes.*)\.ts|components\/(FitSignals|ScorecardPanel|JobCard|OrgProfileSections|FieldDayLive|OfflineBrief|ShiftDayList|WalkbookStops)\.tsx|components\/stops\/.*\.tsx?|app\/(shifts|earnings|pay|profile|workers|hiring|desk|walkbooks|api\/workers|api\/shifts|api\/feed|api\/walkbooks|api\/stops|api\/polls)\/.*\.tsx?)$/;
/**
 * The files that may import the two data modules by value (anything else, however it imports them, fails):
 * the allowed files above and the staff pages and routes that run the console, the export, a walkbook's
 * own page and the purge. Listing importers, not just guarded files, also closes a re-export chain: a new
 * module that re-exported loadExportRows would itself have to be on this list.
 */
const IMPORTERS = [
  ...ALLOWED,
  /^src\/app\/jobs\/\[jobId\]\/walkbooks\/\[walkbookId\]\/page\.tsx$/,
  /^src\/app\/jobs\/\[jobId\]\/walkbooks\/console\/(page\.tsx|export\/route\.ts)$/,
];
/** Comments out, so a rule reads code only. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

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
  expect(end, `function ${name} ends with a closing brace at column 0`).toBeGreaterThan(start);
  return text.slice(start, end + 3);
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

  it("only the importer, the purge, the file list and the export open the runtime guard's scope", () => {
    // withVoterData unlocks the guard (src/lib/voter-data-guard.ts): who may call it is pinned like who may name the columns.
    const opens = all.filter((f) => !isTest(f.path) && /\bwithVoterData\b/.test(code(f.text))).map((f) => f.path).sort();
    expect(opens).toEqual(["src/lib/stop-console-data.ts", "src/lib/voter-data-guard.ts", "src/lib/walkbooks-data.ts"]);
    const wd = code(get("src/lib/walkbooks-data.ts"));
    expect(wd.match(/withVoterData\("[^"]+"/g)).toEqual(['withVoterData("importer"', 'withVoterData("staff file list"', 'withVoterData("purge"']);
    expect(body(wd, "importAddresses")).toMatch(/withVoterData\("importer"/);
    expect(body(wd, "purgeImport")).toMatch(/withVoterData\("purge"/);
    expect(body(wd, "loadJobWalkbooks")).toMatch(/withVoterData\("staff file list"/);
    const sc = code(get("src/lib/stop-console-data.ts"));
    expect(sc.match(/withVoterData\("[^"]+"/g)).toEqual(['withVoterData("staff export"']);
    expect(body(sc, "loadExportRows")).toMatch(/withVoterData\("staff export"/);
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
    // A relation key named address/importedAddress taken whole (true, 1, {}, or a quoted key); STOP_SELECT's explicit field list is the only form allowed.
    const whole = /["'`](address|importedAddress)["'`]\s*\]?\s*:|\b(address|importedAddress)\s*:\s*(true|!0|1|\{\s*\}|\{\s*include)/;
    const json = /\b(to_jsonb|row_to_json|json_agg)\s*\(\s*(ia|a|b)\b|\b(ia|a|b)\.\*/i;
    const wholeAddress = all
      .filter((f) => !isTest(f.path) && ((allowed(f.path) && (star.test(f.text) || (TABLES.test(f.text) && json.test(f.text)))) || (!allowed(f.path) && whole.test(f.text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")))))
      .map((f) => f.path);
    expect(wholeAddress, `these select whole rows: ${wholeAddress.join(", ")}`).toEqual([]);
  });

  describe("inside the allowed files, only the functions meant to read them do", () => {
    const wd = get("src/lib/walkbooks-data.ts");
    it("walkbooks-data: the stored columns are written by importAddresses and nowhere else; the record ID likewise", () => {
      // importAddresses is a wrapper that runs importAddressesInScope inside the runtime guard's scope (voter-data-guard).
      expect(outside(wd, /\b(sourceData|sourceRecordId)\b/, ["importAddressesInScope"])).toEqual([]);
      expect(body(wd, "importAddressesInScope")).toMatch(/sourceData/);
    });
    it("walkbooks-data: the import tables are touched only by import, cut, the file list, the staff walkbook, the purge, and the one SQL fragment that skips repeats", () => {
      const fns = ["importAddressesInScope", "cutWalkbooks", "loadJobWalkbooks", "loadWalkbookForStaff", "purgeImportInScope", "purgeOwnImport", "purgeDueImports", "failedCount"];
      const rest = outside(wd.replace(/\/\*[\s\S]*?\*\//g, ""), TABLES, fns);
      // Only notOnJob's join (a plain equality on addressId) is left outside those functions.
      const notOnJob = wd.slice(wd.indexOf("const notOnJob"), wd.indexOf("`;", wd.indexOf("const notOnJob")));
      expect(rest.length).toBe([...notOnJob.matchAll(new RegExp(TABLES.source, "g"))].length);
    });
    const sc = get("src/lib/stop-console-data.ts");
    it("stop-console-data: the record ID is read by the export only; the console page and the inspector never read it", () => {
      // (the Raw row type declares the optional field; only the export function fills it)
      expect(outside(sc.replace(/\/\*[\s\S]*?\*\//g, "").replace("sourceRecordId?: string | null;", ""), /sourceRecordId/, ["loadExportRows"])).toEqual([]);
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

  it("no guarded file imports an allowed data module, and the worker pages load from the worker file directly", () => {
    // Value imports only: a type-only import carries no data.
    const DATA = /^import\s+(?!type\b)[^;]*from\s+["']@\/lib\/(walkbooks-data|stop-console-data)["']/m;
    const bad = all.filter((f) => GUARDED.test(f.path) && !isTest(f.path) && DATA.test(f.text)).map((f) => f.path);
    expect(bad, `guarded code imports the import-data modules: ${bad.join(", ")}`).toEqual([]);
    for (const page of ["src/app/walkbooks/page.tsx", "src/app/shifts/[shiftId]/page.tsx"]) {
      expect(get(page)).toMatch(/from\s+["']@\/lib\/walkbooks-worker-data["']/);
    }
  });

  // The ways round the checks above that a review found (Nov 18): a relative or dynamic import, a re-export,
  // reading the rows through the walkbook's import relation, `omit`, and a shorthand or variable select.
  it("only the listed staff files import the data modules by value, however they write it (alias, relative, dynamic, re-export)", () => {
    // Every module path a file loads by value, resolved, so "@/lib/../lib/x" and "../../lib/x" both read as src/lib/x.
    const specs = [
      /^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm, // static, value
      /^\s*export\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm, // re-export
      /(?<!typeof\s+)\bimport\s*\(\s*["'`]([^"'`]+)["'`]/g, // dynamic, any quotes (a `typeof import(...)` type carries no data)
      /\brequire\s*\(\s*["'`]([^"'`]+)["'`]/g, // require, any quotes
    ];
    const resolve = (from: string, spec: string) =>
      spec.startsWith("@/") ? posix.normalize(`src/${spec.slice(2)}`) : spec.startsWith(".") ? posix.normalize(posix.join(dirname(from), spec)) : spec;
    // With or without an extension, .js included (TypeScript resolves "x.js" to x.ts).
    const DATA_MODULE = /^src\/lib\/(walkbooks-data|stop-console-data)(\.(tsx?|jsx?|mjs|cjs|mts|cts))?$/;
    const loads = (f: { path: string; text: string }) => specs.some((re) => [...code(f.text).matchAll(re)].some((m) => DATA_MODULE.test(resolve(f.path, m[1]))));
    const bad = all.filter((f) => !isTest(f.path) && !IMPORTERS.some((a) => a.test(f.path)) && loads(f)).map((f) => f.path);
    expect(bad, `these import the import-data modules and aren't listed: ${bad.join(", ")}`).toEqual([]);
  });

  it("outside the allowed files no query reaches the import rows through a relation, omit, shorthand or a variable", () => {
    const rules: [string, RegExp][] = [
      // A key may be quoted ("addresses": true).
      ["the import or addresses relation", /["'`]?\b(addresses|import)\b["'`]?\s*:\s*(true|!0|1|\{)/],
      ["omit or include on an address relation", /["'`]?\b(address|addresses|importedAddress)\b["'`]?\s*:\s*\{\s*(omit|include)\b/],
      ["an unsafe raw query (its table name could be built from pieces)", /\$(queryRawUnsafe|executeRawUnsafe)\b/],
      ["a shorthand address/import key in a select or include", /\b(select|include)\s*:\s*\{[^{}]*\b(address|addresses|import)\s*[,}]/],
      ["an address relation given by a variable in a select or include", /\b(select|include)\s*:\s*\{[^{}]*\baddress\s*:\s*(?![{\s])/],
    ];
    const walkbookQuery = /\b(walkbook|walkbookStop|walkbookAssignment|stopOutcome)\s*\./;
    const hits = all
      .filter((f) => !isTest(f.path) && !allowed(f.path))
      .flatMap((f) => {
        const c = code(f.text);
        const found = rules.filter(([, r]) => r.test(c)).map(([n]) => `${f.path}: ${n}`);
        if (walkbookQuery.test(c) && /\bomit\s*:/.test(c)) found.push(`${f.path}: omit in a file that queries walkbooks`);
        return found;
      });
    expect(hits, hits.join("; ")).toEqual([]);
  });
});
