import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { staffLabel } from "@/lib/admin-data";
import { UUID_RE } from "@/lib/jobs";

/** The five ledger moments the Ledger quick filter pins (M10 plan, decision 8): a job goes live, a shift is reviewed, a pay line is approved, a payout is created, a statement is closed. */
export const LEDGER_MOMENTS = ["job.published", "shift.reviewed", "approve", "payout.created", "pay.statement_closed"] as const;
export const TIMELINE_PAGE = 50;

export interface AuditFilter {
  /** Part of an action name, matched anywhere, case-insensitive ("job" finds job.published and job.closed). */
  kind: string | null;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  from: Date | null;
  to: Date | null;
  /** Only the five ledger moments (audit events; staff acts are never ledger moments). */
  ledger: boolean;
}
export interface Cursor {
  createdAt: Date;
  id: string;
}

const one = (sp: Record<string, string | string[] | undefined>, k: string): string => {
  const v = sp[k];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" ? s.trim() : "";
};
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayStart = (s: string): Date | null => (DAY_RE.test(s) ? new Date(`${s}T00:00:00Z`) : null);
const dayEnd = (s: string): Date | null => (DAY_RE.test(s) ? new Date(`${s}T23:59:59.999Z`) : null);

/** The viewer's query string as a filter. Anything malformed is dropped, never refused: a filter is a view, not an act. */
export function parseAuditFilter(sp: Record<string, string | string[] | undefined>): AuditFilter {
  const actor = one(sp, "actor");
  return {
    kind: one(sp, "kind").slice(0, 80) || null,
    actorId: UUID_RE.test(actor) ? actor : null,
    entityType: one(sp, "type").slice(0, 40) || null,
    entityId: one(sp, "id").slice(0, 80) || null,
    from: dayStart(one(sp, "from")),
    to: dayEnd(one(sp, "to")),
    ledger: one(sp, "ledger") === "1",
  };
}

const CURSOR_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)_([0-9a-f-]{36})$/i;
export function parseCursor(raw: unknown): Cursor | null {
  const m = typeof raw === "string" ? CURSOR_RE.exec(raw.trim()) : null;
  if (!m) return null;
  const createdAt = new Date(m[1]);
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: m[2] };
}
export const cursorString = (c: Cursor) => `${c.createdAt.toISOString()}_${c.id}`;

