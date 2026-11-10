import { num, percent, plural } from "@/lib/format";
import type { SharedScorecard } from "@/lib/shared-scorecard";

const WORK_LABELS = { PETITION: "Petition circulation", CANVASS: "Door-to-door canvass" } as const;

/** Summarize authorized visible work-type values, never hidden metrics or an overall score. */
export function profileScorecardSummary(scorecard: SharedScorecard): string | null {
  if (!Object.values(scorecard.shared).some(Boolean)) return null;
  const words: string[] = [];
  if (scorecard.shared.history) {
    const hasVerifiedWork = scorecard.segments.some(s => s.history && s.history.shiftsCount > 0);
    if (!hasVerifiedWork) words.push("No verified shifts yet");
    else for (const segment of scorecard.segments) {
      const history = segment.history;
      if (!history) continue;
      const summary = history.shiftsCount === 0 ? "No verified shifts yet"
        : `${plural(history.shiftsCount, "verified shift")} · ${segment.workType === "PETITION"
          ? `${num(history.signaturesAccepted)} accepted signatures`
          : `${num(history.doorsAttempted)} doors attempted`} · ${num(history.activeHours, 1)} verified hours`;
      words.push(`${WORK_LABELS[segment.workType]}: ${summary}`);
    }
  }
  if (scorecard.showRate?.value != null) words.push(`${percent(scorecard.showRate.value)} show rate`);
  // A rate may be authorized without its counts or work history. Their
  // absence must not become a claim of "no work yet" or zero totals.
  return words.join(" · ") || "View shared details";
}
