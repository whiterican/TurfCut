/**
 * The top of a staff page: a small label, the organization's or job's name
 * in Newsreader (the only place it's used), an optional line under it, and
 * actions on the right.
 */
export function Masthead({ eyebrow, title, meta, children }: { eyebrow: string; title: string; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div className="min-w-0 space-y-1.5">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title masthead break-words">{title}</h1>
        {meta && <div className="text-muted-sm">{meta}</div>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}
