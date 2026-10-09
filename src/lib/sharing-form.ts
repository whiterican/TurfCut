import { SHARE_PARTS } from "@/lib/sharing";

/** The Who-sees-what form's fields as the shape validateSharing() checks. Pure. */
export function sharingFromForm(formData: FormData) {
  return {
    audiences: Object.fromEntries(SHARE_PARTS.map((p) => [p, formData.get(`audience.${p}`)])),
    // Read receipts aren't on this screen until C3: left out, so saveSharing keeps the saved value.
    findable: formData.get("findable") === "on",
    workTypes: formData.getAll("workTypes"),
    homeArea: formData.get("homeArea") ?? null,
    travelMiles: formData.get("travelMiles") ?? null,
  };
}
