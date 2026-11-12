import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Hash, Lock, Plus } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { browseChannels, colleagues, ensureGeneral } from "@/lib/chat-data";
import { canManageChannels } from "@/lib/chat";
import { joinChannel, startStaffDm } from "@/app/messages/actions";
import { Avatar } from "@/components/chat/Avatar";
import { ListPage } from "@/components/layout/Page";
import { Masthead } from "@/components/Masthead";

export const metadata = { title: "Channels and people · Turfcut" };

/** Every live channel in the organization, for staff: open the ones you are in, join the others. Workers have no list to browse. */
export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireAuth();
  const me = { userId: session.userId, role: session.role, grants: session.grants, orgId: session.orgId };
  if (me.role === "WORKER" || !me.orgId) redirect("/messages");
  await ensureGeneral(me);
  const [channels, people] = await Promise.all([browseChannels(me), colleagues(me)]);
  const error = (await searchParams).error;
  const failed = error === "join";
  return (
    <ListPage gap={4}>
      <Link transitionTypes={["nav-back"]} href="/messages" className="link inline-flex items-center gap-1 text-sm"><ChevronLeft aria-hidden className="size-4 shrink-0" />Messages</Link>
      <Masthead title="Channels and people">
        {canManageChannels(me).ok && (
          <Link transitionTypes={["nav-forward"]} href="/messages/channels/new" className="btn-primary btn-sm"><Plus aria-hidden className="btn-icon" />New channel</Link>
        )}
      </Masthead>
      {failed && <p role="alert" className="alert alert-warning">That channel isn&apos;t available to join.</p>}
      {error === "person" && <p role="alert" className="alert alert-warning">That person isn&apos;t on your organization&apos;s staff.</p>}
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

      {/* One to one with anyone on staff, whatever either person's role. Workers are messaged through their hire, from Messages. */}
      <section className="space-y-3">
        <h2 className="section-title">People</h2>
        {people.length === 0 ? (
          <p className="text-muted-sm">Nobody else is on your staff yet. Invite people from Members.</p>
        ) : (
          <ul className="list-card">
            {people.map((c) => (
              <li key={c.profileId} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={c.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-fg">{c.name}</span>
                  <span className="block truncate text-xs text-subtle">{c.role}</span>
                </span>
                {c.conversationId ? (
                  <Link transitionTypes={["nav-forward"]} href={`/messages/${c.conversationId}`} className="btn-secondary btn-sm">Open</Link>
                ) : (
                  <form action={startStaffDm}>
                    <input type="hidden" name="profileId" value={c.profileId} />
                    <button className="btn-secondary btn-sm">Message</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </ListPage>
  );
}
