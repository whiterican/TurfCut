import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@prisma/client";

/**
 * The runtime half of src/lib/walkbook-isolation.test.ts (Caden chose the walkbooks follow-ups, Nov 21).
 *
 * An import's rows keep every column of the file and each row's source record ID: names, phone numbers, party,
 * vote history. The isolation test scans source text for who may read them; it can't see a select object built
 * elsewhere and passed in, or a key computed at run time. This can: every query through db() is checked, and a
 * read of the protected columns outside `withVoterData` is refused before it reaches the database.
 *
 * Protected: ImportedAddress.sourceData and .sourceRecordId, AddressImport.droppedColumns (the dropped headers).
 * The address itself (line1, city, zip, lat/lng) is not protected here: it is what a walkbook is for.
 *
 * Refused outside the scope:
 * - any query naming a protected column anywhere in its arguments (select, include, omit, where, orderBy, by...);
 * - a whole-row read or write-and-return of a protected model (no `select`), at the top or through a relation;
 * - raw SQL that names a protected column, or that touches an import table in any way but naming one of its other
 *   columns (`ia."line1"`): a star, a bare table or alias (a whole row, however it is then cast, formatted or turned
 *   into JSON or XML), TABLE, DDL naming the table, or anything that runs SQL it can't see (U& escapes, the *_to_xml
 *   functions, EXECUTE, DO, dblink, COPY).
 *
 * It stops a developer (or agent) reading the data by mistake. It is not a wall against someone set on getting round
 * it from inside the app's own code: that needs the database to refuse the columns to the app's role.
 */

const PROTECTED = new Set<string>(["droppedColumns", "sourceData", "sourceRecordId"]);
const PROTECTED_MODELS = new Set(["ImportedAddress", "AddressImport"]);
const PROTECTED_RE = /\b(droppedColumns|sourceData|sourceRecordId)\b/;
const TABLE_RE = /\b(ImportedAddress|AddressImport)\b/i;
/**
 * SQL that can run SQL the guard can't see, or spell a name it can't read: refused outside the scope, whatever it names.
 * (DDL is left to the rules below: a view or a rename can only reach an import table by naming it, or through U&.)
 */
const OPAQUE_RE = /\bU&|_to_xml\s*\(|\bxmlelement\b|\bexecute\b|^\s*do\b|\bdblink|\bcopy\b|\blo_\w+\s*\(|\bpg_read/i;
/** Words that can follow a table in FROM or JOIN and are not its alias. */
const NOT_ALIAS = new Set(
  "on where join left right inner outer full cross natural group order limit offset fetch using set and or union except intersect window having for returning lateral tablesample".split(" ")
);

/** Operations that return the model's rows (and so its columns, unless `select` says which). */
const RETURNS_ROWS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "create",
  "createManyAndReturn",
  "update",
  "updateManyAndReturn",
  "upsert",
  "delete",
]);

const scope = new AsyncLocalStorage<{ why: string; open: boolean }>();

/**
 * Runs `fn` where the protected columns may be read: the importer, the purge, the staff file list and the staff export
 * only (walkbook-isolation.test.ts pins the callers). Keep it around the one query or transaction that needs it.
 * The scope closes when `fn` settles: work it started that runs later (a timer, a promise left running) is refused.
 */
export async function withVoterData<T>(why: string, fn: () => PromiseLike<T>): Promise<T> {
  const store = { why, open: true };
  try {
    // Awaited inside the scope: a Prisma query is lazy and runs when awaited, so one handed back unawaited would run
    // outside it (and be refused).
    return await scope.run(store, async () => await fn());
  } finally {
    store.open = false;
  }
}

export class VoterDataGuardError extends Error {
  constructor(what: string) {
    super(`Refused: ${what} reads imported voter data outside the importer, the purge or the staff export (src/lib/voter-data-guard.ts).`);
    this.name = "VoterDataGuardError";
  }
}

