import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fromRow, samePreferences, type FitPreferences } from "@/lib/political-fit";

/** Identifies the consent wording the worker agreed to (stored in the audit log). */
export const CONSENT_TEXT_VERSION = "m1-2026-09-30";

export const CONSENT_TEXT =
  "These answers are my own choices. Turfcut may use them only as my visibility setting describes. " +
  "I can change or withdraw them at any time; each change is saved as a new version and the latest one applies.";

/** The authoritative (latest-version) preferences, or null if none exist. */
export async function loadLatestPreference(workerId: string) {
  const row = await db().politicalPreference.findFirst({
    where: { workerId },
    orderBy: { consentVersion: "desc" },
  });
  return row
    ? { ...fromRow(row), consentVersion: row.consentVersion, consentedAt: row.createdAt }
    : null;
}

const json = (v: unknown) =>
  v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);

/**
 * Appends a new consent version. Never updates an existing row.
 * Identical answers are a no-op.
 *
 * Saves for one worker are serialized with a transaction-scoped advisory
 * lock, so concurrent saves each get the next version in turn. The unique
 * (workerId, consentVersion) index is the backstop if anything bypasses this.
 */
export async function savePreferences(
  workerId: string,
  actorId: string,
  prefs: FitPreferences
): Promise<{ changed: boolean; consentVersion: number }> {
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`political_preferences:${workerId}`}))`;

    const row = await tx.politicalPreference.findFirst({
      where: { workerId },
      orderBy: { consentVersion: "desc" },
    });
    if (row && samePreferences(fromRow(row), prefs)) {
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
      },
    });
    // Records the act of consent, not the answers themselves.
    await tx.auditEvent.create({
      data: {
        actorId,
        action: "political_preferences.consented",
        entityType: "Worker",
        entityId: workerId,
        metadata: { consentVersion, consentTextVersion: CONSENT_TEXT_VERSION },
      },
    });
    return { changed: true, consentVersion };
  });
}

/** True when the worker applied to, or was invited by, one of the org's jobs. */
export async function orgHasRelationship(workerId: string, orgId: string): Promise<boolean> {
  const n = await db().engagement.count({ where: { workerId, job: { orgId } } });
  return n > 0;
}
