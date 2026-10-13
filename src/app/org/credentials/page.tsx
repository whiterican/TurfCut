import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { UrlNotice } from "@/components/UrlNotice";
import { requireArea } from "@/lib/employer-session";
import { credentialName, expiryState, expiryToday, METHOD_LABELS, methodsFor, VERIFICATION_LABELS } from "@/lib/credentials";
import { loadHiredCredentials } from "@/lib/verification-data";
import { SIDE_LABELS } from "@/lib/proof-sides";
import { verify } from "./actions";

const dateText = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * Credential checks (C3.6a): owners and compliance members record that they
 * checked a hired worker's credential, and how. Only workers hired on one of
 * the organization's jobs who share credentials with it; a worker's edit
 * makes the credential self-reported again.
 */
export default async function OrgCredentialsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireArea("compliance");
  const [workers, { checked }] = await Promise.all([loadHiredCredentials({ profileId: session.userId, orgId: session.orgId, role: session.role }), searchParams]);
  const today = expiryToday();

  return (
    <main className="page max-w-3xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Compliance</p>
          <h1 className="page-title">Credentials</h1>
        </div>
        <Link href="/dashboard" className="btn-ghost btn-sm">← Desk</Link>
      </header>
      <p className="lead">
        Record that you checked a hired worker&apos;s credential, and how. Workers see which organization verified it. Other organizations see only that an
        organization did, and how.
      </p>

      {checked === "1" && <UrlNotice param="checked" message="Recorded. The worker sees that your organization verified it, and how." />}

      {workers === null ? (
        <p role="status" className="alert-info">Once Turfcut approves your organization, you can verify the credentials of workers you hire.</p>
      ) : workers.length === 0 ? (
        <p className="text-muted-sm">Nobody hired yet. Workers appear here once they claim a spot or accept an offer on one of your jobs.</p>
      ) : (
        <ul className="space-y-4">
          {workers.map((w) => (
            <li key={w.workerId} className="card space-y-3">
              <div className="space-y-0.5">
                <p className="font-semibold text-fg">{w.name}</p>
                <p className="text-muted-sm">Hired for {w.jobs.join(", ")}</p>
              </div>
              {w.credentials === "withheld" ? (
                <p className="text-muted-sm">Doesn&apos;t share credentials with your organization.</p>
              ) : w.credentials.length === 0 ? (
                <p className="text-muted-sm">No credentials added.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {w.credentials.map((c) => {
                    const name = credentialName(c);
                    const ex = expiryState(c.expiresOn, today);
                    return (
                      <li key={c.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-fg">{name}</span>
                          <span className={c.verification === "SELF_REPORTED" ? "badge-dashed" : "badge-accent"}>
                            {c.byUs ? "Verified by your organization" : VERIFICATION_LABELS[c.verification]}
                          </span>
                          {c.verificationMethod && <span className="text-muted-sm">({METHOD_LABELS[c.verificationMethod]}{c.verifiedAt && c.byUs ? `, ${dateText(c.verifiedAt)}` : ""})</span>}
                        </div>
                        <p className="text-muted-sm">
                          {c.expiresOn ? (ex.kind === "expired" ? `Expired ${dateText(c.expiresOn)}` : `Expires ${dateText(c.expiresOn)}`) : "No expiry date given"}
                        </p>
                        {c.proofs.length > 0 && (
                          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                            <span className="text-muted-sm">Certificate photo:</span>
                            {c.proofs.map((p) => (
                              <a key={p.id} href={`/api/credential-proofs/${p.id}`} target="_blank" rel="noopener noreferrer" className="link">
                                View the {SIDE_LABELS[p.side].toLowerCase()}<span className="sr-only"> (opens in a new tab)</span>
                              </a>
                            ))}
                            <span className="text-hint">The worker sees when your organization opens it.</span>
                          </p>
                        )}
                        {c.verification === "SELF_REPORTED" && ex.kind !== "expired" && (
                          <ActionButton
                            action={verify}
                            fields={{ credentialId: c.id }}
                            label="Record a check"
                            pendingLabel="Recording…"
                            variant="btn-secondary btn-sm"
                            confirm={{
                              text: `You confirm that you checked ${w.name}'s ${name} this way. This is recorded under your name and can't be undone; it stays until the worker changes the credential.`,
                              label: "Record it",
                            }}
                          >
                            <label className="block space-y-1.5">
                              <span className="label">How you checked</span>
                              <select name="method" required className="field" defaultValue="">
                                <option value="" disabled>Choose one</option>
                                {methodsFor(c, { photoSeen: c.proofs.some((p) => p.looked) }).map((m) => <option key={m} value={m}>{METHOD_LABELS[m][0].toUpperCase() + METHOD_LABELS[m].slice(1)}</option>)}
                              </select>
                            </label>
                          </ActionButton>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-hint">
        Turfcut itself never shows you a credential&apos;s number. Look the worker up by name in the state&apos;s registry, or ask to see the original. A
        worker may share a photo of a Colorado training certificate with organizations that hire them; it shows whatever is printed on it. The worker sees
        each time your organization opens it, and once you have, you can record that you checked it that way. A photo is something to check, not proof by
        itself.
      </p>
    </main>
  );
}
