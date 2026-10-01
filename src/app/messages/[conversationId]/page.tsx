import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { openThread, teamCandidates } from "@/lib/chat-data";
import { startDirect } from "@/app/messages/actions";
import { Avatar } from "@/components/chat/Avatar";
import { Composer, MessageList } from "@/components/chat/Thread";
import { BlockButton, Members } from "@/components/chat/Members";
import { LiveRefresh } from "@/components/chat/LiveRefresh";
import { LocalTime } from "@/components/LocalTime";

export const metadata = { title: "Conversation · Turfcut" };

export default async function ThreadPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const session = await requireAuth();
  const me = { userId: session.userId, role: session.role, orgId: session.orgId };
  const { conversationId } = await params;
  // Not a participant → the same 404 as a thread that doesn't exist.
  const t = await openThread(me, conversationId);
  if (!t) notFound();

  const group = t.kind === "GROUP";
  const mine = t.members.find((m) => m.isMe);
  const iManage = mine?.role === "MANAGER";
  const counterpart = !group ? (t.members.find((m) => !m.isMe && !m.removed) ?? t.members.find((m) => !m.isMe)) : undefined;
  const candidates = t.canManage ? await teamCandidates(me, t.jobIds) : [];

  return (
    <main className="page max-w-2xl space-y-4">
      <LiveRefresh conversationId={t.id} />
      <header className="flex items-center gap-3">
        <Link href="/messages" className="btn-ghost btn-sm" aria-label="Back to messages">←</Link>
        <Avatar name={t.title} team={group} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-fg">{t.title}</h1>
          <p className="truncate text-xs text-subtle">
            {group ? "Team chat" : counterpart?.role === "MANAGER" ? "Manager" : "Worker"}
            {t.subtitle && ` · ${t.subtitle}`}
          </p>
        </div>
        {!group && t.canBlock && counterpart && !counterpart.removed && counterpart.role === "MANAGER" && (
          <BlockButton conversationId={t.id} member={counterpart} />
        )}
      </header>

      {t.nextShift && (
        <Link href={`/shifts/${t.nextShift.id}`} className="card flex items-center justify-between gap-3 transition hover:border-[var(--border-strong)]">
          <span className="min-w-0">
            <span className="eyebrow block">{t.nextShift.active ? "On shift now" : "Next shift"}</span>
            <span className="block font-semibold text-fg">
              <LocalTime iso={t.nextShift.startsAt.toISOString()} mode="datetime" /> – <LocalTime iso={t.nextShift.endsAt.toISOString()} mode="time" />
            </span>
            {t.nextShift.stagingLocation && <span className="text-muted-sm block truncate">Staging: {t.nextShift.stagingLocation}</span>}
          </span>
          <span className={t.nextShift.active ? "badge-lime" : "badge-neutral"}>{t.nextShift.active ? "Live" : "Open"}</span>
        </Link>
      )}

      {group && <Members conversationId={t.id} members={t.members} canManage={t.canManage} canBlock={t.canBlock} candidates={candidates} />}

      <MessageList
        conversationId={t.id}
        group={group}
        hasOlder={t.hasOlder}
        canPost={t.access.post}
        messages={t.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      />

      {t.access.post ? (
        <Composer conversationId={t.id} manager={iManage} />
      ) : (
        <div className="card-flat space-y-3" role="status">
          <p className="text-sm font-semibold text-fg">{t.access.closed}</p>
          {t.reopenEngagementId && (
            <form action={startDirect}>
              <input type="hidden" name="engagementId" value={t.reopenEngagementId} />
              <button className="btn-primary btn-sm">Message your current contact</button>
            </form>
          )}
        </div>
      )}
    </main>
  );
}
