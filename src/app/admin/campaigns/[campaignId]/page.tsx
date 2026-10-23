import Link from "next/link";
import { notFound } from "next/navigation";
import { UUID_RE } from "@/lib/jobs";
import { requireStaff } from "@/lib/staff-session";
import { isPublic, loadCampaignForVerification } from "@/lib/campaign-admin-data";
import { CampaignVerifyForm } from "@/components/admin/CampaignVerifyForm";
import { VerifiedMark } from "@/components/campaign/VerifiedMark";
import { LocalTime } from "@/components/LocalTime";

const WORDS: Record<string, string> = { "campaign.verified": "Verified", "campaign.unverified": "Mark removed" };

/** One campaign profile in the verification queue (M10.5): what the public sees, who is behind it, Turfcut's decisions so far, and the form. */
export default async function AdminCampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
  await requireStaff();
  const { campaignId } = await params;
  if (!UUID_RE.test(campaignId)) notFound();
  const c = await loadCampaignForVerification(campaignId);
  if (!c) notFound();
  const pub = isPublic(c);
  return (
    <>
      <p>
        <Link transitionTypes={["nav-back"]} href="/admin/campaigns" className="link text-sm">All campaigns</Link>
      </p>
      <header className="space-y-2">
        <h2 className="page-title">{c.displayName}</h2>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>@{c.handle}</span>
          {c.verifiedAt && <VerifiedMark />}
          {!c.publishedAt && <span className="badge-neutral">Draft</span>}
          {c.publishedAt && !c.orgApproved && <span className="badge-coral">Organization not approved</span>}
          {pub && <Link href={`/c/${c.handle}`} className="link">Open the public page</Link>}
        </p>
      </header>

      <section className="section" aria-labelledby="who">
        <h3 id="who" className="section-title">Who is behind it</h3>
        <dl className="card grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="eyebrow eyebrow-quiet">Organization</dt>
            <dd className="text-sm text-fg"><Link href={`/admin/organizations/${c.orgId}`} className="link">{c.orgName}</Link></dd>
          </div>
          <div>
            <dt className="eyebrow eyebrow-quiet">Owners</dt>
            <dd className="text-sm text-fg">
              {c.owners.length === 0 ? "No owner login yet" : c.owners.map((o) => <span key={o.profileId} className="block">{o.name ?? "Owner"}{o.email ? <span className="text-muted"> · {o.email}</span> : null}</span>)}
            </dd>
          </div>
          <div>
            <dt className="eyebrow eyebrow-quiet">Posts</dt>
            <dd className="text-sm text-fg">{c.posts}{c.lastPostAt ? <> · last <LocalTime iso={c.lastPostAt.toISOString()} mode="fulldate" /></> : null}</dd>
          </div>
          <div>
            <dt className="eyebrow eyebrow-quiet">{c.publishedAt ? "Public since" : "Created"}</dt>
            <dd className="text-sm text-fg"><LocalTime iso={(c.publishedAt ?? c.createdAt).toISOString()} mode="fulldate" /></dd>
          </div>
        </dl>
        {c.bio !== null && c.bio.trim() && <p className="card whitespace-pre-line text-sm text-fg">{c.bio}</p>}
      </section>

      <section className="section" aria-labelledby="decision">
        <h3 id="decision" className="section-title">{c.verifiedAt ? "Remove the Verified mark" : "Verify"}</h3>
        {c.verifiedAt && <p className="text-muted-sm">Verified <LocalTime iso={c.verifiedAt.toISOString()} mode="fulldate" />{c.verifiedBy ? ` by ${c.verifiedBy}` : ""}. If the organization renames the profile or changes its handle, the mark comes off by itself.</p>}
        {c.verifiedAt || pub ? (
          <CampaignVerifyForm key={`${c.displayName}|${c.handle}|${c.verifiedAt ? 1 : 0}`} id={c.id} verified={!!c.verifiedAt} name={c.displayName} handle={c.handle} />
        ) : (
          <p className="text-muted-sm">Only a public profile can be verified: it has to be published, and its organization approved.</p>
        )}
      </section>

      <section className="section" aria-labelledby="history">
        <h3 id="history" className="section-title">Turfcut&apos;s decisions on this profile</h3>
        {c.history.length === 0 ? (
          <p className="text-muted-sm">None yet.</p>
        ) : (
          <ul className="list-card">
            {c.history.map((h) => (
              <li key={h.id} className="space-y-1 px-4 py-3">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-fg">{WORDS[h.action] ?? h.action}</span>
                  <span className="text-xs text-subtle"><LocalTime iso={h.createdAt.toISOString()} mode="full" /></span>
                </p>
                <p className="text-sm text-muted">{h.staffName}</p>
                <p className="text-sm text-fg">{h.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
