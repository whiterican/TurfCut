import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { payText } from "@/lib/jobs";
import { loadInvitations, loadMutes } from "@/lib/invitations-data";
import { INVITE_DAYS } from "@/lib/engagements";
import { ActionButton } from "@/components/ActionButton";
import { acceptInvitation, declineAsWorker, mute, unmute } from "../actions";
import { LocalTime } from "@/components/LocalTime";

export const metadata = { title: "Invitations · Turfcut" };

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—");

/** "about 3 days left", "less than a day left": readable in any time zone. */
const left = (until: Date, now: Date) => {
  const ms = until.getTime() - now.getTime();
  if (ms < 86_400_000) return "less than a day left";
  const days = Math.round(ms / 86_400_000);
  return `about ${days} ${days === 1 ? "day" : "days"} left`;
};

/**
 * The worker's invitations (C3.3): each with the organization's note and
 * its deadline, to accept, decline, or decline and mute the organization.
 * Opening this page tells the organization nothing (no read receipts).
 */
export default async function InvitationsPage() {
  const session = await requireAuth();
  if (session.role !== "WORKER" || !session.workerId) redirect("/jobs");
  const workerId = session.workerId;
  const now = new Date();
  // loadInvitations already leaves out jobs the worker's own do-not-match answers rule out.
  const [invitations, mutes] = await Promise.all([loadInvitations(workerId, now), loadMutes(workerId)]);
  const muted = new Set(mutes.map((m) => m.orgId));
  const open = invitations.filter((i) => !i.lapsed);
  const lapsed = invitations.filter((i) => i.lapsed);

  return (
    <main className="page max-w-2xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Work</p>
          <h1 className="page-title">Invitations</h1>
          <p className="text-muted-sm">
            Organizations you&apos;ve worked or applied with can invite you to a job. Each invitation lasts {INVITE_DAYS} days. They can&apos;t see whether you&apos;ve opened it.
          </p>
        </div>
        <Link transitionTypes={["nav-back"]} href="/jobs" className="btn-ghost">← Jobs</Link>
      </header>

      {open.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No invitations waiting</p>
          <p className="empty-state-body">When an organization invites you, it shows here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {open.map((i) => {
            const fields = { jobId: i.job.id, engagementId: i.id };
            return (
              <li key={i.id} className="card space-y-3">
                <div className="space-y-1">
                  <p className="text-muted-sm">{i.job.org.name}</p>
                  <Link href={`/jobs/${i.job.id}`} className="link text-lg font-semibold">{i.job.title}</Link>
                  <p className="text-sm text-fg">
                    {i.job.type === "PETITION" ? "Petition" : "Canvass"} · {day(i.job.startsAt)} – {day(i.job.endsAt)} · {payText(i.job.compensationMethod, i.job.payRateCents)}
                  </p>
                </div>
                {i.inviteNote && <p className="whitespace-pre-line rounded-xl bg-surface-2 p-3 text-sm text-fg">&ldquo;{i.inviteNote}&rdquo;</p>}
                {i.inviteExpiresAt && <p className="text-muted-sm">Answer by <LocalTime iso={i.inviteExpiresAt.toISOString()} /> ({left(i.inviteExpiresAt, now)}).</p>}
                <div className="flex flex-wrap items-start gap-2">
                  <ActionButton action={acceptInvitation} fields={fields} label="Accept" pendingLabel="Accepting…" />
                  <ActionButton
                    action={declineAsWorker}
                    fields={fields}
                    label="Decline"
                    pendingLabel="Declining…"
                    variant="btn-ghost"
                    confirm={{ text: "Decline this invitation? You can't apply to or be invited to this job again afterwards.", label: "Yes, decline" }}
                  />
                  <ActionButton
                    action={declineAsWorker}
                    fields={{ ...fields, mute: "1" }}
                    label={`Decline and mute ${i.job.org.name}`}
                    pendingLabel="Declining…"
                    variant="btn-ghost"
                    confirm={{
                      text: `Decline, and stop ${i.job.org.name} from inviting you again? Their jobs still show in your feed, and you can unmute them below. We don't tell them, though they may notice their invitations don't go through.`,
                      label: "Yes, decline and mute",
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lapsed.length > 0 && (
        <section className="section">
          <h2 className="section-title">Expired</h2>
          <ul className="list-card">
            {lapsed.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="space-y-0.5">
                  <Link href={`/jobs/${i.job.id}`} className="link block">{i.job.title}</Link>
                  <span className="text-muted block">{i.job.org.name} · {i.job.status === "CLOSED" ? "job closed" : `expired ${day(i.inviteExpiresAt)}`}</span>
                </span>
                {!muted.has(i.job.org.id) && (
                  <ActionButton action={mute} fields={{ orgId: i.job.org.id }} label={`Mute ${i.job.org.name}`} pendingLabel="Muting…" variant="btn-ghost btn-sm" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Muted organizations</h2>
        <p className="text-muted-sm">
          A muted organization can&apos;t invite you. To keep its jobs out of your feed too, add it to{" "}
          <Link href="/profile/preferences" className="link">who you don&apos;t want to be matched with</Link>.
        </p>
        {mutes.length === 0 ? (
          <p className="text-muted-sm">None.</p>
        ) : (
          <ul className="list-card">
            {mutes.map((m) => (
              <li key={m.orgId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="text-fg">{m.org.name}</span>
                <ActionButton action={unmute} fields={{ orgId: m.orgId }} label="Unmute" pendingLabel="Unmuting…" variant="btn-ghost btn-sm" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
