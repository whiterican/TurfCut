import { readDisclosure, type JobType } from "@/lib/jobs";

/**
 * The founder's seven work categories and how far each one is: built (live
 * in the app), in development (postable, its own tools not launched), or
 * planned (not live at all). Wherever a category is named to a reader, the
 * two unfinished kinds carry their tag (CategoryStatusTag), so a planned
 * category is never presented as launched. Only PETITION and CANVASS exist
 * as job types; the rest are words until each is supported end to end
 * (docs/product/EXPANSION_UX_ROADMAP.md, "Complete planned job categories").
 */
export type CategoryStatus = "built" | "in_development" | "planned";

export interface JobCategory {
  id: string;
  label: string;
  status: CategoryStatus;
  /** The live job type that carries it, when there is one. */
  type?: JobType;
}

export const JOB_CATEGORIES: readonly JobCategory[] = [
  { id: "petition_circulation", label: "Petition circulation", status: "built", type: "PETITION" },
  { id: "door_canvassing", label: "Door-to-door canvassing", status: "built", type: "CANVASS" },
  { id: "candidate_canvassing", label: "Candidate campaign canvassing", status: "in_development", type: "CANVASS" },
  { id: "phone_banking", label: "Phone banking", status: "planned" },
  { id: "phone_polling", label: "Phone polling", status: "planned" },
  { id: "door_polling", label: "Door-to-door polling", status: "planned" },
  { id: "door_fundraising", label: "Door-to-door fundraising", status: "planned" },
  { id: "door_sales", label: "Door-to-door sales", status: "planned" },
];

/** The tag's words; a built category carries none. */
export const CATEGORY_STATUS_LABEL: Record<CategoryStatus, string | null> = {
  built: null,
  in_development: "In development",
  planned: "Planned",
};

export const PLANNED_CATEGORIES = JOB_CATEGORIES.filter((c) => c.status === "planned");

/** A job's category status from its type and what the campaign disclosed: a candidate canvass is in development; everything else live is built. */
export function categoryStatusOf(type: JobType, campaignDisclosure: unknown): CategoryStatus {
  if (type === "CANVASS" && readDisclosure(campaignDisclosure)?.campaignType === "candidate") return "in_development";
  return "built";
}
