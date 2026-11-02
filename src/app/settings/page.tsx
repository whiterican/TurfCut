import { cache } from "react";
import { DisplaySettings } from "@/components/DisplaySettings";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/settings/actions";
import { SignOutButton } from "@/components/SignOutButton";
import { AccountData } from "@/components/AccountData";
import Link from "next/link";
import { getSessionProfile, type SessionProfile } from "@/lib/auth";
import { closureFacts } from "@/lib/account-data";
import { closureProblems } from "@/lib/account-closure";
import { Masthead } from "@/components/Masthead";
import { ReadingPage } from "@/components/layout/Page";

/** Signed in, the page holds the account too ("Settings"); signed out, only the display options. Once per request (metadata and page share it). */
const signedInUser = cache(async () => {
  try {
    const { data } = await (await createClient()).auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email } : null;
  } catch {
    return null; // Supabase not configured
  }
});

export async function generateMetadata() {
  return { title: `${(await signedInUser()) ? "Settings" : "Display settings"} · Turfcut` };
}

/** Display settings for everyone (signed in or not): text size and theme. */
export default async function SettingsPage() {
  // Any signed-in Supabase user can sign out — even one whose account setup
  // didn't finish (no profile row yet).
  const session = await signedInUser();
  // Workers get their data and the way out (M7). Organization accounts
  // belong to their organization and aren't closed from here.
  let worker: { problems: string[] } | null = null;
  let me: SessionProfile | null = null;
  if (session) {
    try {
      me = await getSessionProfile();
      if (me?.role === "WORKER" && me.workerId) worker = { problems: closureProblems(await closureFacts(me.workerId)) };
    } catch (e) {
      console.error("[turfcut] loading account closure facts failed", e);
    }
  }
  return (
    <ReadingPage gap={6} head={<Masthead title={session ? "Settings" : "Display settings"} meta="Text size, theme and feel are saved on this device." />}>
      <DisplaySettings />
      {session && (
        <section className="section">
          <h2 className="section-title">Account</h2>
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-sm min-w-0 truncate">
              Signed in{session.email ? <> as <span className="text-fg">{session.email}</span></> : null}
            </p>
            <SignOutButton action={signOut} userId={session.id} />
          </div>
        </section>
      )}
      {/* Turfcut staff (M10): the console lives behind its own gate; this is the one link to it that every role sees. */}
      {me?.staff && (
        <section className="section">
          <h2 className="section-title">Turfcut staff</h2>
          <div className="card flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-sm">You can use the admin console. Everything you do there is recorded with your name and reason.</p>
            <Link href="/admin" className="btn-secondary btn-sm">Open admin</Link>
          </div>
        </section>
      )}
      {/* Last: Your data, then the danger zone (workers only). */}
      {session && worker && <AccountData userId={session.id} problems={worker.problems} />}
    </ReadingPage>
  );
}