type Field = { name: string; kind: string; type: string };
let relations: Map<string, Map<string, string>> | null = null;
/** model → relation field → target model, from Prisma's own description of the schema. */
function relationsOf(model: string): Map<string, string> {
  if (!relations) {
    relations = new Map(
      Prisma.dmmf.datamodel.models.map((m) => [m.name, new Map((m.fields as readonly Field[]).filter((f) => f.kind === "object").map((f) => [f.name, f.type]))])
    );
  }
  return relations.get(model) ?? new Map();
}

/** A protected column named anywhere: as a key, or as a field name in `by` / `distinct` lists. */
function namesProtected(v: unknown, key?: string): boolean {
  if (Array.isArray(v)) return v.some((x) => ((key === "by" || key === "distinct") && typeof x === "string" ? PROTECTED.has(x) : namesProtected(x)));
  if (!v || typeof v !== "object") return (key === "by" || key === "distinct") && typeof v === "string" && PROTECTED.has(v);
  return Object.entries(v as Record<string, unknown>).some(([k, x]) => PROTECTED.has(k) || namesProtected(x, k));
}

/** A protected model reached whole: through `include`, or a relation in `select` given `true` or no `select` of its own. */
function wholeRowThrough(model: string, args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const a = args as Record<string, unknown>;
  const rel = relationsOf(model);
  for (const part of ["include", "select"] as const) {
    const picked = a[part];
    if (!picked || typeof picked !== "object") continue;
    for (const [k, v] of Object.entries(picked as Record<string, unknown>)) {
      const target = rel.get(k);
      if (!target || !v) continue;
      const nested = typeof v === "object" ? (v as Record<string, unknown>) : null;
      if (PROTECTED_MODELS.has(target) && !(nested && nested.select)) return `${model}.${k}`;
      const deeper = nested && wholeRowThrough(target, nested);
      if (deeper) return deeper;
    }
  }
  return null;
}

/** Why a model query would read protected data, or null. */
export function modelQueryProblem(model: string, operation: string, args: unknown): string | null {
  if (namesProtected(args)) return `${model}.${operation}`;
  const a = (args ?? {}) as Record<string, unknown>;
  if (PROTECTED_MODELS.has(model) && RETURNS_ROWS.has(operation) && !a.select) return `${model}.${operation} without a select`;
  const through = wholeRowThrough(model, args);
  return through && `${model}.${operation} through ${through}`;
}

