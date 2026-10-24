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

/** The page's own container width: `.page`, `.page max-w-2xl`, or `.page-narrow`. */
export type SkeletonWidth = "page" | "2xl" | "narrow";

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

const SHAPES: Record<SkeletonShape, () => React.ReactNode> = {
  // Today, the Desk, a shift, Earnings: a hero card, a row of figures, a list.
  home: () => (
    <>
      <Heading />
      <Bar className="h-40 w-full rounded-3xl" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => <Bar key={i} className="h-16 rounded-2xl" />)}
      </div>
      <Rows n={3} />
    </>
  ),
  // The Work feed, campaign feeds, directories: a filter row, then cards.
  cards: () => (
    <>
      <Heading />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => <Bar key={i} className="h-9 w-20 rounded-full" />)}
      </div>
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
  table: () => (
    <>
      <Heading />
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
  detail: () => (
    <>
      <Heading />
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
  form: () => (
    <>
      <Heading />
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
      <Bar className="h-28 w-full rounded-2xl" />
    </>
  ),
  // Inboxes, notices, statements, admin queues: a list of rows.
  list: () => (
    <>
      <Heading />
      <Rows n={5} avatar={false} />
    </>
  ),
};

const WIDTH: Record<SkeletonWidth, string> = { page: "page", "2xl": "page max-w-2xl", narrow: "page-narrow space-y-6" };

export function PageSkeleton({ shape = "list", width = "page", label = "Loading" }: { shape?: SkeletonShape; width?: SkeletonWidth; label?: string }) {
  return (
    <main className={WIDTH[width]} aria-busy="true" aria-label={label}>
      {SHAPES[shape]()}
    </main>
  );
}
