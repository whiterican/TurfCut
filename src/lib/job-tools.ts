/**
 * The canvassing app a job's work runs in (C4.4): which app, the list or
 * turf to open in it, and a line of instructions for the brief. At the end
 * of a shift the worker enters the app's returned totals (doors, contacts)
 * as one APP_COUNTS event; the newest replaces what was logged by hand for
 * that shift. Stored on Job.tools as JSON, read tolerantly, never invented.
 */

export const CANVASS_APPS = [
  { value: "MINIVAN", label: "MiniVAN (NGP VAN)" },
  { value: "PDI", label: "PDI" },
  { value: "ECANVASSER", label: "Ecanvasser" },
] as const;
export type CanvassApp = (typeof CANVASS_APPS)[number]["value"];

export interface JobTools {
  canvassApp: CanvassApp | null;
  /** The list, turf or walk name to open in the app. */
  list: string | null;
  /** How to get into it: who hands out devices, where to meet, and so on — never a password or code (those come from the supervisor in person). Shown on the shift brief, not in the feed. */
  notes: string | null;
}

export const NO_TOOLS: JobTools = { canvassApp: null, list: null, notes: null };

export const appLabel = (app: CanvassApp) => CANVASS_APPS.find((a) => a.value === app)?.label ?? app;

export const isCanvassApp = (v: unknown): v is CanvassApp => CANVASS_APPS.some((a) => a.value === v);
const isApp = isCanvassApp;

/** Job.tools as stored, or none. */
export function readTools(v: unknown): JobTools {
  if (!v || typeof v !== "object" || Array.isArray(v)) return NO_TOOLS;
  const o = v as Record<string, unknown>;
  const canvassApp = isApp(o.canvassApp) ? o.canvassApp : null;
  return {
    canvassApp,
    list: canvassApp && typeof o.list === "string" && o.list ? o.list : null,
    notes: canvassApp && typeof o.notes === "string" && o.notes ? o.notes : null,
  };
}

/** Whether a submission says anything about tools (API callers from before C4 don't). */
export const hasToolsFields = (raw: Record<string, unknown>) => "canvassApp" in raw || "toolList" in raw || "toolNotes" in raw;

/** The builder's fields: `canvassApp` ("" for none), `toolList`, `toolNotes`. */
export function validateTools(raw: Record<string, unknown>): { ok: true; value: JobTools } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const t = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim().replace(/\s+/g, " ") : "");
  const app = t("canvassApp");
  if (app && !isApp(app)) errors.canvassApp = "Pick one of the apps, or none.";
  const list = t("toolList");
  const notes = typeof raw.toolNotes === "string" ? raw.toolNotes.trim() : "";
  if (list.length > 120) errors.toolList = "Keep the list name under 120 characters.";
  if (notes.length > 500) errors.toolNotes = "Keep the instructions under 500 characters.";
  if (!app && (list || notes)) errors.canvassApp = "Pick the app these belong to, or clear them.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: app ? { canvassApp: app as CanvassApp, list: list || null, notes: notes || null } : NO_TOOLS };
}

/** The builder's defaults for stored tools. */
export function toolsToForm(tools: JobTools): Record<string, string> {
  return { canvassApp: tools.canvassApp ?? "", toolList: tools.list ?? "", toolNotes: tools.notes ?? "" };
}

/** One line for the job card and the shift brief. */
export function toolsText(tools: JobTools): string | null {
  if (!tools.canvassApp) return null;
  return `${appLabel(tools.canvassApp)}${tools.list ? `: ${tools.list}` : ""}`;
}
