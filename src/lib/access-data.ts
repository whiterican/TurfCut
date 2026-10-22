import type { Prisma } from "@prisma/client";
import { rolesFor, type AccessLevel, type Area } from "@/lib/access";

/**
 * Members of an organization who reach `area` at `level` (M10.6): the
 * built-in roles the access map gives it to, and the members on a live
 * custom role with a grant that admits the level. Combine it with the
 * organization and closed-account conditions the query already has:
 * { orgId, closedAt: null, ...areaMembers("pay") }.
 */
export function areaMembers(area: Area, level: AccessLevel = "full"): Pick<Prisma.ProfileWhereInput, "OR"> {
  return {
    OR: [
      { role: { in: rolesFor(area, level) } },
      { role: "CUSTOM", orgRole: { archivedAt: null, grants: { some: { area, level: { in: level === "read" ? ["FULL", "READ"] : ["FULL"] } } } } },
    ],
  };
}
