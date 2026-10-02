"use client";

import { clearAll } from "@/lib/offline-queue";

/**
 * Sign out, and make the phone forget this person: field actions waiting to
 * sync and the shift pages saved for offline use. Warns first if anything
 * hasn't synced yet.
 */
export function SignOutButton({ action }: { action: () => Promise<void> }) {
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    let waiting = 0;
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("turfcut-queue:")) waiting += (JSON.parse(localStorage.getItem(k) ?? "[]") as unknown[]).length;
      }
    } catch {
      // nothing stored
    }
    if (waiting && !confirm(`${waiting} field ${waiting === 1 ? "entry hasn't" : "entries haven't"} synced yet. Signing out deletes ${waiting === 1 ? "it" : "them"} from this phone. Sign out anyway?`)) {
      e.preventDefault();
      return;
    }
    clearAll();
    if ("caches" in window) void caches.keys().then((ks) => ks.filter((k) => k.startsWith("turfcut-")).forEach((k) => void caches.delete(k)));
  }
  return (
    <form action={action} onSubmit={onSubmit}>
      <button type="submit" className="btn-secondary">Sign out</button>
    </form>
  );
}
