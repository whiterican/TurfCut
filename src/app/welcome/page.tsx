import { redirect } from "next/navigation";
import { getAuthUser, needsSetup } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/access";
import { pendingInvitesFor } from "@/lib/members-data";
import { ActionButton } from "@/components/ActionButton";
import { acceptFromWelcome } from "./actions";
import { WelcomeForm } from "./WelcomeForm";
import { roleName } from "@/lib/org-roles";
import type { Role } from "@/lib/auth";
import { ReadingPage } from "@/components/layout/Page";

/** A signed-in login with no Turfcut profile yet (see needsSetup). */
export default async function WelcomePage() {
  if (!(await needsSetup())) redirect("/dashboard");
  const user = await getAuthUser();
  const invites = user ? await pendingInvitesFor(user) : [];
  return (
    <ReadingPage gap={4}>
      {invites.length > 0 && (
        <section className="card space-y-3">
          <h2 className="section-title">You&apos;ve been invited</h2>
          <ul className="space-y-3">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-fg">{i.org.name} · {roleName({ role: i.role as Role, roleName: i.orgRole?.name }, ROLE_LABELS)}</p>
                <ActionButton action={acceptFromWelcome} fields={{ inviteId: i.id }} label="Accept" pendingLabel="Joining…" variant="btn-secondary btn-sm" />
              </li>
            ))}
          </ul>
        </section>
      )}
      <WelcomeForm invited={invites.length > 0} />
    </ReadingPage>
  );
}
