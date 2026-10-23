/**
 * How the staff console names a campaign profile (M10.5). Kept in its own
 * file, with no imports, so the console's shared modules can use the name
 * without importing the social layer; the isolation test allows exactly
 * this file and campaign-admin-data to say it.
 */

/** The record type staff acts on a campaign profile are filed under. */
export const CAMPAIGN_TARGET = "CampaignProfile" as const;
export type CampaignTarget = typeof CAMPAIGN_TARGET;

/** Where a campaign profile's console page is, for the audit viewer's links. */
export function campaignRecordHref(entityType: string, entityId: string): string | null {
  return entityType === CAMPAIGN_TARGET ? `/admin/campaigns/${entityId}` : null;
}
