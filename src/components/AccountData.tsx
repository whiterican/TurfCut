"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { CLOSE_PHRASE, confirmed } from "@/lib/account-closure";
import { clearUser, subscribe, unsentCount } from "@/lib/offline-queue";

/**
 * "Your data" on Settings (M7): download everything, and close the account
 * in two steps. The blockers come from the server; the phone adds its own
 * unsynced entries so nothing recorded offline is lost.
 */
export function AccountData({ userId, problems }: { userId: string; problems: string[] }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string[] | null>(null);
  const router = useRouter();
  const unsynced = useSyncExternalStore(subscribe, () => unsentCount(userId), () => 0);
  const blockers = [...problems, ...(unsynced ? [`${unsynced} field ${unsynced === 1 ? "entry hasn't" : "entries haven't"} synced from this phone. Open the shift with signal and let it sync first.`] : [])];

  async function close() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: typed, unsyncedEntries: unsentCount(userId) }) });
      const data = (await res.json().catch(() => ({}))) as { problems?: string[]; error?: string };
      if (!res.ok) {
        setError(data.problems ?? [data.error ?? "Something went wrong. Try again."]);
        setBusy(false);
        return;
      }
      clearUser(userId);
      router.push("/login?closed=1");
      router.refresh();
    } catch {
      setError(["No connection. Try again with signal."]);
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <h2 className="section-title">Your data</h2>
      <div className="card space-y-3">
        <p className="text-muted-sm">Everything Turfcut holds about you — profile, experience, consent history, shifts, pay, disputes and the messages you sent — as a ZIP of JSON and CSV files.</p>
        <a href="/api/account/export" className="btn-secondary btn-sm inline-block" download>Download my data</a>
      </div>
      <div className="card space-y-3">
        <h3 className="font-semibold">Close my account</h3>
        <p className="text-muted-sm">
          Your login is removed and your name and phone are replaced with &ldquo;Former worker&rdquo;. Your work history, pay records and consent history stay as they were recorded — Turfcut never rewrites its ledger. Download your data first. Any shifts you haven&apos;t started are cancelled; that never counts as a no-show.
        </p>
        {blockers.length > 0 ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold">Before you can close:</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </div>
        ) : !open ? (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>Close my account…</button>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="label">Type <span className="font-mono">{CLOSE_PHRASE}</span> to confirm</span>
              <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary btn-sm" disabled={!confirmed(typed) || busy} onClick={close}>{busy ? "Closing…" : "Close my account for good"}</button>
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => { setOpen(false); setTyped(""); setError(null); }}>Keep my account</button>
            </div>
            {error && (
              <ul role="alert" className="text-danger-msg list-disc space-y-1 pl-5 text-sm">
                {error.map((b) => <li key={b}>{b}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
