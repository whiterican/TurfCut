import { Frame, type TemplateName } from "@/components/layout/Page";

/**
 * The placeholder a route shows the moment it's opened, while the server
 * builds the real page (P1.3). Navigation keeps the nav, so only this area
 * changes, and each shape mirrors the layout it stands in for, so nothing
 * jumps when the page arrives. Every route's loading.tsx picks one; a test
 * fails a page without one. The pulse is the motion tokens' and stops under
 * "Less motion". Screen readers hear only the label.
 */
export type SkeletonShape = "home" | "cards" | "table" | "detail" | "form" | "thread" | "list";
export const SKELETON_SHAPES: readonly SkeletonShape[] = ["home", "cards", "table", "detail", "form", "thread", "list"];

/** The page's own container: `.page` (3xl), `.page max-w-2xl|4xl|5xl`, or the centred `.page-narrow`. */
export type SkeletonWidth = "page" | "2xl" | "4xl" | "5xl" | "narrow";
/** The page's own vertical rhythm when it sets one (`space-y-4|6|8`); `.page` itself is 10. */
export type SkeletonGap = 4 | 6 | 8 | 10;

const Bar = ({ className }: { className: string }) => <div className={`skeleton ${className}`} />;

function Heading() {
  return (
    <div className="space-y-2">
      <Bar className="h-4 w-24" />
      <Bar className="h-8 w-48" />
    </div>
  );
}

function Rows({ n, avatar = false }: { n: number; avatar?: boolean }) {
  return (
    <ul className="list-card">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
          {avatar && <Bar className="size-10 shrink-0 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Bar className="h-4 w-1/3" />
            <Bar className="h-3 w-1/2" />
          </div>
          {!avatar && <Bar className="h-5 w-16" />}
        </li>
      ))}
    </ul>
  );
}

interface ShapeOptions {
  heading: boolean;
  filters: boolean;
  avatars: boolean;
}

const SHAPES: Record<SkeletonShape, (o: ShapeOptions) => React.ReactNode> = {
  // Today, the Desk, a shift, Earnings: a hero card, a row of figures, a list.
  home: (o) => (
    <>
      {o.heading && <Heading />}
      <Bar className="h-40 w-full rounded-[var(--radius-card)]" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => <Bar key={i} className="h-16 rounded-2xl" />)}
      </div>
      <Rows n={3} />
    </>
  ),
  // The Work feed, campaign feeds, directories: a filter row (when the page has one), then cards.
  cards: (o) => (
    <>
      {o.heading && <Heading />}
      {o.filters && (
        <div className="flex gap-2">
          {Array.from({ length: 4 }, (_, i) => <Bar key={i} className="h-9 w-20 rounded-full" />)}
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="card space-y-3">
            <Bar className="h-5 w-2/3" />
            <div className="flex gap-2">
              <Bar className="h-6 w-20 rounded-full" />
              <Bar className="h-6 w-24 rounded-full" />
            </div>
            <Bar className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    </>
  ),
  // Hiring's tables: a summary line, then a header row and rows.
  table: (o) => (
    <>
      {o.heading && <Heading />}
      <Bar className="h-4 w-64" />
      <div className="overflow-hidden rounded-2xl border border-border">
        <Bar className="h-10 w-full rounded-none" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex gap-4 border-t border-border px-4 py-3">
            <Bar className="h-4 w-1/4" />
            <Bar className="h-4 w-1/6" />
            <Bar className="h-4 w-1/5" />
            <Bar className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </>
  ),
  // One record: its facts card, then a section or two.
  detail: (o) => (
    <>
      {o.heading && <Heading />}
      <div className="card space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex justify-between gap-4">
            <Bar className="h-4 w-1/4" />
            <Bar className="h-4 w-1/3" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Bar className="h-5 w-32" />
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-5/6" />
      </div>
      <Rows n={2} />
    </>
  ),
  // Settings, sign-in, job editor: labelled fields and a button.
  form: (o) => (
    <>
      {o.heading && <Heading />}
      <div className="space-y-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Bar className="h-4 w-28" />
            <Bar className="h-11 w-full rounded-xl" />
          </div>
        ))}
        <Bar className="h-11 w-32 rounded-xl" />
      </div>
    </>
  ),
  // A conversation or a dispute: who, a few bubbles, the composer.
  thread: () => (
    <>
      <div className="flex items-center gap-3">
        <Bar className="size-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Bar className="h-5 w-40" />
          <Bar className="h-3 w-24" />
        </div>
      </div>
      <div className="space-y-3">
        {(["w-3/5", "w-2/5", "w-2/3", "w-1/3"] as const).map((w, i) => (
          <div key={i} className={`flex ${i % 2 ? "justify-end" : ""}`}>
            <Bar className={`h-10 ${w}`} />
          </div>
        ))}
      </div>
      <Bar className="h-40 w-full rounded-2xl" />
    </>
  ),
  // Inboxes, notices, statements, admin queues: a list of rows (with a face per row for people).
  list: (o) => (
    <>
      {o.heading && <Heading />}
      <Rows n={5} avatar={o.avatars} />
    </>
  ),
};

