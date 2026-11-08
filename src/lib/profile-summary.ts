import { num, percent, plural } from "@/lib/format";
import type { SharedScorecard, SharedHistory } from "@/lib/shared-scorecard";

/** Summarize authorized headline values, never hidden metrics or an overall score. */
export function profileScorecardSummary(scorecard: SharedScorecard): string | null {
  if (!Object.values(scorecard.shared).some(Boolean)) return null;
  const words: string[] = [];
  if (scorecard.shared.history) {
    const total = (pick: (h: SharedHistory) => number) => scorecard.segments.reduce((n, s) => n + (s.history ? pick(s.history) : 0), 0);
    words.push(plural(total(h => h.shiftsCount), "verified shift"));
    if (scorecard.showRate?.value != null) words.push(`${percent(scorecard.showRate.value)} show rate`);
    words.push(scorecard.segments.some(s => s.workType === "PETITION")
      ? `${num(total(h => h.signaturesAccepted))} accepted signatures`
      : `${num(total(h => h.doorsAttempted))} doors attempted`);
    words.push(`${num(total(h => h.activeHours), 1)} verified hours`);
  } else if (scorecard.showRate?.value != null) {
    words.push(`${percent(scorecard.showRate.value)} show rate`);
  }
  // A rate may be authorized without its counts or work history. Their
  // absence must not become a claim of "no work yet" or zero totals.
  return words.join(" · ") || "View shared details";
}
