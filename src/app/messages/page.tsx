import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canCreateGroup } from "@/lib/chat";
import { listOpenReports, listThreads, type ThreadSummary } from "@/lib/chat-data";
import { startDirect } from "@/app/messages/actions";
import { Avatar } from "@/components/chat/Avatar";
import { RelativeTime } from "@/components/RelativeTime";
import { ChatNameForm } from "@/components/chat/ChatNameForm";

export const metadata = { title: "Messages · Turfcut" };

const ERRORS: Record<string, string> = {
  not_hired: "Messages unlock once the hire is confirmed.",
  no_contact: "No one at this organization can be messaged yet.",
  not_found: "That conversation isn't available.",
};

function ThreadRow({ t }: { t: ThreadSummary }) {
  const unread = t.unread > 0;
  return (
    <li>
      <Link transitionTypes={["nav-forward"]} scroll={false} href={`/messages/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
        <Avatar name={t.title} team={t.kind === "GROUP"} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className={`truncate text-fg ${unread ? "font-bold" : "font-semibold"}`}>{t.title}</span>
            {t.last && (
              <span className="shrink-0 text-xs text-subtle">
                <RelativeTime iso={t.last.at.toISOString()} />
              </span>
            )}
          </span>
          {t.subtitle && <span className="block truncate text-xs text-subtle">{t.subtitle}</span>}
          <span className="mt-0.5 flex items-center justify-between gap-3">
            <span className={`truncate text-sm ${unread ? "font-semibold text-fg" : "text-muted"}`}>
              {t.last ? `${t.last.mine ? "You: " : ""}${t.last.text}` : "No messages yet"}
            </span>
            {unread ? (
              <span className="unread-badge"><span aria-hidden>{t.unread > 99 ? "99+" : t.unread}</span><span className="sr-only"> unread: {t.unread}</span></span>
            ) : t.frozen ? (
              <span className="badge-neutral shrink-0">Read-only</span>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireAuth();
  const me = { userId: session.userId, role: session.role, orgId: session.orgId };
  const error = ERRORS[(await searchParams).error ?? ""];
  const staff = canCreateGroup(me).ok;
  const [{ threads, startable }, reports, profile] = await Promise.all([
    listThreads(me),
    session.role === "OWNER" ? listOpenReports(me) : Promise.resolve([]),
    staff ? db().profile.findUnique({ where: { id: me.userId }, select: { displayName: true } }) : Promise.resolve(null),
  ]);

  return (
    <main className="page max-w-2xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Messages</p>
          <h1 className="page-title">Messages</h1>
          <p className="text-muted-sm">
            {session.role === "WORKER"
              ? "Talk with the people who hired you, and your team. Messages open once you're hired."
              : "Talk with the workers you hired, and run team chats for your campaigns."}
          </p>
        </div>
        {staff && (
          <div className="flex flex-wrap gap-2">
            {session.role === "OWNER" && (
              <Link transitionTypes={["nav-forward"]} href="/messages/reports" className="btn-secondary">
                Reports{reports.length > 0 && <span className="unread-badge">{reports.length}</span>}
              </Link>
            )}
            <Link transitionTypes={["nav-forward"]} href="/messages/new" className="btn-primary">New team chat</Link>
          </div>
        )}
      </header>

      {error && <p role="alert" className="alert alert-warning">{error}</p>}

      {staff && !profile?.displayName && (
        <section className="card space-y-2">
          <h2 className="font-bold text-fg">Add your name for chat</h2>
          <p className="text-muted-sm">Workers see this next to your messages. Until you add one, they see your role.</p>
          <ChatNameForm current="" />
        </section>
      )}

      {startable.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">Start a conversation</h2>
          <ul className="list-card">
            {startable.map((s) => (
              <li key={s.engagementId}>
                <form action={startDirect} className="flex items-center gap-3 px-4 py-3">
                  <input type="hidden" name="engagementId" value={s.engagementId} />
                  <Avatar name={s.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-fg">{s.name}</span>
                    <span className="block truncate text-xs text-subtle">{s.jobTitle}</span>
                  </span>
                  <button className="btn-secondary btn-sm">Message</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {threads.length === 0 ? (
        startable.length === 0 && (
          <div className="empty-state">
            <p className="empty-state-title">No conversations yet</p>
            <p className="empty-state-body">
              {session.role === "WORKER"
                ? "Once you're hired for a job, you can message the person who hired you, and your team's chat shows up here."
                : "Once you hire workers, you can message them here — or start a team chat for a campaign."}
            </p>
            {session.role === "WORKER" ? (
              <Link href="/jobs" className="btn-primary mt-4">Find work</Link>
            ) : (
              staff && <Link transitionTypes={["nav-forward"]} href="/messages/new" className="btn-primary mt-4">New team chat</Link>
            )}
          </div>
        )
      ) : (
        <section className="space-y-3">
          {startable.length > 0 && <h2 className="section-title">Conversations</h2>}
          <ul className="list-card">
            {threads.map((t) => <ThreadRow key={t.id} t={t} />)}
          </ul>
        </section>
      )}
    </main>
  );
}
