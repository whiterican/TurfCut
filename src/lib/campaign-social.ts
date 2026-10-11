/**
 * The social layer, campaign side (S1): campaign profiles and their posts.
 * Pure rules shared by the server, the pages and the tests.
 *
 * Non-negotiable (CLAUDE.md rule 4, C1-Q14): every word here is the
 * campaign's own and is shown verbatim. Turfcut never labels, summarizes,
 * scores or infers anyone's politics from it; posts are ordered by time and
 * nothing else; nothing social is read by matching, scorecards or
 * explanations (src/lib/social-isolation.test.ts keeps it that way).
 */

export const HANDLE_RE = /^[a-z0-9_]{3,30}$/;
export const NAME_MAX = 80;
export const BIO_MAX = 4000;
export const POST_MAX = 500;
/** Pinned posts are the campaign's talking points; this many brief a shift. */
export const MAX_PINNED = 3;
export const PAGE_SIZE = 20;

/** Handles that would read as Turfcut's own pages or staff. */
const RESERVED = new Set([
  "admin", "administrator", "api", "app", "campaign", "campaigns", "c", "p", "edit", "new", "settings", "help", "support",
  "turfcut", "staff", "team", "official", "jobs", "job", "login", "signup", "logout", "about", "terms", "privacy", "security",
  "null", "undefined", "root", "system", "moderator", "mod",
]);

/** Characters as Postgres counts them (code points), so the 500 here is the database's 500. */
export const charCount = (s: string) => [...s].length;

/** Whitespace tidied the way the database will store it: line endings unified, trailing spaces gone, no run of more than one blank line. */
function tidyText(s: string): string {
  return s.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t]+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizeHandle(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/^@/, "").toLowerCase() : "";
}

export function handleProblem(handle: string): string | null {
  if (!HANDLE_RE.test(handle)) return "Use 3 to 30 lowercase letters, numbers or underscores.";
  if (RESERVED.has(handle) || handle.startsWith("turfcut")) return "That handle is reserved. Pick another.";
  return null;
}

export interface ProfileInput {
  handle: string;
  displayName: string;
  bio: string;
}

/** The profile editor's fields: `handle`, `displayName`, `bio`. */
export function validateProfile(raw: Record<string, unknown>): { ok: true; value: ProfileInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const handle = normalizeHandle(raw.handle);
  const hp = handleProblem(handle);
  if (hp) errors.handle = hp;
  const displayName = typeof raw.displayName === "string" ? raw.displayName.trim().replace(/\s+/g, " ") : "";
  if (!displayName) errors.displayName = "Give the campaign a name.";
  else if (charCount(displayName) > NAME_MAX) errors.displayName = `Keep the name to ${NAME_MAX} characters.`;
  const bio = typeof raw.bio === "string" ? tidyText(raw.bio) : "";
  if (charCount(bio) > BIO_MAX) errors.bio = `Keep the bio to ${BIO_MAX.toLocaleString("en-US")} characters.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { handle, displayName, bio } };
}

/** A post's text, tidied, or why not. */
export function validatePostBody(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const body = typeof raw === "string" ? tidyText(raw) : "";
  if (!body) return { ok: false, error: "Write something first." };
  const n = charCount(body);
  if (n > POST_MAX) return { ok: false, error: `Posts are up to ${POST_MAX} characters (this one is ${n}).` };
  return { ok: true, value: body };
}

/**
 * Text split into plain runs and web links, for rendering without HTML:
 * only http(s) links become links; everything else is text, verbatim.
 */
export type TextPart = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };
export function linkParts(text: string): TextPart[] {
  const out: TextPart[] = [];
  const re = /\bhttps?:\/\/[^\s<>"']+/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    // Trailing punctuation belongs to the sentence, not the link.
    const url = m[0].replace(/[.,;:!?)\]]+$/, "");
    const start = m.index!;
    if (start > last) out.push({ kind: "text", text: text.slice(last, start) });
    try {
      const u = new URL(url);
      out.push(u.protocol === "http:" || u.protocol === "https:" ? { kind: "link", text: url, href: u.toString() } : { kind: "text", text: url });
    } catch {
      out.push({ kind: "text", text: url });
    }
    last = start + url.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** Feed cursor: the last post shown, as (createdAt, id). Opaque to callers. */
export function encodeCursor(p: { createdAt: Date; id: string }): string {
  return Buffer.from(`${p.createdAt.toISOString()}|${p.id}`).toString("base64url");
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function decodeCursor(c: unknown): { createdAt: Date; id: string } | null {
  if (typeof c !== "string" || c.length > 200) return null;
  const [at, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
  const createdAt = new Date(at ?? "");
  return Number.isNaN(createdAt.getTime()) || !UUID_RE.test(id ?? "") ? null : { createdAt, id };
}

/**
 * Whether a job may be embedded in a post now: the organization's own and
 * published. (Shown later as it is then: a closed job reads "No longer
 * hiring" with no Apply.)
 */
export function embedProblem(job: { orgId: string; status: string } | null, orgId: string): string | null {
  if (!job || job.orgId !== orgId) return "Pick one of your organization's jobs.";
  if (job.status !== "PUBLISHED") return "Only a published job can be embedded.";
  return null;
}

/** What an embedded job's card says about applying, from the job as it is now. */
export function embedState(job: { status: string; endsAt: Date | null }, now: Date): "open" | "paused" | "closed" {
  if (job.status === "PUBLISHED" && (!job.endsAt || job.endsAt.getTime() >= now.getTime() - 86_400_000)) return "open";
  return job.status === "PAUSED" ? "paused" : "closed";
}
