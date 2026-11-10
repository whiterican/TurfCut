import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { openThread, teamCandidates } from "@/lib/chat-data";
import { startDirect } from "@/app/messages/actions";
import { Composer, MessageList } from "@/components/chat/Thread";
import { BlockButton, Members } from "@/components/chat/Members";
import { LiveRefresh } from "@/components/chat/LiveRefresh";
import { DayTime } from "@/components/DayTime";
import { ThreadMenu } from "@/components/chat/ThreadMenu";
import { ArrowLeft } from "@/components/chat/icons";
import { ChannelActions } from "@/components/chat/ChannelActions";
import { db } from "@/lib/db";

export const metadata = { title: "Conversation · Turfcut" };

export default async function ThreadPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const session = await requireAuth();
  const me = { userId: session.userId, role: session.role, grants: session.grants, orgId: session.orgId };
  const { conversationId } = await params;
  // Not a participant → the same 404 as a thread that doesn't exist.
  const t = await openThread(me, conversationId);
  if (!t) notFound();

  const group = t.kind !== "DIRECT";
  const channel = t.channel;
  const mine = t.members.find((m) => m.isMe);
  const iManage = !!mine && mine.role !== "WORKER";
  const title = channel ? `#${t.title}` : t.title;
  const count = t.members.filter((m) => !m.removed).length;
  const counterpart = !group ? (t.members.find((m) => !m.isMe && !m.removed) ?? t.members.find((m) => !m.isMe)) : undefined;
  const candidates = t.canManage && !channel?.archived ? await teamCandidates(me, t.jobIds, db(), channel ? { staffOnly: channel.staffOnly } : null) : [];
  const canBlockCounterpart = !group && t.canBlock && !!counterpart && !counterpart.removed && counterpart.role !== "WORKER";
  const firstName = (counterpart?.name ?? "").split(" ")[0];

  return (
    <main className="page max-w-2xl space-y-4">
      <LiveRefresh conversationId={t.id} />
      {/* Header and shift banner stay pinned while the thread scrolls (mockup). */}
      <div className="thread-top">
      <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2">
        <Link transitionTypes={["nav-back"]} href="/messages" className="icon-btn" aria-label="Back to messages">
          <ArrowLeft />
        </Link>
        <div className="min-w-0 text-center">
          <h1 className="truncate text-base font-bold text-fg">{title}</h1>
          <p className="truncate font-mono text-[0.6875rem] tracking-[0.14em] text-subtle uppercase">
            {channel ? `${channel.staffOnly ? "Staff channel" : "Channel"} · ${count} ${count === 1 ? "member" : "members"}` : group ? `Team chat · ${count} members` : t.subtitle || (counterpart && counterpart.role !== "WORKER" ? "Manager" : "Worker")}
          </p>
        </div>
        {group ? (
          <ThreadMenu label="Members and options">
            {channel && (
              <div className="space-y-1 border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-fg">{title}</p>
                <p className="text-sm text-muted">{channel.topic ?? "No topic set."}</p>
                <p className="text-xs text-subtle">
                  {channel.isGeneral ? "Everyone on staff is in this channel." : channel.staffOnly ? "Staff only. Anyone on staff can join." : `Staff, and workers hired on: ${t.subtitle}`}
                </p>
              </div>
            )}
            <Members
              conversationId={t.id}
              members={t.members}
              canManage={t.canManage && !channel?.archived && !channel?.isGeneral}
              canBlock={t.canBlock}
              candidates={candidates}
              bare
              emptyHint={channel ? (channel.staffOnly ? "Everyone on staff is already here." : "Everyone eligible is already here. Workers must be hired on one of this channel's jobs.") : undefined}
            />
            {channel && <ChannelActions conversationId={t.id} name={t.title} canLeave={channel.canLeave} canArchive={channel.canArchive} />}
          </ThreadMenu>
        ) : canBlockCounterpart || t.nextShift ? (
          <ThreadMenu label="Conversation options">
            <div className="space-y-1 p-2">
              <p className="px-2 pt-1 text-xs text-subtle">
                {counterpart?.name}
                {counterpart && counterpart.role !== "WORKER" ? " · Manager" : " · Worker"}
              </p>
              {t.nextShift && (
                <Link transitionTypes={["nav-forward"]} href={`/shifts/${t.nextShift.id}`} className="btn-ghost w-full justify-start">
                  Open shift details
                </Link>
              )}
              {canBlockCounterpart && counterpart && (
                <div className="flex items-center justify-between gap-2 px-2">
                  <span className="text-sm text-muted">Stop their new messages</span>
                  <BlockButton conversationId={t.id} member={counterpart} />
                </div>
              )}
            </div>
          </ThreadMenu>
        ) : (
          <span />
        )}
      </header>

      {t.nextShift && (
        <Link transitionTypes={["nav-forward"]} href={`/shifts/${t.nextShift.id}`} className="shift-banner">
          <span className="block text-sm font-bold">{t.nextShift.active ? "On shift now" : <DayTime iso={t.nextShift.startsAt.toISOString()} />}</span>
          <span className="block text-sm text-muted">{t.nextShift.stagingLocation ? `Check in at ${t.nextShift.stagingLocation}` : "Open shift details"}</span>
        </Link>
      )}
      </div>

      <MessageList
        conversationId={t.id}
        group={group}
        hasOlder={t.hasOlder}
        canPost={t.access.post}
        messages={t.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
      />

      {t.access.post ? (
        <Composer conversationId={t.id} manager={iManage} placeholder={channel ? `Message ${title}…` : group ? "Message the team…" : firstName ? `Message ${firstName}…` : "Write a message…"} />
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
