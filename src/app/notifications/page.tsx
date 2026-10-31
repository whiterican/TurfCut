import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { loadNotifications, NOTIFICATION_PAGE } from "@/lib/notifications-data";
import { notificationText, orgNoticeText, payNoticeText } from "@/lib/notification-text";
import { postNoticeText } from "@/lib/campaign-follow";
import { loadPostNotices } from "@/lib/campaign-follow-data";
import { LocalTime } from "@/components/LocalTime";
import { markNotificationsRead } from "./actions";
import { EmptyArt } from "@/components/EmptyState";
import { Masthead } from "@/components/Masthead";
import { ReadingPage } from "@/components/layout/Page";
import { ChevronRight } from "lucide-react";

export const metadata = { title: "Notifications · Turfcut" };

/**
 * The signed-in person's notices (C3.5), newest first. Unread ones are
 * marked until they press "Mark all as read" — opening this page records
 * nothing, and nobody else ever sees whether a notice was read.
 */
export default async function NotificationsPage() {
  const session = await requireAuth();
  const viewer = session.role === "WORKER" ? "worker" : "org";
  const [hiring, posts] = await Promise.all([
    loadNotifications({ userId: session.userId, role: session.role, grants: session.grants, workerId: session.workerId ?? null, orgId: session.orgId ?? null }),
    // A worker's notices of followed campaigns' posts (S2.4), loaded by the social layer.
    viewer === "worker" && session.workerId ? loadPostNotices(session.userId, NOTIFICATION_PAGE) : Promise.resolve([]),
  ]);
  // The newest page of both, as one list (each source is already its own newest page).
  const items = [
    ...hiring.map((n) => ({ id: n.id, createdAt: n.createdAt, readAt: n.readAt, t: n.engagement ? notificationText(n.kind, { ...n.engagement, wasOffer: n.engagement.events.length > 0 }, viewer) : n.kind.startsWith("ORG_") ? orgNoticeText(n.kind) : payNoticeText(n.kind, n, viewer) })),
    ...posts.map((n) => ({ id: n.id, createdAt: n.createdAt, readAt: n.readAt, t: n.post ? postNoticeText(n.post) : null })),
  ]
    .filter((n): n is typeof n & { t: NonNullable<typeof n.t> } => !!n.t)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? -1 : 1))
    .slice(0, NOTIFICATION_PAGE);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <ReadingPage
      gap={6}
      head={
        <Masthead title="Notifications" meta={<>{viewer === "worker" ? "Hiring steps, your pay disputes and payouts, and new posts from campaigns you asked to hear from." : "Hiring steps, pay disputes and Turfcut's decisions that concern you."} Nobody is told whether you read them.</>}>
          {unread > 0 && (
            <form action={markNotificationsRead}>
              {/* Only the ones shown here: anything newer stays unread until it's seen. */}
              {items.filter((n) => !n.readAt).map((n) => <input key={n.id} type="hidden" name="id" value={n.id} />)}
              <button className="btn-secondary btn-sm">Mark these as read</button>
            </form>
          )}
        </Masthead>
      }
    >
      {items.length === 0 ? (
        <div className="empty-state">
          <EmptyArt kind="notices" />
          <p className="empty-state-title">Nothing yet</p>
          <p className="empty-state-body">{viewer === "worker" ? "Offers, invitations, answers and posts from campaigns you get notices from appear here." : "Applications, claims and answers appear here."}</p>
        </div>
      ) : (
        // Rows as Messages draws them (#111): white rows with dividers, bold while unread, the time under, a chevron.
        <ul className="thread-list">
          {items.map((n) => {
            const t = n.t;
            return (
              <li key={n.id}>
                <Link href={t.href} className="thread-row">
                  <span aria-hidden className={`legend-dot ${n.readAt ? "opacity-0" : "legend-on"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-base leading-6 text-fg ${n.readAt ? "" : "font-semibold"}`}>
                      {t.text}
                      {!n.readAt && <span className="sr-only"> (unread)</span>}
                    </span>
                    <span className="block text-sm text-subtle"><LocalTime iso={n.createdAt.toISOString()} /></span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-subtle" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ReadingPage>
  );
}
