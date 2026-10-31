import { StatusChip } from "@/components/StatusBadge";
import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { INVITE_ROLES, presetGrants, ROLE_HELP, ROLE_LABELS, type BuiltInRole, type Grants } from "@/lib/access";
import { requireArea } from "@/lib/employer-session";
import type { Role } from "@/lib/auth";
import { listMembers, memberHistory } from "@/lib/members-data";
import { listOrgRoles } from "@/lib/org-roles-data";
import { customChoice, roleName, withinReach } from "@/lib/org-roles";
import { changeRole, invite, remove, resend, revoke } from "./actions";
import { Masthead } from "@/components/Masthead";
import { WorkspacePage } from "@/components/layout/Page";

const day = (d: Date) => d.toISOString().slice(0, 10);

/** The roles one may hand out: an owner any, a delegate only those that reach no more than they hold (the server holds them to it too). */
function RoleSelect({ value, label, custom, canGiveOwner, reach }: { value?: string; label: string; custom: { id: string; name: string; grants: Grants }[]; canGiveOwner: boolean; reach: Grants }) {
  const builtIns = INVITE_ROLES.filter((r) => canGiveOwner || (r !== "OWNER" && withinReach(reach, presetGrants(r))));
  const givable = canGiveOwner ? custom : custom.filter((c) => withinReach(reach, c.grants));
  return (
    <label className="space-y-1.5">
      <span className="label">{label}</span>
      <select name="role" className="field" defaultValue={value ?? "RECRUITER"}>
        {/* A role that can no longer be assigned (compliance, an archived custom role) still shows as the current one. */}
        {value && !value.startsWith("custom:") && !(INVITE_ROLES as string[]).includes(value) && <option value={value} disabled>{ROLE_LABELS[value as Role]}</option>}
        {value && value.startsWith("custom:") && !givable.some((c) => customChoice(c.id) === value) && <option value={value} disabled>{custom.find((c) => customChoice(c.id) === value)?.name ?? "Archived role"}</option>}
        {value && INVITE_ROLES.includes(value as BuiltInRole) && !builtIns.includes(value as BuiltInRole) && <option value={value} disabled>{ROLE_LABELS[value as Role]}</option>}
        {builtIns.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        {givable.length > 0 && (
          <optgroup label="Your roles">
            {givable.map((c) => <option key={c.id} value={customChoice(c.id)}>{c.name}</option>)}
          </optgroup>
        )}
      </select>
    </label>
  );
}

/** Owners invite people, change their roles and remove them (C1); a member whose role has the members area does the same within what they hold themselves (M10.6). */
export default async function MembersPage() {
  const session = await requireArea("orgMembers");
  const [{ members, invites }, roles] = await Promise.all([listMembers(session.orgId), listOrgRoles(session.orgId)]);
  const custom = roles.filter((r) => !r.archivedAt);
  const myReach: Grants = session.role === "CUSTOM" ? (session.grants ?? {}) : presetGrants(session.role as BuiltInRole);
  const reachOfMember = (m: { role: Role; orgRoleId: string | null }): Grants => (m.role === "CUSTOM" ? (roles.find((r) => r.id === m.orgRoleId)?.grants ?? {}) : presetGrants(m.role as BuiltInRole));
  // The same limit for a waiting invite: an owner's to any, a delegate's only to a role within their own reach.
  const mayActOnInvite = (i: { role: Role; orgRoleId: string | null }) => session.role === "OWNER" || (i.role !== "OWNER" && withinReach(myReach, reachOfMember(i)));
  // Whether this person is the signed-in member's to change: an owner's to anyone, a delegate's only within their own reach.
  const mayChange = (m: { role: Role; orgRoleId: string | null; profileId: string }) => session.role === "OWNER" || m.profileId === session.userId || (m.role !== "OWNER" && withinReach(myReach, reachOfMember(m)));
  const history = await memberHistory(session.orgId, members.map((m) => m.profileId));
  const canGiveOwner = session.role === "OWNER";
  const choiceOf = (m: { role: Role; orgRoleId: string | null }) => (m.role === "CUSTOM" && m.orgRoleId ? customChoice(m.orgRoleId) : m.role);

  return (
    <WorkspacePage head={<Masthead title="Members">
        <Link href="/org/settings/members/roles" className="btn-secondary btn-sm">Roles</Link>
        <Link href="/org/settings" className="btn-ghost btn-sm">Back to settings</Link>
      </Masthead>}>

      {/* A bounded invite panel (#113 review, P4): the form keeps a reading width; role help sits behind "About roles". */}
      <section className="section form-panel" aria-labelledby="invite-heading">
        <h2 id="invite-heading" className="section-title">Invite someone</h2>
        <ActionButton action={invite} fields={{}} label="Send invite" pendingLabel="Sending…">
          <label className="min-w-56 flex-1 space-y-1.5">
            <span className="label">Email</span>
            <input name="email" type="email" required maxLength={254} autoComplete="off" className="field" placeholder="name@campaign.org" />
          </label>
          <RoleSelect label="Role" custom={custom} canGiveOwner={canGiveOwner} reach={myReach} />
        </ActionButton>
        <p className="text-hint">Someone new joins by opening the link in the email. Anyone who already has a Turfcut login sees the invite after signing in and chooses whether to accept. Invites last 7 days.</p>
        <details className="group">
          <summary className="link cursor-pointer list-none text-sm font-semibold">About roles</summary>
          <ul className="text-hint mt-2 space-y-0.5">
            {INVITE_ROLES.map((r) => <li key={r}><strong>{ROLE_LABELS[r]}:</strong> {ROLE_HELP[r]}</li>)}
          </ul>
        </details>
      </section>

      <section className="section" aria-labelledby="waiting-heading">
        <h2 id="waiting-heading" className="section-title">Waiting to join</h2>
        {invites.length === 0 ? (
          <p className="text-muted-sm">No invitations waiting.</p>
        ) : (
          <ul className="list-card">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    <span className="break-all">{i.email}</span>
                    <span className="tag">{roleName(i, ROLE_LABELS)}</span>
                    {i.expired && <StatusChip state="closed" label="Expired" />}
                  </p>
                  <p className="text-muted-sm">Invited {day(i.createdAt)} · {i.expired ? "expired" : "expires"} {day(i.expiresAt)}</p>
                </div>
                {mayActOnInvite(i) ? (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton action={resend} fields={{ inviteId: i.id }} label="Resend" pendingLabel="Sending…" variant="btn-secondary btn-sm" />
                    <ActionButton action={revoke} fields={{ inviteId: i.id }} label="Revoke" pendingLabel="Revoking…" variant="btn-ghost btn-sm" />
                  </div>
                ) : (
                  <p className="text-muted-sm sm:max-w-48">Only an owner can resend or revoke an invite to a role with more access than yours.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="members-heading">
        <h2 id="members-heading" className="section-title">Members</h2>
        {/* Aligned rows (#113 review, P4): member, role, actions as columns from 1024; stacked, each labelled, on a phone. */}
        <div className="member-row-head" aria-hidden>
          <span>Member</span>
          <span>Role</span>
          <span />
        </div>
        <ul className="list-card" aria-labelledby="members-heading">
          {members.map((m) => {
            const me = m.profileId === session.userId;
            return (
              <li key={m.profileId} className="member-row">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    <span className="break-all">{m.name ?? m.email ?? "Member"}</span>
                    {me && <span className="tag-solid">You</span>}
                    <span className="tag lg:hidden">{roleName(m, ROLE_LABELS)}</span>
                  </p>
                  <p className="text-muted-sm">{[m.name ? m.email : null, `Since ${day(m.since)}`].filter(Boolean).join(" · ")}</p>
                  {(history.get(m.profileId) ?? []).length > 0 && (
                    <details className="group">
                      <summary className="link cursor-pointer list-none text-sm font-semibold">Role history</summary>
                      <ul className="mt-2 space-y-1 text-muted-sm">
                        {(history.get(m.profileId) ?? []).map((h, i) => <li key={i}>{day(h.at)} · {h.text}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
                {mayChange(m) ? (
                  <>
                    <div className="min-w-0">
                      <ActionButton action={changeRole} fields={{ profileId: m.profileId }} label="Change role" pendingLabel="Saving…" variant="btn-secondary btn-sm">
                        <RoleSelect value={choiceOf(m)} label={me ? "Your role" : "Role"} custom={custom} canGiveOwner={canGiveOwner} reach={myReach} />
                      </ActionButton>
                    </div>
                    <details className="group lg:justify-self-end lg:open:col-span-full lg:open:justify-self-stretch">
                      <summary className="link cursor-pointer list-none text-sm font-semibold">{me ? "Leave organization…" : "Remove…"}</summary>
                      <div className="mt-2 max-w-sm space-y-2">
                        <p className="text-muted-sm">
                          {me ? "You'll lose access to the organization right away." : "They lose access to the organization right away."} Their login and everything already recorded stay; conversations they were in stay readable to them up to now, without new messages. An owner can invite them back.
                        </p>
                        <ActionButton action={remove} fields={{ profileId: m.profileId }} label={me ? "Leave" : "Remove"} pendingLabel="Removing…" variant="btn-secondary btn-sm" />
                      </div>
                    </details>
                  </>
                ) : (
                  <>
                    <p className="text-muted-sm"><span className="tag me-2 hidden lg:inline-flex">{roleName(m, ROLE_LABELS)}</span>{m.role === "OWNER" ? "Only an owner can change an owner." : "This member has more access than you do, so only an owner can change them."}</p>
                    <span className="hidden lg:block" />
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-hint">Every invite, role change and removal is recorded in the audit log.</p>
      </section>
    </WorkspacePage>
  );
}
