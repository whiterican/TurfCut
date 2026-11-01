/** Whether two instants fall on the same calendar day in a zone (the viewer's own when none is given). */
export function sameDay(a: string, b: string, timeZone?: string): boolean {
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone });
  return day(a) === day(b);
}
