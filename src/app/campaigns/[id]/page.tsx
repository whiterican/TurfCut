import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/employer-session";
import { accessTo } from "@/lib/access";
import { db } from "@/lib/db";
import { embeddableJobs, listOrgCampaigns, loadOrgCampaign, loadPinned, loadPosts, orgJobsForLinking } from "@/lib/campaign-social-data";
import { MAX_PINNED } from "@/lib/campaign-social";
import { PostCard } from "@/components/campaign/PostCard";
import { likeCounts } from "@/lib/campaign-follow-data";
import { listResources, loadFacts } from "@/lib/campaign-kit-data";
import { FactEditor } from "@/components/campaign/FactEditor";
import { ResourceEditor } from "@/components/campaign/ResourceEditor";
import { ResourceList } from "@/components/campaign/ResourceList";
import { deleteFact, deleteResource, saveFact, saveResource } from "@/app/campaigns/actions";
import { PostComposer } from "@/components/campaign/PostComposer";
import { mediaUrl } from "@/lib/campaign-media";
import { ActionButton } from "@/components/ActionButton";
import { CampaignHeader } from "@/components/campaign/CampaignHeader";
import { CampaignProfileForm } from "@/components/campaign/CampaignProfileForm";
import { linkJob, pinPost, publishCampaign, removeCampaignImage, removePost, saveCampaign, savePost, uploadCampaignImage } from "../actions";

