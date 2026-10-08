import { credentialName, VERIFICATION_LABELS, type OrgCredentialView } from "@/lib/credentials";
import { NotSharedChip } from "@/components/staff/NotSharedChip";

const dateText = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** A worker's credentials as an organization sees them: name, verification level, expiry. Never the number. */
export function CredentialList({ view, today }: { view: OrgCredentialView[] | "withheld"; today: string }) {
  if (view === "withheld") return <NotSharedChip what="credentials" />;
  if (view.length === 0) return <p className="text-muted-sm">No credentials added.</p>;
  return (
    <ul className="divide-y divide-border">
      {view.map((c, i) => {
        const expired = c.expiresOn && c.expiresOn.toISOString().slice(0, 10) < today;
        return (
          <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <span className="font-medium text-fg">{credentialName(c)}</span>
            <span className="flex flex-wrap items-center gap-2">
              <span className={c.verification === "SELF_REPORTED" ? "badge-dashed" : "badge-accent"}>{VERIFICATION_LABELS[c.verification]}</span>
              {c.expiresOn && <span className={expired ? "text-danger-msg" : "text-muted"}>{expired ? "Expired" : "Expires"} {dateText(c.expiresOn)}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
