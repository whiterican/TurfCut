/**
 * Pull to refresh (P1.8), for the installed app only: a browser tab has the
 * address bar's reload, and a browser's own pull-to-refresh where it has one.
 * Pure rules; components/PullToRefresh.tsx drives them.
 */

/** A downward drag shorter than this is a tap or a wobble. */
export const PULL_START_PX = 12;
/** Releasing past this refreshes. */
export const PULL_THRESHOLD_PX = 72;
/** The indicator never travels further than this, however far the finger goes. */
export const PULL_MAX_PX = 112;

/** How far the indicator sits for a finger `dy` below where it started: eases toward the cap like a rubber band. */
export function pullOffset(dy: number): number {
  const d = Math.max(0, dy - PULL_START_PX);
  return Math.round(PULL_MAX_PX * (1 - Math.exp(-d / PULL_MAX_PX)));
}

/** Past the threshold the release refreshes; short of it the indicator slides back. */
export const pullRelease = (offset: number): "refresh" | "settle" => (offset >= PULL_THRESHOLD_PX ? "refresh" : "settle");

/** The page runs from the home screen (standalone), where there is no reload button to reach. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches);
}
