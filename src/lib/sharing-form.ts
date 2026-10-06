import { SHARE_PARTS } from "@/lib/sharing";

/** The Who-sees-what form's fields as the shape validateSharing() checks. Pure. */
export function sharingFromForm(formData: FormData, readReceipts: boolean) {
  return {
    audiences: Object.fromEntries(SHARE_PARTS.map((p) => [p, formData.get(`audience.${p}`)])),
    // Not on this screen until C3; the saved value carries over.
    readReceipts,
    findable: formData.get("findable") === "on",
    workTypes: formData.getAll("workTypes"),
    homeArea: formData.get("homeArea") ?? null,
    travelMiles: formData.get("travelMiles") ?? null,
  };
}
