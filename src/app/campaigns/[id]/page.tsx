import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/employer-session";
import { accessTo } from "@/lib/access";
import { db } from "@/lib/db";
import { loadOrgCampaign } from "@/lib/campaign-social-data";
import { mediaUrl } from "@/lib/campaign-media";
import { ActionButton } from "@/components/ActionButton";
import { CampaignHeader } from "@/components/campaign/CampaignHeader";
import { CampaignProfileForm } from "@/components/campaign/CampaignProfileForm";
import { publishCampaign, removeCampaignImage, saveCampaign, uploadCampaignImage } from "../actions";

/** One campaign: its profile (owners and publishers) and its posts (S1). */
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireArea("campaignPosting");
  const c = await loadOrgCampaign(session.orgId, id);
  if (!c) notFound();
  const canEdit = accessTo(session.role, "campaigns") === "full";
  const org = await db().organization.findUniqueOrThrow({ where: { id: session.orgId }, select: { approved: true } });
  const fields = { id: c.id };

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
        <CampaignHeader displayName={c.displayName} handle={c.handle} bio={c.bio} avatarUrl={mediaUrl(c.avatarKey)} headerUrl={mediaUrl(c.headerKey)} />
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
                      <span className="label">PNG or JPEG, up to 2 MB</span>
                      <input name="image" type="file" accept="image/png,image/jpeg" required className="field" />
                    </label>
                  </ActionButton>
                  {(kind === "avatar" ? c.avatarKey : c.headerKey) && (
                    <ActionButton action={removeCampaignImage} fields={{ ...fields, kind }} label="Remove" pendingLabel="Removing…" variant="btn-ghost btn-sm" />
                  )}
                </div>
              ))}
            </div>
            <p className="text-hint">Images are public once the campaign is. A square avatar and a wide header (about 3:1) look best.</p>
          </section>
        </>
      )}
    </main>
  );
}
