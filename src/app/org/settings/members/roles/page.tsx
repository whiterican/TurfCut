import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { RoleForm } from "@/components/RoleForm";
import { AREAS, BUILT_IN_ROLES, presetGrants, ROLE_LABELS, type BuiltInRole } from "@/lib/access";
import { requireArea } from "@/lib/employer-session";
import { AREA_LABELS, ROLES_MAX } from "@/lib/org-roles";
import { listOrgRoles } from "@/lib/org-roles-data";
import { db } from "@/lib/db";
import { archiveRole } from "./actions";
import { Masthead } from "@/components/Masthead";

export const metadata = { title: "Roles · Turfcut" };

const summary = (g: Partial<Record<(typeof AREAS)[number], string>>) =>
  AREAS.filter((a) => g[a]).map((a) => `${AREA_LABELS[a].label}${g[a] === "read" ? " (read)" : ""}`).join(", ") || "Nothing";

/** The organization's own roles (M10.6): build them from a preset, tick the areas, assign them on the Members page. Owners only. */
export default async function RolesPage({ searchParams }: { searchParams: Promise<{ preset?: string; new?: string }> }) {
  const session = await requireArea("orgMembers");
  const me = await db().profile.findUnique({ where: { id: session.userId }, select: { role: true } });
  const { preset, new: wantsNew } = await searchParams;
  const isOwner = me?.role === "OWNER";
  const roles = await listOrgRoles(session.orgId);
  const live = roles.filter((r) => !r.archivedAt);
  const archived = roles.filter((r) => r.archivedAt);
  const base = (BUILT_IN_ROLES as string[]).includes(preset ?? "") ? (preset as BuiltInRole) : null;

  return (
    <main className="page max-w-3xl">
      <Masthead title="Roles" meta={<>The built-in roles stay as they are. Build your own for the seats that don&apos;t fit them, then choose one when you invite someone or change a member&apos;s role.</>}>
        <Link href="/org/settings/members" className="btn-ghost btn-sm">Back to members</Link>
      </Masthead>

      {!isOwner && <p className="card text-muted-sm">Only an owner builds roles. You can see them here, and assign the ones that reach no more than you do.</p>}

      <section className="section" aria-labelledby="live">
        <h2 id="live" className="section-title">Your roles <span className="text-xs font-medium text-subtle">{live.length} of {ROLES_MAX}</span></h2>
        {live.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No custom roles yet</p>
            <p className="empty-state-body">Start from a preset below.</p>
          </div>
        ) : (
          <ul className="list-card">
            {live.map((r) => (
              <li key={r.id} className="space-y-3 px-4 py-4">
                <div className="space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    {r.name}
                    {r.basedOn && <span className="tag">From {ROLE_LABELS[r.basedOn]}</span>}
                    <span className="text-xs font-normal text-subtle">{r.members} {r.members === 1 ? "member" : "members"}{r.invites ? ` · ${r.invites} invited` : ""}</span>
                  </p>
                  {r.description && <p className="text-muted-sm">{r.description}</p>}
                  <p className="text-xs text-muted">{summary(r.grants)}</p>
                </div>
                {isOwner && (
                  <details className="group">
                    <summary className="link cursor-pointer list-none text-sm font-semibold">Edit…</summary>
                    <div className="mt-3 space-y-4">
                      <RoleForm roleId={r.id} basedOn={r.basedOn} defaults={{ name: r.name, description: r.description, grants: r.grants }} submitLabel="Save changes" />
                      <ActionButton action={archiveRole} fields={{ roleId: r.id }} label="Archive this role" pendingLabel="Archiving…" variant="btn-ghost btn-sm" confirm={{ text: "Archive this role? Nobody can be given it afterwards. It can only be archived while no member holds it and no invite carries it.", label: "Yes, archive it" }} />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner && (
        <section className="section" aria-labelledby="new">
          <h2 id="new" className="section-title">New role</h2>
          <p className="text-muted-sm">Start from a preset, then change what it can do.</p>
          <p className="flex flex-wrap gap-2">
            {BUILT_IN_ROLES.map((r) => (
              <Link key={r} href={`/org/settings/members/roles?preset=${r}&new=1#new`} className={base === r ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{ROLE_LABELS[r]}</Link>
            ))}
            <Link href="/org/settings/members/roles?new=1#new" className={!base && wantsNew ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Blank</Link>
          </p>
          {(base || wantsNew) && (
            <div className="card">
              <RoleForm key={base ?? "blank"} basedOn={base} defaults={{ name: base ? `${ROLE_LABELS[base]} (custom)` : "", description: "", grants: base ? presetGrants(base) : {} }} submitLabel="Create role" />
            </div>
          )}
        </section>
      )}

      {archived.length > 0 && (
        <section className="section" aria-labelledby="archived">
          <h2 id="archived" className="section-title">Archived</h2>
          <ul className="list-card">
            {archived.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm text-muted">{r.name}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
