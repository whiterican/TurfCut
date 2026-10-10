import Link from "next/link";
import { requireWorker } from "@/lib/worker-session";
import { loadCredentials } from "@/lib/credentials-data";
import { loadSharing } from "@/lib/sharing-data";
import { AUDIENCE_OPTIONS } from "@/lib/sharing";
import { credentialName, dateOnly, expiryState, expiryToday, maskIdentifier, METHOD_LABELS, VERIFICATION_LABELS } from "@/lib/credentials";
import { loadVerifiers } from "@/lib/verification-data";
import { loadWorkerProofs } from "@/lib/proof-data";
import { proofEligible, proofLapsed, proofLapsesOn, trainingInFuture } from "@/lib/proof-photos";
import { PROOF_SIDES, SIDE_LABELS } from "@/lib/proof-sides";
import { missingProofSettings } from "@/lib/env";
import { ActionButton } from "@/components/ActionButton";
import { ProofUploadForm } from "@/components/ProofUploadForm";
import { removeProofAction } from "./proof-actions";
import { CredentialForm, RemoveCredential, WalletStatus, WalletStatusLine } from "@/components/CredentialForm";

const dateText = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Looks at a photo, one line per organization: how many, the last one, and downloads. */
function groupLooks(looks: Array<{ org: string; at: Date; download: boolean }>) {
  const by = new Map<string, { org: string; count: number; downloads: number; last: Date }>();
  for (const l of looks) {
    const g = by.get(l.org) ?? { org: l.org, count: 0, downloads: 0, last: l.at };
    g.count++;
    if (l.download) g.downloads++;
    if (l.at > g.last) g.last = l.at;
    by.set(l.org, g);
  }
  return [...by.values()].sort((a, b) => b.last.getTime() - a.last.getTime());
}

export default async function CredentialsPage() {
  const { workerId } = await requireWorker();
  const [creds, sharing, verifiers, proofs] = await Promise.all([loadCredentials(workerId), loadSharing(workerId), loadVerifiers(workerId), loadWorkerProofs(workerId)]);
  const photosReady = missingProofSettings().length === 0;
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
                const by = verifiers.get(c.id);
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
                    {by && (
                      <p className="text-muted-sm">
                        Verified by {by.org ?? "an organization"}
                        {by.method && `: ${METHOD_LABELS[by.method]}`}
                        {by.at && `, ${dateText(by.at)}`}. Other organizations see only that an organization verified it, and how.
                      </p>
                    )}
                    {ex.kind === "expired" && <p role="status" className="alert-warning">Expired {ex.days === 1 ? "yesterday" : `${ex.days} days ago`}.</p>}
                    {ex.kind === "soon" && <p role="status" className="alert-info">{ex.days === 0 ? "Expires today." : `Expires in ${ex.days} ${ex.days === 1 ? "day" : "days"}.`}</p>}
                    {c.kind === "TRAINING" && (() => {
                      const photos = proofs.get(c.id) ?? [];
                      const free = PROOF_SIDES.filter((side) => !photos.some((p) => p.side === side));
                      if (!proofEligible(c)) {
                        return <p className="text-hint">Colorado circulator training? Add the state (CO) and the training date to add a photo of your certificate.</p>;
                      }
                      return (
                        <section className="space-y-2 border-t border-border pt-3" aria-label={`Photos of ${name}`}>
                          <p className="text-sm font-medium text-fg">Certificate photo</p>
                          {photos.map((p) => (
                            <div key={p.id} className="space-y-1.5 rounded-xl border border-border p-3">
                              <p className="text-sm text-fg">
                                {SIDE_LABELS[p.side]} · added {dateText(p.createdAt)} · {p.shared ? "organizations that hire you can see it" : "only you can see it"}
                              </p>
                              <p className="text-hint">Deleted automatically on {dateText(new Date(`${p.lapsesOn}T00:00:00Z`))}, a year after the training (or after it was added, if earlier).</p>
                              {p.looks.length === 0 ? (
                                <p className="text-muted-sm">No organization has looked at it.</p>
                              ) : (
                                <ul className="text-muted-sm space-y-0.5">
                                  {groupLooks(p.looks).map((g) => (
                                    <li key={g.org}>
                                      {g.org}: looked {g.count === 1 ? "once" : `${g.count} times`}, last {dateText(g.last)}
                                      {g.downloads > 0 && ` (downloaded ${g.downloads === 1 ? "once" : `${g.downloads} times`})`}.
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <div className="flex flex-wrap items-start gap-2">
                                <a href={`/api/credential-proofs/${p.id}`} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                                  View<span className="sr-only"> (opens in a new tab)</span>
                                </a>
                                <a href={`/api/credential-proofs/${p.id}?download=1`} className="btn-ghost btn-sm">Download</a>
                                <ActionButton
                                  action={removeProofAction}
                                  fields={{ proofId: p.id }}
                                  label="Delete photo"
                                  pendingLabel="Deleting…"
                                  variant="btn-ghost btn-sm"
                                  confirm={{ text: "The photo is deleted, not hidden. The record that it existed, and who looked at it, stays.", label: "Delete it" }}
                                />
                              </div>
                            </div>
                          ))}
                          {trainingInFuture(c.issuedOn!, today) ? (
                            <p className="text-hint">The training date is in the future. You can add a photo of the certificate once the training has happened.</p>
                          ) : proofLapsed(c.issuedOn!, today) ? (
                            <p className="text-hint">This training was more than a year ago ({dateText(new Date(`${proofLapsesOn(c.issuedOn!)}T00:00:00Z`))}), so it takes no photo. Add your new training instead.</p>
                          ) : free.length === 0 ? null : photosReady ? (
                            <ProofUploadForm credentialId={c.id} sides={free} />
                          ) : (
                            <p className="text-hint">Adding a photo isn&apos;t available yet.</p>
                          )}
                        </section>
                      );
                    })()}
                    <details className="group">
                      <summary className="link cursor-pointer list-none text-sm">Edit</summary>
                      <div className="mt-3 space-y-3 border-t border-border pt-3">
                        {c.verification !== "SELF_REPORTED" && <p className="text-hint">Saving a change makes it self-reported again, until an organization checks it again.</p>}
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
          <p className="text-hint">
            Keep your documents yourself. If you circulate petitions in Colorado, save your Secretary of State training certificate: the organization that
            hires you needs a copy to register you. Add it as training, with the state CO and the training date, and you can add a photo of it here.
          </p>
        </section>
      </WalletStatus>
    </main>
  );
}
