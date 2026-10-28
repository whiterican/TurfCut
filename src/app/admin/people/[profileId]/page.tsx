import { StatusGlyph } from "@/components/StatusBadge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/staff-session";
import { ROLE_LABELS } from "@/lib/access";
import { UUID_RE } from "@/lib/jobs";
import { loadPerson } from "@/lib/admin-people-data";
import { PersonActionForm } from "@/components/admin/PersonActionForm";
import { LocalTime } from "@/components/LocalTime";

const WORDS: Record<string, string> = {
  "member.joined": "Joined",
  "member.role_changed": "Role changed",
  "member.removed": "Removed",
  "account.created": "Account created",
  "account.closed": "Account closed",
  "account.login_delete_failed": "Account closed, but the login could not be deleted",
  "member.removed_for_org": "Removed from the organization",
  "invite.resent_for_org": "Invite resent",
};

/** One account for support (M10.4): the basics, membership, pending invites, the two support actions, and the history. */
export default async function AdminPersonPage({ params }: { params: Promise<{ profileId: string }> }) {
  await requireStaff();
  const { profileId } = await params;
  if (!UUID_RE.test(profileId)) notFound();
  const p = await loadPerson(profileId);
  if (!p) notFound();
  const member = p.role !== "WORKER" && !!p.org && !p.closedAt;
  // The owner's rule: an invite is only ever accepted by an account with no organization, no worker role and not closed.
  const canAccept = p.role !== "WORKER" && !p.org && !p.closedAt;
  const cannotAcceptWhy = p.closedAt ? "the account is closed" : p.role === "WORKER" ? "it belongs to a field worker" : p.org ? `it is already a member of ${p.org.name}` : null;
  return (
    <>
      <p>
        <Link transitionTypes={["nav-back"]} href="/admin/people" className="link text-sm">People</Link>
      </p>
      <header className="space-y-2">
        <h2 className="page-title">{p.name ?? "No name yet"}</h2>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="tag">{ROLE_LABELS[p.role]}</span>
          {p.staff && <span className="tag-accent">Turfcut staff</span>}
          {p.closedAt && <span className="status status-closed"><StatusGlyph state="closed" />Closed <LocalTime iso={p.closedAt.toISOString()} mode="fulldate" /></span>}
          <span>since <LocalTime iso={p.createdAt.toISOString()} mode="fulldate" /></span>
        </p>
      </header>

      <section className="section" aria-labelledby="basics">
        <h3 id="basics" className="section-title">Account</h3>
        <dl className="card grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="eyebrow eyebrow-quiet">Sign-in email</dt>
            <dd className="text-sm text-fg">{p.email ?? "No login on file"}</dd>
          </div>
          <div>
            <dt className="eyebrow eyebrow-quiet">Account id</dt>
            <dd className="font-mono text-xs text-fg break-all">{p.profileId}</dd>
          </div>
          <div>
            <dt className="eyebrow eyebrow-quiet">Organization</dt>
            <dd className="text-sm text-fg">
              {p.org ? <><Link href={`/admin/organizations/${p.org.id}`} className="link">{p.org.name}</Link>{p.org.standing === "awaiting" ? " · awaiting approval" : p.org.standing === "withdrawn" ? " · approval withdrawn" : ""}</> : p.role === "WORKER" ? "Field worker; no organization" : "None (removed, or never joined)"}
            </dd>
          </div>
          <div>
            <dt className="eyebrow eyebrow-quiet">What this page never shows</dt>
            <dd className="text-sm text-muted">What a worker shares with organizations, their political-fit answers, their scorecard, their messages.</dd>
          </div>
        </dl>
      </section>

      <section className="section" aria-labelledby="invites">
        <h3 id="invites" className="section-title">Pending invites</h3>
        {p.invites.length === 0 ? (
          <p className="text-muted-sm">None.</p>
        ) : (
          <ul className="list-card">
            {p.invites.map((i) => (
              <li key={i.id} className="space-y-3 px-4 py-3">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-fg">{i.orgName} · {ROLE_LABELS[i.role]}</span>
                  <span className="text-xs text-subtle">{i.expired ? "expired" : "expires"} <LocalTime iso={i.expiresAt.toISOString()} mode="fulldate" /></span>
                </p>
                {canAccept ? (
                  <PersonActionForm kind="resend" fields={{ inviteId: i.id, profileId: p.profileId }} label="Resend this invite" prompt="Why resend it" />
                ) : (
                  <p className="text-muted-sm">This account can&apos;t accept it ({cannotAcceptWhy}), so there is nothing to resend; the organization&apos;s owner sees only a pending invite.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {member && p.org && (
        <section className="section" aria-labelledby="remove">
          <h3 id="remove" className="section-title">Remove from {p.org.name}</h3>
          <div className="card space-y-3">
            <p className="text-muted-sm">The same rules as the owner&apos;s: the last owner stays; the login, role and history stay; access to the organization ends.</p>
            <PersonActionForm kind="remove" fields={{ profileId: p.profileId }} label="Remove from the organization" prompt="Why remove them" />
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="history">
        <h3 id="history" className="section-title">Membership and account history</h3>
        {p.history.length === 0 ? (
          <p className="text-muted-sm">Nothing recorded.</p>
        ) : (
          <ul className="list-card">
            {p.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3">
                <span className="text-sm text-fg">{WORDS[h.action] ?? h.action}{h.orgName ? <span className="text-muted"> · {h.orgName}</span> : null}{h.detail ? <span className="text-muted"> · {h.detail}</span> : null}</span>
                <span className="text-xs text-subtle"><LocalTime iso={h.createdAt.toISOString()} mode="full" /></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="ledger">
        <h3 id="ledger" className="section-title">Turfcut&apos;s acts on this account</h3>
        {p.ledger.length === 0 ? (
          <p className="text-muted-sm">None.</p>
        ) : (
          <ul className="list-card">
            {p.ledger.map((l) => (
              <li key={l.id} className="space-y-1 px-4 py-3">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-fg">{WORDS[l.action] ?? l.action}</span>
                  <span className="text-xs text-subtle"><LocalTime iso={l.createdAt.toISOString()} mode="full" /></span>
                </p>
                <p className="text-sm text-muted">{l.staffName}</p>
                <p className="text-sm text-fg">{l.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
