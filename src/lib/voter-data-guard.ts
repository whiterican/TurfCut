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
 * - raw SQL that names a protected column;
 * - raw SQL that names an import table at all, unless it was built with `addressSql` (the tag the two walkbook data
 *   modules use for the queries that read addresses, pinned by walkbook-isolation.test.ts): checking SQL text for
 *   what it reads can't be done without parsing SQL, so the queries that may touch these tables are named instead;
 * - anywhere, SQL that can run SQL it can't see or spell a name it can't read: escaped identifiers and strings (U&,
 *   E''), the *_to_xml and ts_stat/ts_rewrite families, EXECUTE, DO, dblink, COPY, file and large-object reads, and
 *   creating functions, procedures, views, rules or triggers (the app runs no DDL of that kind).
 *
 * It stops a developer (or agent) reading the data by mistake. It is not a wall against someone set on getting round
 * it from inside the app's own code: that needs the database to refuse the columns to the app's role.
 */

const PROTECTED = new Set<string>(["droppedColumns", "sourceData", "sourceRecordId"]);
const PROTECTED_MODELS = new Set(["ImportedAddress", "AddressImport"]);
const PROTECTED_RE = /\b(droppedColumns|sourceData|sourceRecordId)\b/;
const TABLE_RE = /(ImportedAddress|AddressImport)/i;
/** SQL that can run SQL the guard can't see, or spell a name it can't read: refused outside the scope, whatever it names. */
const OPAQUE_RE =
  /\bu&|(?<![\w$'])e'|\b(query|table|schema|database|cursor)_to_xml|\bxml(element|forest|agg|parse)\b|\bts_(stat|rewrite)\b|\bexecute\b|^\s*do\b|\bdblink|\bcopy\b|\blo_\w+|\bpg_(read|ls_dir|stat_file)|\b(create|alter)\s+(or\s+replace\s+)?(function|procedure|view|rule|trigger|materialized|aggregate|operator|cast)\b/i;

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

/** The static text of every query built with addressSql, as the guard sees it (parts joined by NUL). */
const approved = new Set<string>();
const key = (strings: readonly string[]) => strings.join("\u0000");

/**
 * The tag for a raw query that reads addresses from an import table (never the protected columns): the cut, the
 * counts and the staff console. Use it as `db().$queryRaw(addressSql\`…\`)`. Only walkbooks-data and stop-console-data
 * may (walkbook-isolation.test.ts); what the query reads is for their review, not this file's regexes.
 */
export function addressSql(strings: TemplateStringsArray, ...values: unknown[]): Prisma.Sql {
  const sql = Prisma.sql(strings, ...values);
  approved.add(key(sql.strings));
  return sql;
}

/** Comments out (each one a space, as Postgres reads it), so a comment can't split a word the checks look for. */
const uncommented = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

/**
 * Why raw SQL would read protected data, or null. `fromAddressSql`: the query was built with addressSql. Checked on
 * the text as written and with its comments out, so neither spelling gets past.
 */
export function rawQueryProblem(sql: string, fromAddressSql = false): string | null {
  for (const text of [sql, uncommented(sql)]) {
    if (PROTECTED_RE.test(text)) return "raw SQL naming a protected column";
    if (OPAQUE_RE.test(text)) return "raw SQL the guard can't read through (escapes, *_to_xml, ts_stat, EXECUTE, DO, dblink, COPY, DDL…)";
    if (!fromAddressSql && TABLE_RE.test(text)) return "raw SQL naming an import table outside addressSql";
  }
  return null;
}

const strings = (args: unknown): readonly string[] | null => {
  const st = (args as { strings?: unknown })?.strings;
  return Array.isArray(st) && st.every((x) => typeof x === "string") ? (st as string[]) : null;
};
const fromAddressSql = (args: unknown) => {
  const st = strings(args);
  return !!st && approved.has(key(st));
};
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
      const problem = !inScope() && rawQueryProblem(sqlText(args), fromAddressSql(args));
      if (problem) throw new VoterDataGuardError(problem);
      return query(args);
    },
    async $executeRaw({ args, query }) {
      const problem = !inScope() && rawQueryProblem(sqlText(args), fromAddressSql(args));
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
