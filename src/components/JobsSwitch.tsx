import Link from "next/link";

/**
 * The worker's Jobs tab holds two places (owner's 4-tab dock): finding work
 * and their own schedule. Two links, the current one an eggplant tile.
 */
export function JobsSwitch({ current }: { current: "find" | "schedule" }) {
  return (
    <nav aria-label="Jobs views" className="segmented">
      <Link href="/jobs" aria-current={current === "find" ? "page" : undefined}>
        Find work
      </Link>
      <Link href="/shifts" aria-current={current === "schedule" ? "page" : undefined}>
        My schedule
      </Link>
    </nav>
  );
}
