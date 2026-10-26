import type { CSSProperties, ReactNode } from "react";

/**
 * The top of every page (F02): a condensed eyebrow with the lime dash, the
 * title in the brand face, one line of meta, and the page's actions on the
 * right. Worker and organization pages share it so the two sides never
 * drift. A record head (a job, a shift) composes it: `figure` is the one
 * display figure under the meta line (a job's gross pay) and `chips` the
 * facts as chips under that; `titleStyle` and `titleClassName` let the title
 * carry a view-transition name so it travels from the card that was tapped.
 */
export function Masthead({
  eyebrow,
  title,
  meta,
  figure,
  chips,
  children,
  className = "",
  titleClassName = "",
  titleStyle,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  /** The record's one display figure, under the meta line. */
  figure?: ReactNode;
  /** The record's facts as chips, under the figure. */
  chips?: ReactNode;
  children?: ReactNode;
  className?: string;
  titleClassName?: string;
  titleStyle?: CSSProperties;
}) {
  return (
    <header className={`page-header ${className}`.trim()}>
      <div className="min-w-0 space-y-1.5">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className={`page-title masthead break-words ${titleClassName}`.trim()} style={titleStyle}>{title}</h1>
        {meta && <div className="text-muted-sm">{meta}</div>}
        {figure && <div className="masthead-figure">{figure}</div>}
        {chips && <div className="flex flex-wrap gap-1.5 pt-1">{chips}</div>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}
