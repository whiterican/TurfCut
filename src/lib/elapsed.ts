/** Whole minutes as "2h 30m" (or "45m" under an hour); never negative. */
export function formatElapsed(minutes: number): string {
  const mins = Math.max(0, Math.floor(minutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
