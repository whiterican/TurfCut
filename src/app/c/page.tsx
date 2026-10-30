import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { getSessionProfile } from "@/lib/auth";
import { listPublicCampaigns, type DirectoryRow } from "@/lib/campaign-social-data";
import { followStates } from "@/lib/campaign-follow-data";
import { excerpt, QUERY_MAX } from "@/lib/campaign-social";
import { mediaUrl } from "@/lib/campaign-media";
import { FollowButton } from "@/components/campaign/FollowButton";
import { VerifiedMark } from "@/components/campaign/VerifiedMark";
import { LocalTime } from "@/components/LocalTime";
import { EmptyState } from "@/components/EmptyState";
import { Masthead } from "@/components/Masthead";
import { ListPage } from "@/components/layout/Page";

export const metadata: Metadata = { title: "Campaigns", description: "Every campaign on Turfcut, the most recently active first." };

type Props = { searchParams: Promise<{ cursor?: string; q?: string }> };

/**
 * The campaign directory (S3): every public campaign, the one that posted
 * most recently first. No sign-in needed; a search matches names and
 * handles, and nothing is ranked, suggested or filtered beyond what the
 * reader typed. Workers can follow from here.
 */
export default async function CampaignDirectoryPage({ searchParams }: Props) {
  const { cursor, q: rawQ } = await searchParams;
  const [{ campaigns, next, q }, session] = await Promise.all([listPublicCampaigns({ cursor, q: rawQ }), getSessionProfile().catch(() => null)]);
  const workerId = session?.role === "WORKER" ? session.workerId : null;
  const viewer = workerId ? "worker" : session ? "other" : "guest";
  const follows = workerId ? await followStates(workerId, campaigns.map((c) => c.id)) : null;
  const qs = (c?: string | null) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (c) p.set("cursor", c);
    const s = p.toString();
    return s ? `/c?${s}` : "/c";
  };
  return (
    <ListPage gap={6} head={<Masthead title="Campaigns" meta="Every campaign on Turfcut, the most recently active first." />}>
      <form action="/c" method="get" role="search" className="flex gap-2">
        <label className="sr-only" htmlFor="q">Search campaigns by name or handle</label>
        <input id="q" name="q" type="search" defaultValue={q} maxLength={QUERY_MAX} placeholder="Name or @handle" className="field flex-1" autoComplete="off" />
        <button className="btn-secondary inline-flex items-center gap-1.5" type="submit">
          <Search aria-hidden className="h-4 w-4" />
          Search
        </button>
      </form>
      <section className="section" aria-label="Campaigns">
        {q && <p className="text-muted-sm">{campaigns.length === 0 && !cursor ? "No campaign matches" : "Matching"} “{q}”. <Link href="/c" className="link">Show all</Link></p>}
        {campaigns.length === 0 && cursor && <p className="card text-muted-sm">No more campaigns.</p>}
        {campaigns.length === 0 && !cursor && !q && (
          <EmptyState art="campaigns" title="No campaigns are public yet">
            Campaigns that hire on Turfcut show their page here once it&apos;s public.
          </EmptyState>
        )}
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <li key={c.id}>
              <CampaignRow campaign={c} viewer={viewer} follow={follows?.get(c.id) ?? { following: false, notify: false }} back={qs(cursor)} />
            </li>
          ))}
        </ul>
        {next && <Link href={qs(next)} className="btn-secondary">More campaigns</Link>}
      </section>
    </ListPage>
  );
}

function CampaignRow({ campaign: c, viewer, follow, back }: { campaign: DirectoryRow; viewer: "worker" | "guest" | "other"; follow: { following: boolean; notify: boolean }; back: string }) {
  const avatar = mediaUrl(c.avatarKey);
  const initials = c.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]?.toUpperCase() ?? "").join("");
  const bio = excerpt(c.bio, 140);
  return (
    <article className="card space-y-3" aria-label={c.displayName}>
      <div className="flex items-start gap-3">
        <Link href={`/c/${c.handle}`} className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-sm font-semibold text-fg" aria-hidden tabIndex={-1}>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- a public storage URL; no optimizer route for it
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <span>{initials}</span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <Link href={`/c/${c.handle}`} className="truncate font-semibold text-fg hover:underline">{c.displayName}</Link>
            {c.verified && <VerifiedMark compact />}
          </p>
          <p className="truncate text-sm text-muted">@{c.handle}</p>
          {bio && <p className="mt-1 text-sm text-fg">{bio}</p>}
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span>{c.lastPostAt ? <>Posted <LocalTime iso={c.lastPostAt.toISOString()} mode="date" /></> : "No posts yet"}</span>
            {c.hiring > 0 && <span className="tag">{c.hiring === 1 ? "1 job hiring" : `${c.hiring} jobs hiring`}</span>}
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <FollowButton campaignId={c.id} state={follow} viewer={viewer} back={back} />
      </div>
    </article>
  );
}
