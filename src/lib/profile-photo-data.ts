import { db } from "@/lib/db";
import { purgeProfilePhotos, supabasePhotoStore, type PhotoRecords, type PhotoStore, type PhotoViewers } from "@/lib/profile-photo";

/** The photo feature's two database touches, on "Profile". */
export const photoRecords = (): PhotoRecords => ({
  async keyOf(profileId) {
    return (await db().profile.findUnique({ where: { id: profileId }, select: { avatarKey: true } }))?.avatarKey ?? null;
  },
  async swapKey(profileId, from, to) {
    return (await db().profile.updateMany({ where: { id: profileId, avatarKey: from }, data: { avatarKey: to } })).count === 1;
  },
});

/** Who shares a chat with whom, for showing a photo (lib/profile-photo: chatPhoto). */
export const photoViewers = (): PhotoViewers => ({
  async sharesChat(viewerId, profileId) {
    const [together, blocked] = await Promise.all([
      db().conversation.findFirst({
        where: { archivedAt: null, AND: [{ participants: { some: { profileId: viewerId, removedAt: null } } }, { participants: { some: { profileId, removedAt: null } } }] },
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
