import { AREAS, BUILT_IN_ROLES, levelsFor, type AccessLevel, type Area, type BuiltInRole, type Grants } from "@/lib/access";
import type { Role } from "@/lib/auth";

/**
 * Custom roles (M10.6), the pure half: how a role form is read, how a role
 * is named, and who may hand out what. Browser-safe: no database here.
 */

export const ROLE_NAME_MAX = 60;
export const ROLE_DESCRIPTION_MAX = 300;
/** Live (not archived) custom roles one organization can have. */
export const ROLES_MAX = 20;

/** How the access map's areas are named when an owner builds a role, with what each one lets a member do. */
export const AREA_LABELS: Record<Area, { label: string; help: string }> = {
  desk: { label: "Desk", help: "The home screen." },
  hiring: { label: "Hiring", help: "Worker hiring profiles, applicants, offers and invitations." },
  jobs: { label: "Jobs", help: "The job list and each job's page. Read-only unless Create and publish jobs is also granted." },
  jobsEdit: { label: "Create and publish jobs", help: "Create, edit, publish, pause and close jobs." },
  scheduling: { label: "Scheduling", help: "Schedule shifts for hired workers and post open shifts." },
  field: { label: "Field", help: "Run field days: packets, counts, check-ins, shift review." },
  pay: { label: "Pay", help: "Approve and hold pay, resolve disputes, pay workers, export." },
  messages: { label: "Messages", help: "Chat with workers and run team chats." },
  moderation: { label: "Chat moderation", help: "Review chat reports and remove reported messages." },
  orgSettings: { label: "Organization settings", help: "Read, or (full) edit the organization's records, such as contractor terms." },
  compliance: { label: "Compliance", help: "Classification review and credential checks." },
  orgMembers: { label: "Members", help: "Invite, change and remove members, within the access they have themselves." },
  campaigns: { label: "Campaign profiles", help: "Profile, handle, publishing and pins." },
  campaignPosting: { label: "Campaign posts", help: "Write and manage a campaign's posts." },
};

/** A custom role's name as members see it, or the built-in role's. */
export function roleName(r: { role: Role; roleName?: string | null }, builtIn: Record<Role, string>): string {
  return r.role === "CUSTOM" ? (r.roleName ?? builtIn.CUSTOM) : builtIn[r.role];
}

export interface RoleInput {
  name: string;
  description: string;
  basedOn: BuiltInRole | null;
  grants: Grants;
}

/** Reads a role form: `name`, `description`, `basedOn`, and one `area:<area>` field per area ("none", "read" or "full"). */
export function validateRole(raw: { get(key: string): unknown }): { ok: true; value: RoleInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const text = (k: string) => (typeof raw.get(k) === "string" ? (raw.get(k) as string) : "");
  const name = text("name").trim().replace(/\s+/g, " ");
  const description = text("description").trim();
  if (!name) errors.name = "Name the role.";
  else if ([...name].length > ROLE_NAME_MAX) errors.name = `Keep the name to ${ROLE_NAME_MAX} characters.`;
  if ([...description].length > ROLE_DESCRIPTION_MAX) errors.description = `Keep the description to ${ROLE_DESCRIPTION_MAX} characters.`;
  const based = text("basedOn");
  const basedOn = (BUILT_IN_ROLES as string[]).includes(based) ? (based as BuiltInRole) : null;
  const grants: Grants = {};
  for (const area of AREAS) {
    const v = text(`area:${area}`);
    if (v === "" || v === "none") continue;
    if (v !== "read" && v !== "full") {
      errors.grants = "Pick none, read or full for each area.";
      continue;
    }
    if (!levelsFor(area).includes(v)) {
      errors.grants = `${AREA_LABELS[area].label} can't be granted at ${v}.`;
      continue;
    }
    grants[area] = v;
  }
  if (!errors.grants && Object.keys(grants).length === 0) errors.grants = "Give the role access to at least one area.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { name, description, basedOn, grants } };
}

const RANK: Record<AccessLevel, number> = { read: 1, full: 2 };

/** Whether `have` reaches everything `want` does, at the same level or better. */
export function withinReach(have: Grants, want: Grants): boolean {
  return (Object.keys(want) as Area[]).every((a) => {
    const w = want[a];
    const h = have[a];
    return !w || (!!h && RANK[h] >= RANK[w]);
  });
}

/** What a member is offered as a role: a built-in role by its name, or one of the organization's own by id. */
export type RoleChoice = { role: BuiltInRole; orgRoleId: null } | { role: "CUSTOM"; orgRoleId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const customChoice = (id: string): string => `custom:${id}`;

/** Reads a role select's value: a built-in role the owner may hand out, or `custom:<id>`. */
export function parseRoleChoice(raw: unknown, offered: readonly string[]): RoleChoice | null {
  if (typeof raw !== "string") return null;
  if (raw.startsWith("custom:")) {
    const id = raw.slice(7);
    return UUID.test(id) ? { role: "CUSTOM", orgRoleId: id.toLowerCase() } : null;
  }
  return offered.includes(raw) ? { role: raw as BuiltInRole, orgRoleId: null } : null;
}
