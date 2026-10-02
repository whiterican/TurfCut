/** Thread skeleton: header, a few bubbles, the composer. */
export default function Loading() {
  return (
    <main className="page max-w-2xl space-y-4" aria-busy="true" aria-label="Loading conversation">
      <div className="flex items-center gap-3">
        <div className="skeleton size-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-5 w-40" />
          <div className="skeleton h-3 w-24" />
        </div>
      </div>
      <div className="space-y-3">
        {[60, 40, 70, 30].map((w, i) => (
          <div key={i} className={`flex ${i % 2 ? "justify-end" : ""}`}>
            <div className="skeleton h-10" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
      <div className="skeleton h-40" />
    </main>
  );
}
