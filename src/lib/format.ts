/** "1 shift", "3 shifts". */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** "just now", "12 min ago", "3 hr ago", "2 days ago" — then a date. */
export function relativeTime(then: Date, now: Date): string {
  const s = Math.round((now.getTime() - then.getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 14) return plural(d, "day") + " ago";
  return `on ${then.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

/**
 * A measured value without noise: at most `digits` decimals, trailing zeros
 * dropped ("40", "11.43", "3.5"), thousands separated.
 */
export const num = (v: number, digits = 2) => Number(v.toFixed(digits)).toLocaleString("en-US", { maximumFractionDigits: digits });

/** A 0–1 rate as a percent with at most one decimal ("90%", "87.5%"). */
export const percent = (v: number) => `${num(v * 100, 1)}%`;
