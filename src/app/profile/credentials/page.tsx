import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadCredentials } from "@/lib/credentials-data";
import { loadSharing } from "@/lib/sharing-data";
import { AUDIENCE_OPTIONS } from "@/lib/sharing";
import { credentialName, dateOnly, expiryState, expiryToday, maskIdentifier, VERIFICATION_LABELS } from "@/lib/credentials";
import { CredentialForm, RemoveCredential, WalletStatus, WalletStatusLine } from "@/components/CredentialForm";

const dateText = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function CredentialsPage() {
  const { workerId } = await requireWorker();
  const [creds, sharing] = await Promise.all([loadCredentials(workerId), loadSharing(workerId)]);
  const audience = AUDIENCE_OPTIONS.find((o) => o.value === sharing.choices.audiences.credentials)!;
  const today = expiryToday();

  return (
    <main className="page max-w-2xl space-y-8">
      <header className="space-y-3">
        <div className="page-header">
          <h1 className="page-title">Credentials</h1>
          <Link transitionTypes={["nav-back"]} href="/profile" className="btn-ghost">← Profile</Link>
        </div>
        <p className="lead">Registrations, notary status and training you hold. Everything you add here is self-reported until an organization verifies it.</p>
        <p className="text-hint">
          Who sees them (name, verification and expiry, never the number): {audience.label}.{" "}
          <Link href="/profile/sharing" className="link">Change</Link>
        </p>
      </header>

      {/* Around both sections: a removal's message lands in the list; any save, here or below, clears it. */}
      <WalletStatus>
        <section className="section" aria-labelledby="wallet">
          <h2 id="wallet" className="section-title">Your credentials</h2>
          <WalletStatusLine />
          {creds.length === 0 ? (
            <p className="text-muted-sm">None yet.</p>
          ) : (
            <ul className="space-y-3">
              {creds.map((c) => {
                const ex = expiryState(c.expiresOn, today);
                const name = credentialName(c);
                return (
                  // Keyed by the first row of the edit chain, so a saved edit keeps its form and message.
                  <li key={c.rootId} className="card space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-fg">{name}</p>
                      <span className={c.verification === "SELF_REPORTED" ? "badge-dashed" : "badge-accent"}>{VERIFICATION_LABELS[c.verification]}</span>
                    </div>
                    <p className="text-muted-sm">
                      {[maskIdentifier(c.identifier), c.issuedOn && `Issued ${dateText(c.issuedOn)}`, c.expiresOn && `Expires ${dateText(c.expiresOn)}`].filter(Boolean).join(" · ") || "No details added"}
                    </p>
                    {ex.kind === "expired" && <p role="status" className="alert-warning">Expired {ex.days === 1 ? "yesterday" : `${ex.days} days ago`}.</p>}
                    {ex.kind === "soon" && <p role="status" className="alert-info">{ex.days === 0 ? "Expires today." : `Expires in ${ex.days} ${ex.days === 1 ? "day" : "days"}.`}</p>}
                    <details className="group">
                      <summary className="link cursor-pointer list-none text-sm">Edit</summary>
                      <div className="mt-3 border-t border-border pt-3">
                        <CredentialForm
                          id={c.id}
                          masked={maskIdentifier(c.identifier)}
                          values={{ kind: c.kind, label: c.label ?? "", state: c.state ?? "", identifier: "", issuedOn: dateOnly(c.issuedOn) ?? "", expiresOn: dateOnly(c.expiresOn) ?? "" }}
                        />
                      </div>
                    </details>
                    <RemoveCredential id={c.id} name={name} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="section" aria-labelledby="add">
          <h2 id="add" className="section-title">Add a credential</h2>
          <div className="card">
            <CredentialForm />
          </div>
          <p className="text-hint">Proof uploads come later. For now, keep your documents yourself: an organization that needs to see one will ask.</p>
        </section>
      </WalletStatus>
    </main>
  );
}
