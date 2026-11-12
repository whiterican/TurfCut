import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { openReplies, type ThreadMessage } from "@/lib/chat-data";
import { Composer, MessageList } from "@/components/chat/Thread";
import { LiveRefresh } from "@/components/chat/LiveRefresh";
import { ArrowLeft } from "@/components/chat/icons";

export const metadata = { title: "Thread · Turfcut" };

const client = (m: ThreadMessage) => ({ ...m, createdAt: m.createdAt.toISOString(), lastReplyAt: m.lastReplyAt?.toISOString() ?? null });

/** One message and the replies under it. Open to whoever can open the conversation; anyone else gets the same 404 as a thread that doesn't exist. */
export default async function RepliesPage({ params }: { params: Promise<{ conversationId: string; messageId: string }> }) {
  const session = await requireAuth();
  const me = { userId: session.userId, role: session.role, grants: session.grants, orgId: session.orgId };
  const { conversationId, messageId } = await params;
  const t = await openReplies(me, conversationId, messageId);
  if (!t) notFound();
  const group = t.kind === "GROUP" || t.kind === "CHANNEL";
  return (
    <main className="page max-w-2xl space-y-4">
      <LiveRefresh conversationId={t.conversationId} />
      <div className="thread-top">
        <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2">
          <Link transitionTypes={["nav-back"]} href={`/messages/${t.conversationId}`} className="icon-btn" aria-label={`Back to ${t.title}`}>
            <ArrowLeft />
          </Link>
          <div className="min-w-0 text-center">
            <h1 className="truncate text-base font-bold text-fg">Thread</h1>
            <p className="truncate font-mono text-[0.6875rem] tracking-[0.14em] text-subtle uppercase">{t.title}</p>
          </div>
          <span />
        </header>
      </div>

      {/* The message being answered, then its replies. */}
      <MessageList conversationId={t.conversationId} group={group} hasOlder={false} canPost={false} threadId={messageId} messages={[client(t.parent)]} />
      <p className="thread-divider">{t.replies.length === 0 ? "No replies yet" : `${t.replies.length}${t.hasOlder ? "+" : ""} ${t.replies.length === 1 ? "reply" : "replies"}`}</p>
      <MessageList conversationId={t.conversationId} group={group} hasOlder={t.hasOlder} canPost={t.access.post} threadId={messageId} messages={t.replies.map(client)} emptyText={t.access.post ? "Be the first to reply." : "Nobody replied."} />

      {t.access.post ? (
        <Composer conversationId={t.conversationId} manager={t.staff} placeholder="Reply in thread…" parentId={messageId} people={t.mentionable} />
      ) : (
        <div className="card-flat" role="status">
          <p className="text-sm font-semibold text-fg">{t.access.closed}</p>
        </div>
      )}
    </main>
  );
}
