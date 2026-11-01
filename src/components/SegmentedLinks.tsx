import Link from "next/link";

/**
 * The concept's segmented control (#111, screen 4): links on a Muted track,
 * the current one an Eggplant segment with white type. Each segment is a real
 * URL, so the choice survives Back and refresh.
 */
export function SegmentedLinks({ label, items }: { label: string; items: Array<{ label: string; href: string; current: boolean }> }) {
  return (
    <nav aria-label={label} className="segmented">
      {items.map((i) => (
        <Link key={i.href} href={i.href} scroll={false} aria-current={i.current ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
