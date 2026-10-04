import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { INVITE_ROLES, ROLE_HELP, ROLE_LABELS } from "@/lib/access";
import { requireArea } from "@/lib/employer-session";
import { listMembers } from "@/lib/members-data";
import { changeRole, invite, remove, resend, revoke } from "./actions";

const day = (d: Date) => d.toISOString().slice(0, 10);

function RoleSelect({ value, label }: { value?: string; label: string }) {
  return (
    <label className="space-y-1.5">
      <span className="label">{label}</span>
      <select name="role" className="field" defaultValue={value ?? "RECRUITER"}>
        {INVITE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </select>
    </label>
  );
}

/** Owners invite people, change their roles and remove them (C1). */
export default async function MembersPage() {
  const session = await requireArea("orgMembers");
  const { members, invites } = await listMembers(session.orgId);

  return (
    <main className="page max-w-3xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Organization settings</p>
          <h1 className="page-title">Members</h1>
        </div>
        <Link href="/org/settings" className="btn-ghost btn-sm">Back to settings</Link>
      </header>

      <section className="section">
        <h2 className="section-title">Invite someone</h2>
        <ActionButton action={invite} fields={{}} label="Send invite" pendingLabel="Sending…">
          <label className="min-w-56 flex-1 space-y-1.5">
            <span className="label">Email</span>
            <input name="email" type="email" required maxLength={254} autoComplete="off" className="field" placeholder="name@campaign.org" />
          </label>
          <RoleSelect label="Role" />
        </ActionButton>
        <ul className="text-hint space-y-0.5">
          {INVITE_ROLES.map((r) => <li key={r}><strong>{ROLE_LABELS[r]}:</strong> {ROLE_HELP[r]}</li>)}
        </ul>
        <p className="text-hint">They join when they open the link and sign in with that email. Invites last 7 days.</p>
      </section>

      {invites.length > 0 && (
        <section className="section">
          <h2 className="section-title">Waiting to join</h2>
          <ul className="list-card">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    <span className="break-all">{i.email}</span>
                    <span className="badge-neutral">{ROLE_LABELS[i.role]}</span>
                    {i.expired && <span className="badge-butter">Expired</span>}
                  </p>
                  <p className="text-muted-sm">Invited {day(i.createdAt)} · {i.expired ? "expired" : "expires"} {day(i.expiresAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton action={resend} fields={{ inviteId: i.id }} label="Resend" pendingLabel="Sending…" variant="btn-secondary btn-sm" />
                  <ActionButton action={revoke} fields={{ inviteId: i.id }} label="Revoke" pendingLabel="Revoking…" variant="btn-ghost btn-sm" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Members</h2>
        <ul className="list-card">
          {members.map((m) => {
            const me = m.profileId === session.userId;
            return (
              <li key={m.profileId} className="space-y-3 px-4 py-4">
                <div className="space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                    <span className="break-all">{m.name ?? m.email ?? "Member"}</span>
                    {me && <span className="badge-plum">You</span>}
                    <span className="badge-neutral">{ROLE_LABELS[m.role]}</span>
                  </p>
                  <p className="text-muted-sm">{[m.name ? m.email : null, `Since ${day(m.since)}`].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <ActionButton action={changeRole} fields={{ profileId: m.profileId }} label="Change role" pendingLabel="Saving…" variant="btn-secondary btn-sm">
                    <RoleSelect value={m.role} label={me ? "Your role" : "Role"} />
                  </ActionButton>
                  <details className="group">
                    <summary className="link cursor-pointer list-none text-sm font-semibold">{me ? "Leave organization…" : "Remove…"}</summary>
                    <div className="mt-2 space-y-2">
                      <p className="text-muted-sm">
                        {me ? "You'll lose access right away." : "They lose access right away."} Their login and everything already recorded stay. An owner can invite them back.
                      </p>
                      <ActionButton action={remove} fields={{ profileId: m.profileId }} label={me ? "Leave" : "Remove"} pendingLabel="Removing…" variant="btn-secondary btn-sm" />
                    </div>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-hint">Every invite, role change and removal is recorded in the audit log.</p>
      </section>
    </main>
  );
}
