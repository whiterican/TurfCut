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
 * - raw SQL naming a protected column, or reading a protected table whole (select-star, alias-dot-star, a row as JSON).
 */

const PROTECTED = new Set<string>(["droppedColumns", "sourceData", "sourceRecordId"]);
const PROTECTED_MODELS = new Set(["ImportedAddress", "AddressImport"]);
const PROTECTED_RE = /\b(droppedColumns|sourceData|sourceRecordId)\b/;
const TABLE_RE = /\b(ImportedAddress|AddressImport)\b/;
/** A read of a whole row: select-star, alias-dot-star, a row turned into JSON, or a bare alias cast to text (quoted columns don't match). */
const WHOLE_ROW_RE = /\bselect\s+(distinct\s+)?\*|\b\w+\s*\.\s*\*|\b(to_jsonb?|row_to_json|json_agg|jsonb_agg|array_agg|hstore)\s*\(|\b\w+\s*::\s*(text|jsonb?)\b/i;

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

const scope = new AsyncLocalStorage<string>();

/** Runs `fn` where the protected columns may be read: the importer, the purge and the staff export only. */
export function withVoterData<T>(why: string, fn: () => PromiseLike<T>): Promise<T> {
  // Awaited inside the scope: a Prisma query is lazy and runs when awaited, so one handed back unawaited would run
  // outside it (and be refused).
  return scope.run(why, async () => await fn());
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

/** Why raw SQL would read protected data, or null (its static text only: values are parameters, never SQL). */
export function rawQueryProblem(sql: string): string | null {
  if (PROTECTED_RE.test(sql)) return "raw SQL naming a protected column";
  if (TABLE_RE.test(sql) && WHOLE_ROW_RE.test(sql)) return "raw SQL reading an import table whole";
  return null;
}

const sqlText = (args: unknown): string => {
  if (Array.isArray(args)) return typeof args[0] === "string" ? args[0] : ""; // $queryRawUnsafe(sql, ...values)
  const strings = (args as { strings?: unknown })?.strings;
  return Array.isArray(strings) ? strings.join(" ") : "";
};

const inScope = () => scope.getStore() !== undefined;

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
