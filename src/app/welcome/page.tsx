import { redirect } from "next/navigation";
import { getAuthUser, needsSetup } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/access";
import { pendingInvitesFor } from "@/lib/members-data";
import { ActionButton } from "@/components/ActionButton";
import { acceptFromWelcome } from "./actions";
import { WelcomeForm } from "./WelcomeForm";

/** A signed-in login with no Turfcut profile yet (see needsSetup). */
export default async function WelcomePage() {
  if (!(await needsSetup())) redirect("/dashboard");
  const user = await getAuthUser();
  const invites = user ? await pendingInvitesFor(user) : [];
  return (
    <main className="page-narrow flex flex-1 flex-col justify-center gap-4">
      {invites.length > 0 && (
        <section className="card space-y-3">
          <h2 className="section-title">You&apos;ve been invited</h2>
          <ul className="space-y-3">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-fg">{i.org.name} · {ROLE_LABELS[i.role] ?? i.role}</p>
                <ActionButton action={acceptFromWelcome} fields={{ inviteId: i.id }} label="Accept" pendingLabel="Joining…" variant="btn-primary btn-sm" />
              </li>
            ))}
          </ul>
        </section>
      )}
      <WelcomeForm invited={invites.length > 0} />
    </main>
  );
}
