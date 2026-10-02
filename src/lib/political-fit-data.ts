import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { RELATIONSHIP_STATUSES } from "@/lib/engagements";
import {
  consentStatus,
  CONSENT_TEXT_VERSION,
  fromRow,
  samePreferences,
  type FitPreferences,
} from "@/lib/political-fit";

export { CONSENT_TEXT, CONSENT_TEXT_VERSION } from "@/lib/political-fit";

/** The authoritative (latest-version) preferences, or null if none exist. */
export async function loadLatestPreference(workerId: string) {
  const row = await db().politicalPreference.findFirst({
    where: { workerId },
    orderBy: { consentVersion: "desc" },
  });
  return row
    ? {
        ...fromRow(row),
        consentVersion: row.consentVersion,
        consentedAt: row.createdAt,
        expiresAt: row.expiresAt,
        consentTextVersion: row.consentTextVersion,
        status: consentStatus(row),
      }
    : null;
}

const json = (v: unknown) =>
  v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);

/**
 * Appends a new consent version. Never updates an existing row.
 *
 * A save is a no-op only when nothing about the consent would change: same
 * answers, same expiry, same consent wording, and the current consent hasn't
 * lapsed. Reconfirming an expired consent, or one given under older wording,
 * always writes a new version — even with identical answers.
 *
 * Saves for one worker are serialized with a transaction-scoped advisory
 * lock, so concurrent saves each get the next version in turn. The unique
 * (workerId, consentVersion) index is the backstop if anything bypasses this.
 */
export async function savePreferences(
  workerId: string,
  actorId: string,
  prefs: FitPreferences,
  expiresAt: Date | null
): Promise<{ changed: boolean; consentVersion: number }> {
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`political_preferences:${workerId}`}))`;

    const row = await tx.politicalPreference.findFirst({
      where: { workerId },
      orderBy: { consentVersion: "desc" },
    });
    if (
      row &&
      consentStatus(row).state === "current" &&
      (row.expiresAt?.getTime() ?? null) === (expiresAt?.getTime() ?? null) &&
      samePreferences(fromRow(row), prefs)
    ) {
      return { changed: false, consentVersion: row.consentVersion };
    }

    const consentVersion = (row?.consentVersion ?? 0) + 1;
    await tx.politicalPreference.create({
      data: {
        workerId,
        consentVersion,
        visibilityMode: prefs.visibilityMode,
        identityLabels: json(prefs.identityLabels),
        partyRelationship: json(prefs.partyRelationship),
        issuePositions: json(prefs.issuePositions),
        campaignBoundaries: json(prefs.campaignBoundaries),
        expiresAt,
        consentTextVersion: CONSENT_TEXT_VERSION,
      },
    });
    // Records the act of consent, not the answers themselves.
    await tx.auditEvent.create({
      data: {
        actorId,
        action: "political_preferences.consented",
        entityType: "Worker",
        entityId: workerId,
        metadata: {
          consentVersion,
          consentTextVersion: CONSENT_TEXT_VERSION,
          expiresAt: expiresAt?.toISOString() ?? null,
        },
      },
    });
    return { changed: true, consentVersion };
  });
}

/**
 * True when the worker applied to, claimed, or accepted one of the org's
 * jobs. An invitation the worker hasn't accepted is not a relationship.
 */
export async function orgHasRelationship(workerId: string, orgId: string): Promise<boolean> {
  const n = await db().engagement.count({ where: { workerId, job: { orgId }, status: { in: RELATIONSHIP_STATUSES } } });
  return n > 0;
}
