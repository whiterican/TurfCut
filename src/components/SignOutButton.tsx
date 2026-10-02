"use client";

import { clearUser, unsentCount } from "@/lib/offline-queue";
import { forgetSavedPages } from "@/components/OfflineBrief";

/**
 * Sign out, and make the phone forget this person: their field actions
 * waiting to sync and the shift pages saved for offline use. Warns first if
 * any of their entries haven't synced yet. (Another worker's unsynced
 * entries on a shared phone stay for when they sign in again.)
 */
export function SignOutButton({ action, userId }: { action: () => Promise<void>; userId: string }) {
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const waiting = unsentCount(userId);
    if (waiting && !confirm(`${waiting} field ${waiting === 1 ? "entry hasn't" : "entries haven't"} synced yet. Signing out deletes ${waiting === 1 ? "it" : "them"} from this phone. Sign out anyway?`)) {
      e.preventDefault();
      return;
    }
    clearUser(userId);
    forgetSavedPages();
    if ("caches" in window) void caches.keys().then((ks) => ks.filter((k) => k.startsWith("turfcut-")).forEach((k) => void caches.delete(k)));
  }
  return (
    <form action={action} onSubmit={onSubmit}>
      <button type="submit" className="btn-secondary">Sign out</button>
    </form>
  );
}
