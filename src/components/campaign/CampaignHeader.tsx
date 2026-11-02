import { LinkedText } from "@/components/campaign/LinkedText";
import { VerifiedMark } from "@/components/campaign/VerifiedMark";

/**
 * A campaign profile's header: header image, avatar, name, handle and bio,
 * as the campaign wrote them. Turfcut adds one label of its own, and only
 * when staff have verified the profile (M10.5).
 */
export function CampaignHeader({
  displayName,
  handle,
  bio,
  avatarUrl,
  headerUrl,
  verified = false,
  children,
}: {
  displayName: string;
  handle: string;
  bio: string;
  avatarUrl: string | null;
  headerUrl: string | null;
  verified?: boolean;
  children?: React.ReactNode;
}) {
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]?.toUpperCase() ?? "").join("");
  return (
    <header>
      {/* Without a photo, a short band: enough for the avatar to sit on, no empty slab. */}
      <div className={`overflow-hidden rounded-[var(--radius-card)] bg-surface-2 ${headerUrl ? "h-32 sm:h-48 lg:h-56" : "h-16 sm:h-20"}`}>
        {headerUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a public storage URL; no optimizer route for it
          <img src={headerUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="space-y-3 px-1 sm:px-6">
        {/* Only the avatar overlaps the photo: actions that wrap on a phone would otherwise climb onto it. */}
        <div className="relative -mt-10 w-fit">
          <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full border-4 border-[var(--bg)] bg-surface-2 text-xl font-semibold text-fg">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a public storage URL; no optimizer route for it
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden>{initials}</span>
            )}
          </div>
        </div>
        <div>
          <h1 className="page-title">{displayName}</h1>
          <p className="flex flex-wrap items-center gap-2 text-muted-sm">
            <span>@{handle}</span>
            {verified && <VerifiedMark />}
          </p>
        </div>
        {bio && <LinkedText text={bio} className="max-w-[62ch] text-base text-fg" />}
        {children}
      </div>
    </header>
  );
}