/** The query string for a filter and, for the next page, its cursor. */
export function filterQuery(f: AuditFilter, cursor: Cursor | null = null): string {
  const p = new URLSearchParams();
  if (f.kind) p.set("kind", f.kind);
  if (f.actorId) p.set("actor", f.actorId);
  if (f.entityType) p.set("type", f.entityType);
  if (f.entityId) p.set("id", f.entityId);
  if (f.from) p.set("from", f.from.toISOString().slice(0, 10));
  if (f.to) p.set("to", f.to.toISOString().slice(0, 10));
  if (f.ledger) p.set("ledger", "1");
  if (cursor) p.set("after", cursorString(cursor));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Where a record's own console page is, when it has one. */
export function recordHref(entityType: string, entityId: string): string | null {
  if (!UUID_RE.test(entityId)) return null;
  switch (entityType) {
    case "Organization": return `/admin/organizations/${entityId}`;
    case "JurisdictionProfile": return `/admin/jurisdictions/${entityId}`;
    case "Profile": return `/admin/people/${entityId}`;
    default: return null;
  }
}

export interface TimelineRow {
  id: string;
  /** An organization's or worker's own audit event, or a staff act from the ledger. */
  source: "audit" | "staff";
  action: string;
  actorId: string | null;
  /** The actor's name as the app shows it; null for a system event. */
  actorName: string | null;
  entityType: string;
  entityId: string;
  orgName: string | null;
  reason: string | null;
  metadata: unknown;
  createdAt: Date;
  href: string | null;
}

/**
 * Keyset merge of two sources each already sorted newest first (createdAt
 * desc, id asc) and each fetched one row past the page: the page, and the
 * cursor for what follows, or null when both sources ran out.
 */
export function mergeTimeline<T extends { createdAt: Date; id: string }>(a: T[], b: T[], limit: number): { rows: T[]; next: Cursor | null } {
  const all = [...a, ...b].sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const rows = all.slice(0, limit);
  const last = rows[rows.length - 1];
  return { rows, next: all.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null };
}

/** How an actor is named on the timeline: a worker's name, else a member's chat name, else a short id. Never an email. */
const personLabel = (p: { id: string; displayName: string | null; worker: { displayName: string } | null }) => p.worker?.displayName || p.displayName || `Account ${p.id.slice(0, 8)}`;

/** One timeline of audit events and staff acts, newest first, a page at a time (M10.4). */
export async function loadTimeline(f: AuditFilter, cursor: Cursor | null = null, limit = TIMELINE_PAGE): Promise<{ rows: TimelineRow[]; next: Cursor | null }> {
  const time: Prisma.DateTimeFilter = {};
  if (f.from) time.gte = f.from;
  if (f.to) time.lte = f.to;
  const after: Prisma.AuditEventWhereInput & Prisma.AdminActionWhereInput = cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] } : {};
  const order = [{ createdAt: "desc" as const }, { id: "asc" as const }];
  const auditWhere: Prisma.AuditEventWhereInput = {
    AND: [
      { createdAt: time },
      after,
      f.ledger ? { action: { in: [...LEDGER_MOMENTS] } } : f.kind ? { action: { contains: f.kind, mode: "insensitive" } } : {},
      f.actorId ? { actorId: f.actorId } : {},
      f.entityType ? { entityType: { equals: f.entityType, mode: "insensitive" } } : {},
      f.entityId ? { entityId: f.entityId } : {},
    ],
  };
  const staffWhere: Prisma.AdminActionWhereInput = {
    AND: [
      { createdAt: time },
      after,
      f.kind ? { action: { contains: f.kind, mode: "insensitive" } } : {},
      f.actorId ? { staffId: f.actorId } : {},
      f.entityType ? { targetType: { equals: f.entityType, mode: "insensitive" } } : {},
      f.entityId ? { targetId: f.entityId } : {},
    ],
  };
  const [audit, staff] = await Promise.all([
    db().auditEvent.findMany({ where: auditWhere, orderBy: order, take: limit + 1 }),
    f.ledger
      ? Promise.resolve([])
      : db().adminAction.findMany({
          where: staffWhere,
          orderBy: order,
          take: limit + 1,
          select: { id: true, action: true, targetType: true, targetId: true, reason: true, metadata: true, createdAt: true, staffId: true, org: { select: { name: true } }, staff: { select: { id: true, displayName: true, worker: { select: { displayName: true } } } } },
        }),
  ]);
  const actorIds = [...new Set(audit.map((a) => a.actorId).filter((x): x is string => !!x))];
  const actors = actorIds.length ? await db().profile.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true, worker: { select: { displayName: true } } } }) : [];
  const nameOf = new Map(actors.map((p) => [p.id, personLabel(p)]));
  const rows: TimelineRow[] = [
    ...audit.map((a) => ({ id: a.id, source: "audit" as const, action: a.action, actorId: a.actorId, actorName: a.actorId ? (nameOf.get(a.actorId) ?? `Account ${a.actorId.slice(0, 8)}`) : null, entityType: a.entityType, entityId: a.entityId, orgName: null, reason: null, metadata: a.metadata, createdAt: a.createdAt, href: recordHref(a.entityType, a.entityId) })),
    ...staff.map((s) => ({ id: s.id, source: "staff" as const, action: s.action, actorId: s.staffId, actorName: staffLabel(s.staff), entityType: s.targetType, entityId: s.targetId, orgName: s.org?.name ?? null, reason: s.reason, metadata: s.metadata, createdAt: s.createdAt, href: recordHref(s.targetType, s.targetId) })),
  ];
  return mergeTimeline(rows.filter((r) => r.source === "audit"), rows.filter((r) => r.source === "staff"), limit);
}

/** Every action name and record type the two tables hold, for the filter's suggestions. */
export async function listAuditVocabulary(): Promise<{ kinds: string[]; entityTypes: string[] }> {
  const [k1, k2, t1, t2] = await Promise.all([
    db().$queryRaw<{ action: string }[]>`SELECT DISTINCT "action" FROM "AuditEvent"`,
    db().$queryRaw<{ action: string }[]>`SELECT DISTINCT "action" FROM "AdminAction"`,
    db().$queryRaw<{ t: string }[]>`SELECT DISTINCT "entityType" AS t FROM "AuditEvent"`,
    db().$queryRaw<{ t: string }[]>`SELECT DISTINCT "targetType" AS t FROM "AdminAction"`,
  ]);
  return { kinds: [...new Set([...k1, ...k2].map((r) => r.action))].sort(), entityTypes: [...new Set([...t1, ...t2].map((r) => r.t))].sort() };
}
