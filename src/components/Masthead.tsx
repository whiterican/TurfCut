import type { CSSProperties, ReactNode } from "react";

/**
 * The top of every page (F02): the title in the brand face, one line of
 * meta, and the page's actions on the right. `eyebrow` is optional and only
 * for a fact the title doesn't carry (a job's type and place, which job an
 * applicants view is for, a breadcrumb); it is a quiet sentence-case line,
 * never a tracked uppercase kicker that repeats the tab you are on (D1b). Worker and organization pages share it so the two sides never
 * drift. A record head (a job, a shift) composes it: `figure` is the one
 * display figure under the meta line (a job's gross pay) and `chips` the
 * facts as chips under that; `titleStyle` and `titleClassName` let the title
 * carry a view-transition name so it travels from the card that was tapped.
 */
export function Masthead({
  back,
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
  /** A way back (one link), shown above the title on every width. */
  back?: ReactNode;
  eyebrow?: ReactNode;
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
      {back && <div className="-mb-1 basis-full">{back}</div>}
      <div className="min-w-0 space-y-1.5">
        {eyebrow && <p className="masthead-context">{eyebrow}</p>}
        <h1 className={`page-title masthead break-words ${titleClassName}`.trim()} style={titleStyle}>{title}</h1>
        {meta && <div className="text-muted-sm max-w-prose">{meta}</div>}
        {figure && <div className="masthead-figure">{figure}</div>}
        {chips && <div className="flex flex-wrap gap-1.5 pt-1">{chips}</div>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}
