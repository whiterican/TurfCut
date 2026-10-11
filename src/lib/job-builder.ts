/**
 * The job builder's six steps (C4.1): which fields each one holds, so a
 * step can be checked on its own and a problem found later can point back
 * to the step it belongs to. The fields are the job form's input names
 * (validateJob reads the same keys).
 */
export interface BuilderStep {
  id: string;
  title: string;
  /** What the step asks, in one line. */
  blurb: string;
  /** The form field names (and error keys) that belong here. */
  fields: readonly string[];
}

export const BUILDER_STEPS: readonly BuilderStep[] = [
  { id: "work", title: "The work", blurb: "What the job is and where its rules come from.", fields: ["title", "type", "jurisdictionId", "description"] },
  { id: "when", title: "When and where", blurb: "The dates and the city workers report to.", fields: ["startsAt", "endsAt", "city", "state"] },
  { id: "pay", title: "Pay and hiring", blurb: "What it pays, how many people, and how they get in.", fields: ["compensationMethod", "payRate", "headcount", "hiringModes", "cancellationNoticeHours"] },
  { id: "requirements", title: "Requirements and contacts", blurb: "What workers must hold, and who they call when something goes wrong.", fields: ["registration", "badge", "affidavit", "training", "script", "contactEmergency", "contactDisputes", "contactLostMaterials"] },
  { id: "campaign", title: "Campaign disclosure", blurb: "What workers see about the campaign before they apply.", fields: ["campaignType", "affiliation", "campaignName", "measureIds", "message", "issues"] },
  { id: "review", title: "Review", blurb: "Check everything, then save the draft.", fields: [] },
];

/** The review step's index. */
export const REVIEW_STEP = BUILDER_STEPS.length - 1;

/** The step an error key belongs to (issue positions are `issue_<key>` fields under one `issues` error). */
export function stepOfField(key: string): number {
  const k = key.startsWith("issue_") ? "issues" : key;
  const i = BUILDER_STEPS.findIndex((s) => s.fields.includes(k));
  return i === -1 ? REVIEW_STEP : i;
}

/** The first step that has one of these errors, or null when none do. */
export function firstStepWithErrors(errors: Record<string, string>): number | null {
  const steps = Object.keys(errors).map(stepOfField);
  return steps.length ? Math.min(...steps) : null;
}

/** Only the errors that belong to one step. */
export function errorsForStep(errors: Record<string, string>, step: number): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).filter(([k]) => stepOfField(k) === step));
}
