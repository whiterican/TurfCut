/**
 * Compatibility bridge from the CURRENT Prisma job activities to the future
 * compliance taxonomy. This is a pure classifier, never an authorization.
 *
 * Campaign disclosure is intentionally excluded: an existing CANVASS job may
 * be candidate, issue, ballot, or civic canvassing, but its field activity
 * remains door_canvassing. New work types require an approved schema and
 * distinct mapping; do not force phone/survey/fundraising into CANVASS.
 */
import type { JobType } from "@prisma/client";
import type { ComplianceActivity, CommunicationMethod } from "./compliance-policy";

export interface LegacyActivityMapping {
  activity: ComplianceActivity;
  method: CommunicationMethod;
  /** True means current job taxonomy can represent this activity exactly. */
  isLegacySupported: true;
}

export function legacyJobActivity(type: JobType): LegacyActivityMapping | null {
  if (type === "PETITION") return { activity: "petition_circulation", method: "in_person", isLegacySupported: true };
  if (type === "CANVASS") return { activity: "door_canvassing", method: "in_person", isLegacySupported: true };
  return null;
}

/**
 * A future caller MUST take its jurisdiction/sector from server-owned DB
 * records, not user-supplied query strings or forms. This bridge returns
 * neither jurisdiction nor legal authority.
 */
