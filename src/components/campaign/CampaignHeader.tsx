import { LinkedText } from "@/components/campaign/LinkedText";

/**
 * A campaign profile's header: header image, avatar, name, handle and bio,
 * as the campaign wrote them. Turfcut adds no label of its own.
 */
export function CampaignHeader({
  displayName,
  handle,
  bio,
  avatarUrl,
  headerUrl,
  children,
}: {
  displayName: string;
  handle: string;
  bio: string;
  avatarUrl: string | null;
  headerUrl: string | null;
  children?: React.ReactNode;
}) {
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]?.toUpperCase() ?? "").join("");
  return (
    <header className="card overflow-hidden p-0">
      <div className="h-28 bg-surface-2 sm:h-40">
        {headerUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a public storage URL; no optimizer route for it
          <img src={headerUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="space-y-3 px-4 pb-4 sm:px-6">
        <div className="-mt-10 flex items-end justify-between gap-3">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-[var(--surface)] bg-surface-2 text-xl font-semibold text-fg">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a public storage URL; no optimizer route for it
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden>{initials}</span>
            )}
          </div>
          {children}
        </div>
        <div>
          <h1 className="page-title">{displayName}</h1>
          <p className="text-muted-sm">@{handle}</p>
        </div>
        {bio && <LinkedText text={bio} className="text-sm text-fg" />}
      </div>
    </header>
  );
}
