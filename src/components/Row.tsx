/** One label/value row inside a `<dl className="list-card">`. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-fg sm:text-right">{children}</dd>
    </div>
  );
}
