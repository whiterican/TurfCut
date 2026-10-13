/**
 * The placeholder a tab shows the moment it's tapped, while the server
 * builds the real page. Navigation keeps the nav bar, so only this area
 * changes; it mirrors the usual page shape (heading, a card, a list).
 */
export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <main className="page" aria-busy="true" aria-label={label}>
      <div className="space-y-2">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-8 w-48" />
      </div>
      <div className="skeleton h-32 w-full rounded-3xl" />
      <ul className="list-card">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-1/3" />
              <div className="skeleton h-3 w-1/2" />
            </div>
            <div className="skeleton h-5 w-16" />
          </li>
        ))}
      </ul>
    </main>
  );
}
