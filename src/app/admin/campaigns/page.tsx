import Link from "next/link";
import { requireStaff } from "@/lib/staff-session";
import { isPublic, LIST_MAX, listCampaignsForVerification, type AdminCampaignRow } from "@/lib/campaign-admin-data";
import { LocalTime } from "@/components/LocalTime";

function Row({ c }: { c: AdminCampaignRow }) {
  return (
    <li>
      <Link transitionTypes={["nav-forward"]} href={`/admin/campaigns/${c.id}`} className="block space-y-1 px-4 py-3 transition hover:bg-surface-2">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="flex flex-wrap items-center gap-2 font-semibold text-fg">
            {c.displayName}
            {c.verifiedAt && !isPublic(c) && <span className="badge-butter">Not public now</span>}
          </span>
          <span className="text-xs text-subtle">
            {c.verifiedAt ? <>Verified <LocalTime iso={c.verifiedAt.toISOString()} mode="fulldate" /></> : c.publishedAt ? <>Public since <LocalTime iso={c.publishedAt.toISOString()} mode="fulldate" /></> : null}
          </span>
        </span>
        <span className="block text-sm text-muted">@{c.handle} · {c.orgName}{c.verifiedBy ? ` · by ${c.verifiedBy}` : ""}</span>
      </Link>
    </li>
  );
}

/** The campaign verification queue (M10.5): public profiles waiting for a look, and the ones that carry the mark. */
export default async function AdminCampaignsPage() {
  await requireStaff();
  const { awaiting, verified, awaitingTotal, verifiedTotal } = await listCampaignsForVerification();
  return (
    <>
      <section className="section" aria-labelledby="awaiting">
        <h2 id="awaiting" className="section-title flex items-center justify-between">
          To verify <span className="text-xs font-medium text-subtle">{awaitingTotal}</span>
        </h2>
        <p className="text-muted-sm">Public profiles of approved organizations, waiting longest first. The Verified mark says Turfcut confirmed this is the organization&apos;s official account; it does not rank, recommend or change who sees a profile.</p>
        {awaiting.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">Nothing waiting</p>
            <p className="empty-state-body">A profile appears here once its organization is approved and the campaign is published.</p>
          </div>
        ) : (
          <ul className="list-card">{awaiting.map((c) => <Row key={c.id} c={c} />)}</ul>
        )}
        {awaitingTotal > LIST_MAX && <p className="text-hint">Showing the {LIST_MAX} that have waited longest.</p>}
      </section>

      <section className="section" aria-labelledby="verified">
        <h2 id="verified" className="section-title flex items-center justify-between">
          Verified <span className="text-xs font-medium text-subtle">{verifiedTotal}</span>
        </h2>
        {verified.length === 0 ? <p className="text-muted-sm">No profile is verified yet.</p> : <ul className="list-card">{verified.map((c) => <Row key={c.id} c={c} />)}</ul>}
        {verifiedTotal > LIST_MAX && <p className="text-hint">Showing the {LIST_MAX} most recently verified.</p>}
      </section>
    </>
  );
}
