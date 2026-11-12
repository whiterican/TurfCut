import { db } from "@/lib/db";
import { mayShowPhotoTo, purgeProfilePhotos, supabasePhotoStore, type PhotoRecords, type PhotoStore, type PhotoViewers } from "@/lib/profile-photo";

/** The photo feature's two database touches, on "Profile". */
export const photoRecords = (): PhotoRecords => ({
  async keyOf(profileId) {
    return (await db().profile.findUnique({ where: { id: profileId }, select: { avatarKey: true } }))?.avatarKey ?? null;
  },
  async swapKey(profileId, from, to) {
    return (await db().profile.updateMany({ where: { id: profileId, avatarKey: from }, data: { avatarKey: to } })).count === 1;
  },
});

/** Who may be shown whose photo in a chat (lib/profile-photo: chatPhoto, mayShowPhotoTo). */
export const photoViewers = (): PhotoViewers => ({
  async sharesChat(viewerId, profileId) {
    const people = await db().profile.findMany({ where: { id: { in: [viewerId, profileId] }, closedAt: null }, select: { id: true, role: true, orgId: true } });
    const viewer = people.find((p) => p.id === viewerId);
    const owner = people.find((p) => p.id === profileId);
    // Staff are never shown a worker's photo, whatever chat they share.
    if (!viewer || !owner || !mayShowPhotoTo(viewer.role, owner.role)) return false;
    // Staff with no organization share nobody's chat.
    const staffOrg = viewer.role === "WORKER" ? null : viewer.orgId;
    if (viewer.role !== "WORKER" && !staffOrg) return false;
    const [together, blocked] = await Promise.all([
      db().conversation.findFirst({
        where: {
          archivedAt: null,
          // A direct thread stays on record after its job ends, read-only: it stops counting then.
          OR: [{ kind: { not: "DIRECT" } }, { engagement: { status: { in: ["ACTIVE", "CLAIMED"] } } }],
          // Staff only within the organization they are on the staff of now.
          ...(staffOrg ? { orgId: staffOrg } : {}),
          AND: [{ participants: { some: { profileId: viewerId, removedAt: null } } }, { participants: { some: { profileId, removedAt: null } } }],
        },
        select: { id: true },
      }),
      db().profileBlock.findFirst({
        where: { liftedAt: null, OR: [{ blockerId: viewerId, blockedId: profileId }, { blockerId: profileId, blockedId: viewerId }] },
        select: { id: true },
      }),
    ]);
    return !!together && !blocked;
  },
});

/**
 * Remove the photos of closed accounts. Closing an account removes its photo
 * there and then; this is the daily retry for one that failed. Oldest first,
 * so a few that keep failing cannot hold up the rest for ever.
 */
export async function purgeClosedPhotos(store: PhotoStore = supabasePhotoStore()): Promise<number> {
  const left = await db().profile.findMany({ where: { closedAt: { not: null }, avatarKey: { not: null } }, select: { id: true }, orderBy: { closedAt: "asc" }, take: 200 });
  let removed = 0;
  for (const p of left) {
    try {
      await purgeProfilePhotos(p.id, photoRecords(), store);
      removed++;
    } catch (e) {
      console.error("[turfcut] removing a closed account's photo failed", p.id, e);
    }
  }
  return removed;
}
