import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { loadNotifications } from "@/lib/notifications-data";
import { notificationText } from "@/lib/notification-text";
import { LocalTime } from "@/components/LocalTime";
import { markNotificationsRead } from "./actions";

export const metadata = { title: "Notifications · Turfcut" };

/**
 * The signed-in person's notices (C3.5), newest first. Unread ones are
 * marked until they press "Mark all as read" — opening this page records
 * nothing, and nobody else ever sees whether a notice was read.
 */
export default async function NotificationsPage() {
  const session = await requireAuth();
  const viewer = session.role === "WORKER" ? "worker" : "org";
  const items = await loadNotifications({ userId: session.userId, workerId: session.workerId ?? null, orgId: viewer === "org" ? session.orgId ?? null : null });
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <main className="page max-w-2xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Updates</p>
          <h1 className="page-title">Notifications</h1>
          <p className="text-muted-sm">Hiring steps that concern you. Nobody is told whether you read them.</p>
        </div>
        {unread > 0 && (
          <form action={markNotificationsRead}>
            <button className="btn-secondary btn-sm">Mark all as read</button>
          </form>
        )}
      </header>
      {items.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Nothing yet</p>
          <p className="empty-state-body">Offers, invitations and answers appear here.</p>
        </div>
      ) : (
        <ul className="list-card">
          {items.map((n) => {
            const t = notificationText(n.kind, n.engagement, viewer);
            return (
              <li key={n.id}>
                <Link href={t.href} className="flex items-start gap-3 px-4 py-3 text-fg transition hover:bg-surface-2">
                  <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-solid"}`} />
                  <span className="min-w-0 space-y-0.5">
                    <span className={`block ${n.readAt ? "" : "font-semibold"}`}>
                      {t.text}
                      {!n.readAt && <span className="sr-only"> (unread)</span>}
                    </span>
                    <span className="text-muted-sm block"><LocalTime iso={n.createdAt.toISOString()} /></span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
