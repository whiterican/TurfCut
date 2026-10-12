/**
 * The briefing kit (S4): supporting facts behind talking points, and
 * campaign resources (scripts, common questions, guides). Pure rules — no
 * database access.
 *
 * Everything here is the campaign's own words, shown verbatim to the
 * workers on its jobs (and, where the campaign says so, to anyone).
 * Turfcut never writes, summarizes, labels or scores any of it, and
 * nothing here is ever read by matching (C1-Q14).
 */
import { charCount, isVisible, tidyText } from "@/lib/campaign-social";

/** Supporting facts per talking point. */
export const MAX_FACTS = 5;
export const FACT_MAX = 300;
export const SOURCE_URL_MAX = 500;
/** Resources per campaign (all kinds together). */
export const MAX_RESOURCES = 20;
export const TITLE_MAX = 120;
export const RESOURCE_MAX = 8000;

export type ResourceKind = "SCRIPT" | "FAQ" | "GUIDE";
export type ResourceAudience = "PUBLIC" | "WORKERS";
export const RESOURCE_KINDS: ResourceKind[] = ["SCRIPT", "FAQ", "GUIDE"];
export const RESOURCE_AUDIENCES: ResourceAudience[] = ["WORKERS", "PUBLIC"];

/** What each kind is, in the campaign's and the worker's words. */
export const KIND_LABELS: Record<ResourceKind, { one: string; many: string; hint: string }> = {
  SCRIPT: { one: "Script", many: "Scripts", hint: "What to say at the door or with the clipboard, in your own words." },
  FAQ: { one: "Common question", many: "Common questions", hint: "A question people ask, and the answer you want given." },
  GUIDE: { one: "Guide", many: "Guides", hint: "How the day works: where to meet, what to bring, who to call." },
};
export const AUDIENCE_LABELS: Record<ResourceAudience, { label: string; hint: string }> = {
  WORKERS: { label: "Workers on this campaign's jobs", hint: "Shown in the shift brief of every job linked to this campaign, to the workers on it and their field staff." },
  PUBLIC: { label: "Anyone", hint: "Shown on the campaign's public page as well as in shift briefs." },
};

export type FactInput = { body: string; sourceUrl: string | null };
export type ResourceInput = { kind: ResourceKind; audience: ResourceAudience; title: string; body: string };
type Validation<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

/** A source link as the campaign typed it: http(s) only, nothing hidden in it (no login in the address), or null for none. */
export function sourceUrlProblem(raw: string): string | null {
  if (raw === "") return null;
  if (charCount(raw) > SOURCE_URL_MAX) return `Keep the link to ${SOURCE_URL_MAX} characters.`;
  if (/\s/.test(raw)) return "A link has no spaces.";
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "A source link starts with http:// or https://.";
    if (u.username || u.password) return "That link carries a login; leave it out.";
    return null;
  } catch {
    return "That doesn't look like a web address.";
  }
}

export function validateFact(raw: { body: unknown; sourceUrl: unknown }): Validation<FactInput> {
  const errors: Record<string, string> = {};
  const body = typeof raw.body === "string" ? tidyText(raw.body) : "";
  const sourceUrl = typeof raw.sourceUrl === "string" ? raw.sourceUrl.trim() : "";
  if (!isVisible(body)) errors.body = "Write the fact first.";
  else if (charCount(body) > FACT_MAX) errors.body = `Keep a fact to ${FACT_MAX} characters.`;
  const link = sourceUrlProblem(sourceUrl);
  if (link) errors.sourceUrl = link;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { body, sourceUrl: sourceUrl || null } };
}

export function validateResource(raw: { kind: unknown; audience: unknown; title: unknown; body: unknown }): Validation<ResourceInput> {
  const errors: Record<string, string> = {};
  const kind = RESOURCE_KINDS.find((k) => k === raw.kind);
  const audience = RESOURCE_AUDIENCES.find((a) => a === raw.audience);
  const title = typeof raw.title === "string" ? tidyText(raw.title).replace(/\s+/g, " ") : "";
  const body = typeof raw.body === "string" ? tidyText(raw.body) : "";
  if (!kind) errors.kind = "Pick what this is.";
  if (!audience) errors.audience = "Pick who it's for.";
  if (!isVisible(title)) errors.title = "Give it a title.";
  else if (charCount(title) > TITLE_MAX) errors.title = `Keep the title to ${TITLE_MAX} characters.`;
  if (!isVisible(body)) errors.body = "Write it first.";
  else if (charCount(body) > RESOURCE_MAX) errors.body = `Keep it to ${RESOURCE_MAX.toLocaleString("en-US")} characters.`;
  return Object.keys(errors).length || !kind || !audience ? { ok: false, errors } : { ok: true, value: { kind, audience, title, body } };
}

/** The next free position after the ones in use (1-based; removed items free theirs). */
export function nextPosition(taken: number[], max: number): number | null {
  for (let i = 1; i <= max; i++) if (!taken.includes(i)) return i;
  return null;
}

/** Resources grouped by kind, each group in position order, kinds in their fixed order; empty kinds left out. */
export function groupByKind<T extends { kind: ResourceKind; position: number }>(items: T[]): { kind: ResourceKind; items: T[] }[] {
  return RESOURCE_KINDS.map((kind) => ({ kind, items: items.filter((i) => i.kind === kind).sort((a, b) => a.position - b.position) })).filter((g) => g.items.length > 0);
}
