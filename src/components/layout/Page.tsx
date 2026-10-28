import type { CSSProperties, ReactNode } from "react";

/**
 * Page templates (redesign §4.2.2), replacing the hand-set `page max-w-*`
 * widths. Each template owns what a page used to set by hand, so no page can
 * get it wrong: the gutters, the clearance above the phone's dock, the
 * heading slot, where its side panel goes and from which width, and its
 * skeleton (PageSkeleton takes the same template name). Pages put content in
 * the slots; they never set a width.
 *
 * The panel is an aside (facts and actions) or an inspector (the selected
 * row). On phones and below its breakpoint it follows the main column, except
 * an inspector, which isn't drawn there: the row opens its own route.
 */
export type TemplateName = "reading" | "list" | "listDetail" | "record" | "workspace" | "field" | "hero";
export const TEMPLATES: readonly TemplateName[] = ["reading", "list", "listDetail", "record", "workspace", "field", "hero"];

/** Vertical rhythm between a page's sections (rem/4, as Tailwind's space-y). */
export type TemplateGap = 4 | 6 | 8 | 10;

interface FrameProps {
  /** The heading slot: a Masthead, drawn above both columns. */
  head?: ReactNode;
  children: ReactNode;
  gap?: TemplateGap;
  /** For a skeleton: busy, with its own label. */
  busy?: string;
  /** The panel's landmark name ("Apply", "Your summary", the selected row's kind). */
  panelLabel?: string;
  /** Beside the organization rail: the panel waits for 1280, so the main column keeps about 720px. */
  org?: boolean;
  /**
   * The main column's last part, which on a phone follows the panel rather than preceding it
   * (a job's full card comes after the Apply panel there; beside it from 1024).
   */
  tail?: ReactNode;
}

/** The shared frame; exported for PageSkeleton, which draws the same frame around its placeholder. */
export function Frame({ template, head, children, panel, panelKind, gap = 10, busy, org, panelLabel, tail }: FrameProps & { template: TemplateName; panel?: ReactNode; panelKind?: "aside" | "inspector" }) {
  return (
    <main
      className="tpl"
      data-template={template}
      data-panel={panel ? panelKind : undefined}
      data-org={org || undefined}
      style={{ "--tpl-gap": `${gap / 4}rem` } as CSSProperties}
      aria-busy={busy ? true : undefined}
      aria-label={busy}
    >
      {head && <div className="tpl-head">{head}</div>}
      <div className="tpl-body">
        <div className="tpl-main">{children}</div>
        {panel &&
          (panelKind === "inspector" ? (
            <section className="tpl-panel" aria-label={panelLabel ?? "Details"}>{panel}</section>
          ) : (
            <aside className="tpl-panel" aria-label={panelLabel}>{panel}</aside>
          ))}
        {tail && <div className="tpl-tail">{tail}</div>}
      </div>
    </main>
  );
}

/** Settings, forms, consent, policies: one column at reading measure; help beside it where useful. */
export function ReadingPage({ aside, ...p }: FrameProps & { aside?: ReactNode }) {
  return <Frame template="reading" panel={aside} panelKind="aside" {...p} />;
}

/** Lists to scan (jobs, schedule, messages, notifications, feed): a content column and an optional context rail. */
export function ListPage({ aside, ...p }: FrameProps & { aside?: ReactNode }) {
  return <Frame template="list" panel={aside} panelKind="aside" {...p} />;
}

/**
 * A list with a selected item beside it (hiring, applicants, pay lines). The
 * inspector shows from 1024 on worker pages and from 1280 on organization
 * pages (beside the rail), so the list never drops below about 720px; below
 * that the row opens its own route, which always exists for deep links.
 */
export function ListDetailPage({ inspector, ...p }: FrameProps & { inspector?: ReactNode }) {
  return <Frame template="listDetail" panel={inspector} panelKind="inspector" {...p} />;
}

/** One thing (a job, a shift under review, a receipt, a dispute): the object first, then a sticky aside of facts and actions. */
export function RecordPage({ aside, ...p }: FrameProps & { aside?: ReactNode }) {
  return <Frame template="record" panel={aside} panelKind="aside" {...p} />;
}

/** Tables and maps (desk, field, pay, audit): full width up to --workspace-max, with an optional inspector from 1280. */
export function WorkspacePage({ inspector, ...p }: FrameProps & { inspector?: ReactNode }) {
  return <Frame template="workspace" panel={inspector} panelKind="inspector" {...p} org />;
}

/** In-shift task mode: the task, and beside it from 1024 the brief and map (below it on a phone). */
export function FieldPage({ aside, ...p }: FrameProps & { aside?: ReactNode }) {
  return <Frame template="field" panel={aside} panelKind="aside" {...p} />;
}

/** Public landing and sign-in: no gutters of its own; the page draws its photo and form split. */
export function HeroPage({ children, busy }: { children: ReactNode; busy?: string }) {
  return (
    <main className="tpl" data-template="hero" aria-busy={busy ? true : undefined} aria-label={busy}>
      {children}
    </main>
  );
}
