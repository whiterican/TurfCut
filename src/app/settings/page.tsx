import { DisplaySettings } from "@/components/DisplaySettings";
import { getSessionProfile } from "@/lib/auth";
import { signOut } from "@/app/settings/actions";

export const metadata = { title: "Display settings · Turfcut" };

/** Display settings for everyone (signed in or not): text size and theme. */
export default async function SettingsPage() {
  const session = await getSessionProfile();
  return (
    <main className="page max-w-2xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Settings</p>
          <h1 className="page-title">Text size, theme and feel</h1>
          <p className="text-muted-sm">Make Turfcut easier to read and use on your phone.</p>
        </div>
      </header>
      <DisplaySettings />
      {session && (
        <section className="section">
          <h2 className="section-title">Account</h2>
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-sm min-w-0 truncate">
              Signed in{session.email ? <> as <span className="text-fg">{session.email}</span></> : null}
            </p>
            <form action={signOut}>
              <button type="submit" className="btn-secondary">Sign out</button>
            </form>
          </div>
        </section>
      )}
    </main>
  );
}
