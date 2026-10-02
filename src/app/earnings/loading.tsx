/** Earnings skeleton. */
export default function Loading() {
  return (
    <main className="page max-w-2xl" aria-busy="true" aria-label="Loading your pay">
      <div className="space-y-2">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-8 w-40" />
      </div>
      <div className="skeleton h-36 w-full rounded-2xl" />
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
