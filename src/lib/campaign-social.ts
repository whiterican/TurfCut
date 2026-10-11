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
  "null", "undefined", "root", "system", "moderator", "mod", "www", "me", "feed", "search", "explore", "home", "notifications",
  "messages", "shifts", "profile", "desk", "hiring", "field", "pay", "org", "workers",
]);

/** Characters as Postgres counts them (code points), so the 500 here is the database's 500. */
export const charCount = (s: string) => [...s].length;

/**
 * Characters taken out of a campaign's text: control characters (but line
 * breaks and tabs: no NULs), invisible ones (zero-width space, word joiners,
 * byte-order mark, soft hyphen), and direction overrides that make a name
 * read as something else. Joiners and emoji tag characters stay: they're
 * part of how people write (family and flag emoji, Persian spelling).
 */
const STRIP = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
/** Characters that draw nothing: a post made only of these is empty. */
const INVISIBLE = /[\p{Cf}\p{Z}\s\u115f\u1160\u2800\u3164\uffa0]/gu;

/**
 * Text tidied the way the database will store it: the characters above
 * removed, other whitespace read as a space, line endings unified, trailing
 * spaces gone, at most one blank line in a row. Everything else verbatim.
 */
export function tidyText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(STRIP, "")
    .replace(/[^\S\n\t ]/g, " ")
    .split("\n").map((l) => l.replace(/[ \t]+$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Whether text shows anything at all. */
export const isVisible = (s: string) => s.replace(INVISIBLE, "").length > 0;

export function normalizeHandle(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/^@/, "").toLowerCase() : "";
}

export function handleProblem(handle: string): string | null {
  if (!HANDLE_RE.test(handle)) return "Use 3 to 30 lowercase letters, numbers or underscores.";
  const bare = handle.replace(/_/g, "");
  if (RESERVED.has(handle) || RESERVED.has(bare) || bare.includes("turfcut")) return "That handle is reserved. Pick another.";
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
  const displayName = typeof raw.displayName === "string" ? tidyText(raw.displayName).replace(/\s+/g, " ") : "";
  if (!isVisible(displayName)) errors.displayName = "Give the campaign a name.";
  else if (charCount(displayName) > NAME_MAX) errors.displayName = `Keep the name to ${NAME_MAX} characters.`;
  const bio = typeof raw.bio === "string" ? tidyText(raw.bio) : "";
  if (charCount(bio) > BIO_MAX) errors.bio = `Keep the bio to ${BIO_MAX.toLocaleString("en-US")} characters.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { handle, displayName, bio } };
}

/** A post's text, tidied, or why not. */
export function validatePostBody(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const body = typeof raw === "string" ? tidyText(raw) : "";
  if (!isVisible(body)) return { ok: false, error: "Write something first." };
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
    const url = trimTrailing(m[0]);
    const start = m.index!;
    if (start > last) out.push({ kind: "text", text: text.slice(last, start) });
    let part: TextPart = { kind: "text", text: url };
    try {
      const u = new URL(url);
      // A link that hides where it goes stays text: "https://turfcut.com@evil.example" is a login at evil.example.
      if ((u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password) {
        // A host spelled with lookalike letters is shown as the browser will reach it (punycode).
        part = { kind: "link", text: /^[\x00-\x7f]*$/.test(url) ? url : u.href, href: u.href };
      }
    } catch {
      // not a URL after all: text
    }
    out.push(part);
    last = start + url.length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** Trailing punctuation belongs to the sentence, not the link (a closing bracket only when the link didn't open it). */
function trimTrailing(url: string): string {
  let u = url;
  const count = (c: string) => u.split(c).length - 1;
  for (;;) {
    const last = u.at(-1);
    if (last && ".,;:!?'\"".includes(last)) u = u.slice(0, -1);
    else if (last === ")" && count("(") < count(")")) u = u.slice(0, -1);
    else if (last === "]" && count("[") < count("]")) u = u.slice(0, -1);
    else return u;
  }
}

/** Campaigns an organization may hold (drafts included): handles aren't free to reserve in bulk. */
export const MAX_CAMPAIGNS_PER_ORG = 5;

/** Feed cursor: the last post shown, as (createdAt, id). Opaque to callers. Server-side only (Node Buffer). */
export function encodeCursor(p: { createdAt: Date; id: string }): string {
  return Buffer.from(`${p.createdAt.toISOString()}|${p.id}`).toString("base64url");
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function decodeCursor(c: unknown): { createdAt: Date; id: string } | null {
  if (typeof c !== "string" || c.length > 200) return null;
  const parts = Buffer.from(c, "base64url").toString("utf8").split("|");
  if (parts.length !== 2) return null;
  const [at, id] = parts;
  // Exactly what encodeCursor writes: anything looser (or outside the database's range) is junk.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) || !UUID_RE.test(id)) return null;
  const createdAt = new Date(at);
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
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

// ---------------------------------------------------------------------------
// Reach (S3): the directory and link previews. Nothing here ranks: the
// directory is ordered by when a campaign last posted, and a search matches
// names and handles the reader typed, nothing else.
// ---------------------------------------------------------------------------

/** Campaigns per directory page. */
export const DIRECTORY_PAGE_SIZE = 20;
/** The longest search a directory lookup takes. */
export const QUERY_MAX = 40;

/**
 * A one-line excerpt of a bio or post for link previews and directory rows:
 * whitespace collapsed, cut at a word, an ellipsis when something's left out.
 */
export function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (charCount(flat) <= max) return flat;
  const chars = [...flat].slice(0, max - 1);
  const cut = chars.join("");
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max / 2 ? cut.slice(0, atWord) : cut).replace(/[\s.,;:!?'"(\[{-]+$/, "")}…`;
}

/** A directory search as typed, tidied: trimmed, one space between words, no control characters, at most QUERY_MAX characters; a leading @ is just a handle. */
export function normalizeQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const q = raw.replace(/\s+/g, " ").replace(/[\p{C}]/gu, "").trim().replace(/^@/, "");
  return [...q].slice(0, QUERY_MAX).join("").trim();
}

/** The search as a LIKE pattern: the reader's text matched anywhere, its own wildcards taken literally. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