const WIDTH: Record<SkeletonWidth, string> = {
  page: "page",
  "2xl": "page max-w-2xl",
  "4xl": "page max-w-4xl",
  "5xl": "page max-w-5xl",
  narrow: "page-narrow flex flex-1 flex-col justify-center gap-6",
};
const GAP: Record<SkeletonGap, string> = { 4: "space-y-4", 6: "space-y-6", 8: "space-y-8", 10: "space-y-10" };

export function PageSkeleton({
  shape = "list",
  width = "page",
  gap,
  label = "Loading",
  framed = true,
  filters = true,
  avatars = false,
  template,
  panel = false,
  org = false,
  panelStart = false,
}: {
  shape?: SkeletonShape;
  /** The page's template (redesign §4.2.2): the skeleton draws the same frame, so nothing moves when the page arrives. */
  template?: TemplateName;
  /** The template's side panel is there too (an aside, or an inspector on wide screens). */
  panel?: boolean;
  /** An organization page: its inspector shows from 1280, as the page's does. */
  org?: boolean;
  /** The panel leads (a section's sub-nav on the left), as the page's does. */
  panelStart?: boolean;
  width?: SkeletonWidth;
  gap?: SkeletonGap;
  label?: string;
  /**
   * False inside a layout that already draws the page and its heading (the
   * staff console): then the skeleton is a plain block, never a second main.
   */
  framed?: boolean;
  /** Cards: draw the filter row (the Work feed has one; a campaign's page doesn't). */
  filters?: boolean;
  /** Lists: a face on each row (inboxes, members). */
  avatars?: boolean;
}) {
  if (template && framed) {
    const side = (
      <>
        <Bar className="h-32 w-full rounded-[var(--radius-card)]" />
        <Bar className="h-24 w-full rounded-[var(--radius-card)]" />
      </>
    );
    return (
      <Frame template={template} head={<Heading />} gap={gap} busy={label} panel={panel ? side : undefined} panelKind={template === "listDetail" || template === "workspace" ? "inspector" : "aside"} org={template === "workspace" || org} panelStart={panelStart}>
        {SHAPES[shape]({ heading: false, filters, avatars })}
      </Frame>
    );
  }
  const body = SHAPES[shape]({ heading: framed, filters, avatars });
  const rhythm = gap ? GAP[gap] : "";
  if (!framed) {
    return (
      <div className={GAP[gap ?? 10]} role="status" aria-busy="true" aria-label={label}>
        {body}
      </div>
    );
  }
  return (
    <main className={[WIDTH[width], rhythm].filter(Boolean).join(" ")} aria-busy="true" aria-label={label}>
      {body}
    </main>
  );
}
