import type { ReactNode } from "react";

/**
 * The top of every page (F02): a condensed eyebrow with the lime dash, the
 * title in the brand face, one line of meta, and the page's actions on the
 * right. Worker and organization pages share it so the two sides never
 * drift; a page that needs more in its head (a job's pay figure, a shift's
 * state) composes it rather than writing its own header.
 */
export function Masthead({ eyebrow, title, meta, children, className = "" }: { eyebrow: ReactNode; title: ReactNode; meta?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={`page-header ${className}`.trim()}>
      <div className="min-w-0 space-y-1.5">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title masthead break-words">{title}</h1>
        {meta && <div className="text-muted-sm">{meta}</div>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}
