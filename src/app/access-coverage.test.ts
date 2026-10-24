import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/**
 * Every route handler and server action is a public endpoint. Each exported
 * handler must reach an access check: a session guard, directly or through a
 * function in the same file. A handler that is public on purpose is listed
 * in PUBLIC with the reason, so adding one is a reviewed decision, not an
 * accident.
 */
const APP = __dirname;
const ROOT = join(APP, "..", "..");

/** Calls that establish who the caller is (or, for machine callers, verify their secret or signature). */
const GUARDS = new Set([
  "getSessionProfile",
  "getAuthUser",
  "requireRole",
  "requireAuth",
  "requireArea",
  "requireEmployer",
  "requireJobEditor",
  "requireOrgMember",
  "requireWorker",
  "requireStaff",
  "apiWorker",
  "apiEmployer",
  "apiArea",
  "getUser", // supabase.auth.getUser(): the Supabase-verified user, before a profile exists (welcome)
]);

/** file#export → why it needs no session. */
const PUBLIC: Record<string, string> = {
  "src/app/api/stripe/webhook/route.ts#POST": "Stripe calls it; the signature is verified (parseWebhook).",
  "src/app/api/cron/purge-proofs/route.ts#GET": "Vercel Cron calls it; the bearer secret is compared in constant time.",
  "src/app/api/credential-proofs/[proofId]/route.ts#HEAD": "Refuses (405), so a HEAD never records a look.",
  "src/app/auth/confirm/route.ts#GET": "Where a sign-in link lands; it establishes the session.",
  "src/app/login/actions.ts#logIn": "Signs in; rate-limited per connection and per email.",
  "src/app/signup/actions.ts#signUp": "Creates an account; rate-limited per connection.",
  "src/app/settings/actions.ts#signOut": "Ends whatever session there is.",
  "src/app/api/campaigns/route.ts#GET": "Public campaign directory: published campaigns only.",
  "src/app/api/campaigns/[handle]/route.ts#GET": "A published campaign's public page.",
  "src/app/api/campaigns/[handle]/posts/route.ts#GET": "A published campaign's public posts.",
  "src/app/api/campaigns/[handle]/posts/[postId]/route.ts#GET": "One public post.",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const isEndpointFile = (f: string, src: string) =>
  !/\.test\./.test(f) && (/\/route\.ts$/.test(f) || /^\s*["']use server["']/.test(src));

/** Exported handlers and, per local function, the identifiers it calls. */
function analyse(src: string) {
  const sf = ts.createSourceFile("x.ts", src, ts.ScriptTarget.Latest, true);
  const calls = new Map<string, Set<string>>();
  const exported: string[] = [];
  const callsIn = (node: ts.Node) => {
    const out = new Set<string>();
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const e = n.expression;
        if (ts.isIdentifier(e)) out.add(e.text);
        else if (ts.isPropertyAccessExpression(e)) out.add(e.name.text);
      }
      if (ts.isIdentifier(n)) out.add(n.text); // functions passed by reference (e.g. withActor(fn))
      ts.forEachChild(n, visit);
    };
    visit(node);
    return out;
  };
  const isExported = (n: ts.Node) => ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.body) {
      const isDefault = !!ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      const name = isDefault ? "default" : st.name?.text;
      if (!name) continue;
      calls.set(name, callsIn(st.body));
      if (isExported(st)) exported.push(name);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        if (!(ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer) || ts.isCallExpression(d.initializer))) continue;
        calls.set(d.name.text, callsIn(d.initializer));
        if (isExported(st)) exported.push(d.name.text);
      }
    }
  }
  const reaches = (name: string, seen = new Set<string>()): boolean => {
    if (seen.has(name)) return false;
    seen.add(name);
    for (const c of calls.get(name) ?? []) {
      if (GUARDS.has(c)) return true;
      if (calls.has(c) && reaches(c, seen)) return true;
    }
    return false;
  };
  return exported.map((name) => ({ name, guarded: reaches(name) }));
}

describe("access-check coverage", () => {
  const endpoints = files(APP)
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => ({ f, src: readFileSync(f, "utf8") }))
    .filter(({ f, src }) => isEndpointFile(f, src));

  it("finds the endpoints (sanity)", () => {
    expect(endpoints.length).toBeGreaterThan(40);
  });

  it("every exported route handler and server action reaches an access check, or is listed as public with a reason", () => {
    const missing: string[] = [];
    for (const { f, src } of endpoints) {
      for (const h of analyse(src)) {
        const key = `${relative(ROOT, f)}#${h.name}`;
        if (!h.guarded && !PUBLIC[key]) missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the public list has no stale entries", () => {
    const all = new Set(endpoints.flatMap(({ f, src }) => analyse(src).map((h) => `${relative(ROOT, f)}#${h.name}`)));
    expect(Object.keys(PUBLIC).filter((k) => !all.has(k))).toEqual([]);
  });

  it("the analysis catches an unguarded handler", () => {
    const src = `"use server";\nconst helper = async () => db().x();\nexport async function leak() { return helper(); }\nexport async function ok() { const s = await requireArea("pay"); return s; }`;
    expect(analyse(src)).toEqual([
      { name: "leak", guarded: false },
      { name: "ok", guarded: true },
    ]);
  });
});