let columns: Map<string, Set<string>> | null = null;
/** An import table's columns that may be read anywhere: all of its own but the protected ones. */
function readableColumns(model: string): Set<string> {
  if (!columns) {
    columns = new Map(
      Prisma.dmmf.datamodel.models
        .filter((m) => PROTECTED_MODELS.has(m.name))
        .map((m) => [m.name, new Set((m.fields as readonly Field[]).filter((f) => f.kind !== "object" && !PROTECTED.has(f.name)).map((f) => f.name))])
    );
  }
  return columns.get(model) ?? new Set();
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Why raw SQL would read protected data, or null (its static text only: a value is a parameter, and SQL that could
 * run a parameter as SQL is refused). Where it touches an import table, every mention of the table or its alias has
 * to name one of the table's other columns, or be the table in a FROM or JOIN.
 */
export function rawQueryProblem(sql: string): string | null {
  if (PROTECTED_RE.test(sql)) return "raw SQL naming a protected column";
  if (OPAQUE_RE.test(sql)) return "raw SQL the guard can't read through (U&, *_to_xml, EXECUTE, DO, dblink, COPY)";
  if (!TABLE_RE.test(sql)) return null;
  if (/\btable\s+("?public"?\s*\.\s*)?"?(ImportedAddress|AddressImport)\b/i.test(sql)) return "raw SQL reading an import table whole (TABLE)";
  if (/\*/.test(sql.replace(/\bcount\s*\(\s*\*\s*\)/gi, ""))) return "raw SQL with a star near an import table";
  // Where each import table is named: in FROM or JOIN with or without an alias, or as a column's qualifier.
  const named = /(?:"?public"?\s*\.\s*)?"?(ImportedAddress|AddressImport)"?/gi;
  const aliases: Array<{ name: string; quoted: boolean; model: string }> = [];
  for (let m; (m = named.exec(sql)); ) {
    const model = /^importedaddress$/i.test(m[1]) ? "ImportedAddress" : "AddressImport";
    const before = sql.slice(0, m.index);
    const after = sql.slice(m.index + m[0].length);
    const qualified = /^\s*\.\s*(?:"([^"]+)"|([a-z_][\w$]*))/.exec(after);
    if (qualified) {
      const col = qualified[1] ?? qualified[2];
      if (!readableColumns(model).has(col)) return `raw SQL reading ${model}.${col}`;
      continue;
    }
    if (!/\b(from|join)\s+(only\s+)?$/i.test(before)) return `raw SQL using ${model} other than in FROM or JOIN`;
    const alias = /^\s+(?:as\s+)?(?:"([^"]+)"|([a-z_][\w$]*))/i.exec(after);
    const name = alias?.[1] ?? alias?.[2];
    if (name && !NOT_ALIAS.has(name.toLowerCase())) aliases.push({ name, quoted: !!alias?.[1], model });
  }
  // Every use of an alias names one of the table's other columns (a bare alias is the whole row).
  for (const a of aliases) {
    const use = new RegExp(a.quoted ? `"${esc(a.name)}"` : `(?<![\\w$".])${esc(a.name)}(?![\\w$"])`, a.quoted ? "g" : "gi");
    let bound = false;
    for (let m; (m = use.exec(sql)); ) {
      const after = sql.slice(m.index + m[0].length);
      const col = /^\s*\.\s*(?:"([^"]+)"|([a-z_][\w$]*))/.exec(after);
      if (col) {
        const name = col[1] ?? col[2];
        if (!readableColumns(a.model).has(name)) return `raw SQL reading ${a.model}.${name}`;
        continue;
      }
      // The alias where it is given (right after the table) is the one bare mention allowed.
      if (!bound && /(ImportedAddress|AddressImport)"?\s+(as\s+)?$/i.test(sql.slice(0, m.index))) {
        bound = true;
        continue;
      }
      return `raw SQL using ${a.model} whole (${a.name})`;
    }
  }
  return null;
}

const sqlText = (args: unknown): string => {
  if (Array.isArray(args)) return typeof args[0] === "string" ? args[0] : ""; // $queryRawUnsafe(sql, ...values)
  const strings = (args as { strings?: unknown })?.strings;
  return Array.isArray(strings) ? strings.join(" ") : "";
};

const inScope = () => scope.getStore()?.open === true;

/** The guard, as a Prisma client extension (src/lib/db.ts applies it to the shared client). */
export const voterDataGuard = Prisma.defineExtension({
  name: "voter-data-guard",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!inScope()) {
          const problem = modelQueryProblem(model, operation, args);
          if (problem) throw new VoterDataGuardError(problem);
        }
        return query(args);
      },
    },
    async $queryRaw({ args, query }) {
      const problem = !inScope() && rawQueryProblem(sqlText(args));
      if (problem) throw new VoterDataGuardError(problem);
      return query(args);
    },
    async $executeRaw({ args, query }) {
      const problem = !inScope() && rawQueryProblem(sqlText(args));
      if (problem) throw new VoterDataGuardError(problem);
      return query(args);
    },
    async $queryRawUnsafe({ args, query }) {
      const problem = !inScope() && rawQueryProblem(sqlText(args));
      if (problem) throw new VoterDataGuardError(problem);
      return query(args);
    },
    async $executeRawUnsafe({ args, query }) {
      const problem = !inScope() && rawQueryProblem(sqlText(args));
      if (problem) throw new VoterDataGuardError(problem);
      return query(args);
    },
  },
});