/** One campaign: its profile (owners and publishers) and its posts (S1). */
export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cursor?: string }> }) {
  const { id } = await params;
  const { cursor } = await searchParams;
  const session = await requireArea("campaignPosting");
  const c = await loadOrgCampaign(session.orgId, id);
  if (!c) notFound();
  const canEdit = accessTo(session.role, "campaigns") === "full";
  const org = await db().organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { approved: true } });
  const fields = { id: c.id };
  const [jobs, pinned, feed, orgJobs, campaigns] = await Promise.all([embeddableJobs(session.orgId), loadPinned(c.id), loadPosts(c.id, cursor), orgJobsForLinking(session.orgId), listOrgCampaigns(session.orgId)]);
  // The briefing kit (S4): facts behind the talking points, and the scripts, questions and guides.
  const [facts, resources] = await Promise.all([loadFacts(pinned.map((p) => p.id)), listResources(c.id, "ALL")]);
  const linked = orgJobs.filter((j) => j.campaignProfileId === c.id);
  const linkable = orgJobs.filter((j) => j.campaignProfileId !== c.id);
  const campaignName = new Map(campaigns.map((x) => [x.id, x.displayName]));
  const postFields = (postId: string) => ({ postId, campaignId: c.id });
  // Recruiters change only their own posts that aren't talking points (the server checks it too).
  const shown = [...pinned, ...feed.posts].map((x) => x.id);
  // Likes: a total per post, nothing about who (S2).
  const likes = await likeCounts(session.orgId, shown);
  const authors = canEdit ? new Map<string, string>() : new Map((await db().campaignPost.findMany({ where: { id: { in: shown } }, select: { id: true, authorId: true } })).map((x) => [x.id, x.authorId]));
  const canChange = (post: (typeof feed.posts)[number]) => canEdit || (!post.pinnedAt && authors.get(post.id) === session.userId);
  const controls = (post: (typeof feed.posts)[number]) => !canChange(post) ? null : (
    <div className="flex flex-wrap items-start gap-2 border-t border-border pt-3">
      <details className="group w-full">
        <summary className="link cursor-pointer list-none text-sm font-semibold">
          <span className="group-open:hidden">Edit</span>
          <span className="hidden group-open:inline">Cancel edit</span>
        </summary>
        <div className="pt-3">
          <PostComposer action={savePost} campaignId={c.id} postId={post.id} jobs={jobs} defaults={{ body: post.body, jobId: post.jobId, jobTitle: post.job?.title ?? null }} submitLabel="Save post" />
        </div>
      </details>
      {canEdit && (
        <ActionButton
          action={pinPost}
          fields={{ ...postFields(post.id), pin: post.pinnedAt ? "0" : "1" }}
          label={post.pinnedAt ? "Unpin" : "Pin as talking point"}
          pendingLabel="Saving…"
          variant="btn-secondary btn-sm"
          disabled={!post.pinnedAt && pinned.length >= MAX_PINNED}
        />
      )}
      <details className="group">
        <summary className="btn-ghost btn-sm cursor-pointer list-none">
          <span className="group-open:hidden">Delete</span>
          <span className="hidden group-open:inline">Keep post</span>
        </summary>
        <div className="space-y-2 pt-2">
          <p className="text-sm text-fg">Delete this post? It comes off the campaign page{post.pinnedAt ? " and the talking points" : ""}. Turfcut keeps a record of it.</p>
          <ActionButton action={removePost} fields={postFields(post.id)} label="Yes, delete" pendingLabel="Deleting…" variant="btn-secondary btn-sm" />
        </div>
      </details>
    </div>
  );

  return (
    <main className="page max-w-3xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Campaign</p>
          <p className="text-muted-sm">
            {c.publishedAt ? (
              <>Public at <Link className="link" href={`/c/${c.handle}`}>/c/{c.handle}</Link>.</>
            ) : (
              "Draft: only your organization can see it."
            )}
          </p>
        </div>
        <Link href="/campaigns" className="btn-ghost btn-sm">All campaigns</Link>
      </header>

      <section className="section" aria-label="Preview">
        <CampaignHeader displayName={c.displayName} handle={c.handle} bio={c.bio} avatarUrl={mediaUrl(c.avatarKey)} headerUrl={mediaUrl(c.headerKey)} verified={!!c.verifiedAt} />
        <p className="text-muted-sm">
          {c.verifiedAt
            ? "Turfcut has verified this as your official campaign account. Changing the name or handle takes the mark off until Turfcut looks again."
            : "Not verified. Turfcut verifies official accounts by hand, for public pages of approved organizations."}
        </p>
      </section>

      <section className="section">
        <h2 className="section-title">Write a post</h2>
        <div className="card">
          <PostComposer action={savePost} campaignId={c.id} jobs={jobs} />
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Talking points</h2>
        <p className="text-muted-sm">
          Pinned posts are your talking points: up to {MAX_PINNED}, shown at the top of your page and in the brief of every shift on this campaign&apos;s jobs.
          {canEdit ? " Pin a post below." : " Owners and publishers pin them."}
        </p>
        {pinned.length === 0 && <p className="card text-muted-sm">Nothing pinned yet.</p>}
        {pinned.map((p) => (
          <PostCard key={p.id} post={p} handle={c.handle} displayName={c.displayName} signedIn likeTotal={likes.get(p.id) ?? 0} facts={canEdit ? undefined : facts.get(p.id) ?? []}>
            {canEdit && (
              <div className="border-t border-border pt-3">
                <FactEditor save={saveFact} remove={deleteFact} campaignId={c.id} postId={p.id} facts={facts.get(p.id) ?? []} />
              </div>
            )}
            {controls(p)}
          </PostCard>
        ))}
      </section>

      <section className="section" aria-labelledby="field-kit">
        <h2 id="field-kit" className="section-title">Scripts, questions and guides</h2>
        <p className="text-muted-sm">
          Your field kit, in your own words: what to say at the door, the answers to what people ask, how the day works. Everything here goes in the shift brief of every job linked to this campaign;
          what you mark for anyone shows on your public page too.{canEdit ? "" : " Owners and publishers write it."}
        </p>
        {canEdit ? (
          <ResourceEditor save={saveResource} remove={deleteResource} campaignId={c.id} resources={resources} />
        ) : resources.length === 0 ? (
          <p className="card text-muted-sm">Nothing here yet.</p>
        ) : (
          <ResourceList resources={resources} showAudience />
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Jobs for this campaign</h2>
        <p className="text-muted-sm">Shifts on these jobs carry this campaign&apos;s talking points in their brief.</p>
        {linked.length === 0 ? (
          <p className="card text-muted-sm">No jobs linked yet.</p>
        ) : (
          <ul className="list-card">
            {linked.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <Link href={`/jobs/${j.id}`} className="text-sm font-semibold text-fg hover:underline">{j.title}</Link>
                {canEdit && <ActionButton action={linkJob} fields={{ campaignId: c.id, jobId: j.id, unlink: "1" }} label="Unlink" pendingLabel="Unlinking…" variant="btn-ghost btn-sm" />}
              </li>
            ))}
          </ul>
        )}
        {canEdit && linkable.length > 0 && (
          <ActionButton action={linkJob} fields={{ campaignId: c.id }} label="Link job" pendingLabel="Linking…" variant="btn-secondary">
            <label className="min-w-56 flex-1 space-y-1.5">
              <span className="label">Job</span>
              <select name="jobId" className="field" required defaultValue="">
                <option value="" disabled>Pick a job</option>
                {linkable.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                    {j.campaignProfileId ? ` (now: ${campaignName.get(j.campaignProfileId) ?? "another campaign"})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </ActionButton>
        )}
      </section>

      <section className="section">
        <h2 className="section-title">Posts</h2>
        {feed.posts.length === 0 && <p className="card text-muted-sm">No posts yet.</p>}
        {feed.posts.map((p) => (
          <PostCard key={p.id} post={p} handle={c.handle} displayName={c.displayName} signedIn likeTotal={likes.get(p.id) ?? 0}>
            {controls(p)}
          </PostCard>
        ))}
        {feed.next && <Link href={`/campaigns/${c.id}?cursor=${feed.next}`} className="btn-secondary">Older posts</Link>}
      </section>

      {canEdit && (
        <>
          <section className="section">
            <h2 className="section-title">Publishing</h2>
            {!org.approved && !c.publishedAt && <p className="text-muted-sm">Turfcut hasn&apos;t approved your organization yet. You can write the profile and posts now; the campaign goes public once it&apos;s approved.</p>}
            <ActionButton
              action={publishCampaign}
              fields={{ ...fields, publish: c.publishedAt ? "0" : "1" }}
              label={c.publishedAt ? "Unpublish" : "Publish"}
              pendingLabel={c.publishedAt ? "Unpublishing…" : "Publishing…"}
              variant={c.publishedAt ? "btn-secondary" : "btn-primary"}
              disabled={!c.publishedAt && !org.approved}
            />
          </section>

          <section className="section">
            <h2 className="section-title">Profile</h2>
            <div className="card">
              <CampaignProfileForm action={saveCampaign} id={c.id} defaults={{ handle: c.handle, displayName: c.displayName, bio: c.bio }} handleLocked={!!c.publishedAt} />
            </div>
          </section>

          <section className="section">
            <h2 className="section-title">Images</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["avatar", "header"] as const).map((kind) => (
                <div key={kind} className="card space-y-3">
                  <p className="text-sm font-semibold text-fg">{kind === "avatar" ? "Avatar" : "Header image"}</p>
                  <ActionButton action={uploadCampaignImage} fields={{ ...fields, kind }} label="Upload" pendingLabel="Uploading…" variant="btn-secondary">
                    <label className="space-y-1.5">
                      <span className="label">{kind === "avatar" ? "Avatar image" : "Header image"} (PNG or JPEG, up to 2 MB)</span>
                      <input name="image" type="file" accept="image/png,image/jpeg" required className="field" />
                    </label>
                  </ActionButton>
                  {(kind === "avatar" ? c.avatarKey : c.headerKey) && (
                    <ActionButton action={removeCampaignImage} fields={{ ...fields, kind }} label="Remove" pendingLabel="Removing…" variant="btn-ghost btn-sm" />
                  )}
                </div>
              ))}
            </div>
            <p className="text-hint">
              Uploaded images can be fetched by their address straight away, even while the campaign is a draft; Turfcut removes location and camera details from them first. A square avatar and a wide header (about 3:1) look best.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
