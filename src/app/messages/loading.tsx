/** Thread list skeleton. */
export default function Loading() {
  return (
    <main className="page max-w-2xl" aria-busy="true" aria-label="Loading messages">
      <div className="space-y-2">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-8 w-48" />
      </div>
      <ul className="list-card">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="skeleton size-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-1/3" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
