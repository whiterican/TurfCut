import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Hash, Lock, Plus } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { browseChannels, ensureGeneral } from "@/lib/chat-data";
import { canManageChannels } from "@/lib/chat";
import { joinChannel } from "@/app/messages/actions";
import { ListPage } from "@/components/layout/Page";
import { Masthead } from "@/components/Masthead";

export const metadata = { title: "Channels · Turfcut" };

/** Every live channel in the organization, for staff: open the ones you are in, join the others. Workers have no list to browse. */
export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireAuth();
  const me = { userId: session.userId, role: session.role, grants: session.grants, orgId: session.orgId };
  if (me.role === "WORKER" || !me.orgId) redirect("/messages");
  await ensureGeneral(me);
  const channels = await browseChannels(me);
  const failed = (await searchParams).error === "join";
  return (
    <ListPage gap={4}>
      <Link transitionTypes={["nav-back"]} href="/messages" className="link inline-flex items-center gap-1 text-sm"><ChevronLeft aria-hidden className="size-4 shrink-0" />Messages</Link>
      <Masthead title="Channels">
        {canManageChannels(me).ok && (
          <Link transitionTypes={["nav-forward"]} href="/messages/channels/new" className="btn-primary btn-sm"><Plus aria-hidden className="btn-icon" />New channel</Link>
        )}
      </Masthead>
      {failed && <p role="alert" className="alert alert-warning">That channel isn&apos;t available to join.</p>}
      <ul className="list-card">
        {channels.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3">
            <span aria-hidden className="avatar avatar-team">{c.staffOnly ? <Lock className="size-4" /> : <Hash className="size-4" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-fg">#{c.name}</span>
              <span className="block truncate text-sm text-muted">{c.topic ?? (c.staffOnly ? "Staff only" : "Staff and hired workers")}</span>
              <span className="block text-xs text-subtle">
                {c.members} {c.members === 1 ? "member" : "members"} · {c.staffOnly ? "Staff only" : "Staff and hired workers"}
              </span>
            </span>
            {c.joined ? (
              <Link transitionTypes={["nav-forward"]} href={`/messages/${c.id}`} className="btn-secondary btn-sm">Open</Link>
            ) : (
              <form action={joinChannel}>
                <input type="hidden" name="conversationId" value={c.id} />
                <button className="btn-primary btn-sm">Join</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </ListPage>
  );
}
