/**
 * The shape of a profile photo's storage key, <profileId>/<random>.<ext>, and
 * what is read from it. No server imports: the navigation uses these too.
 */

/** A key belongs to exactly one person: it sits under their id. The route checks this before reading a byte. */
export const ownsKey = (profileId: string, key: string) => key.startsWith(`${profileId}/`) && !key.slice(profileId.length + 1).includes("/");

export const photoType = (key: string): "image/png" | "image/jpeg" => (key.endsWith(".png") ? "image/png" : "image/jpeg");

/** The part of a key that names one upload: a changed photo has a new one. */
export const photoTag = (key: string) => key.slice(key.lastIndexOf("/") + 1, key.lastIndexOf("."));

/** The address of someone's photo for a person who shares a chat with them (the route decides; the address proves nothing). */
export const chatPhotoUrl = (profileId: string, key: string | null | undefined): string | null =>
  key && ownsKey(profileId, key) ? `/api/profile-photo/${profileId}?v=${encodeURIComponent(photoTag(key))}` : null;

/** The address of the signed-in person's own photo; the tag makes a changed photo a new address. */
export const ownPhotoUrl = (key: string | null | undefined): string | null => (key ? `/api/profile-photo?v=${encodeURIComponent(photoTag(key))}` : null);
