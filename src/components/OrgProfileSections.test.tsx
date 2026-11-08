import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OrgProfileSections } from "./OrgProfileSections";
import type { OrgProfileView } from "@/lib/org-profile-data";
import { computeScorecard } from "@/lib/scorecard";
import { ALL_SHARED, shareScorecard } from "@/lib/shared-scorecard";
import { employerFitView, SHARED_BASIS } from "@/lib/political-fit";
import { profileScorecardSummary } from "@/lib/profile-summary";

const none = { output: false, quality: false, reliability: false, history: false, availability: false, credentials: false };
function view(shared = false): OrgProfileView {
  const scorecard = shareScorecard(computeScorecard([]), shared ? ALL_SHARED : none);
  return {
    displayName: "Local fixture", scorecard: { lifetime: scorecard, "12m": scorecard, "90d": scorecard },
    availability: shared ? null : "withheld", credentials: shared ? [] : "withheld",
    experience: shared ? [] : "withheld", today: "2026-11-08",
    fit: employerFitView(null, { orgHasRelationship: true }),
  };
}
const render = (v: OrgProfileView) => renderToStaticMarkup(<OrgProfileSections view={v} />);

describe("compact consent-filtered profile", () => {
  it("shows each wholly withheld part once, without expandable empty metrics or fit fields", () => {
    const html = render(view());
    expect(html.match(/status-not-shared/g)).toHaveLength(5);
    expect(html).not.toContain("<details");
    expect(html).not.toContain("Identity labels");
    expect(html).not.toContain("0 of 4 fields");
    expect(html).not.toContain("No verified shifts yet");
    expect(html).toContain("Political-fit answers are shared only when a worker chooses to.");
  });
  it("retains all field detail and the shared basis when fit is partially shared", () => {
    const v = view();
    v.fit.fields.identity = { shared: true, lines: ["Worker-authorized fixture label"] };
    v.fit.basis = SHARED_BASIS;
    const html = render(v);
    expect(html).toContain("1 of 4 fields shared");
    expect(html).toContain("<details");
    expect(html).toContain("Worker-authorized fixture label");
    expect(html).toContain("Party relationship");
    expect(html).toContain("Worker-authorized signals:");
  });
  it("distinguishes shared empty data from withheld data", () => {
    const html = render(view(true));
    expect(html).toContain("No credentials added.");
    expect(html).toContain("No experience yet");
    expect(html).toContain("No availability set yet.");
    expect(html).toContain("0 verified shifts");
    // Only fit is withheld; the empty scorecard remains available to expand.
    expect(html.match(/status-not-shared/g)?.length).toBeGreaterThanOrEqual(1);
    expect(html).toContain("No verified shifts yet");
  });
  it("does not turn absent hidden history into zero totals or a no-work claim", () => {
    const scorecard = view().scorecard.lifetime;
    expect(profileScorecardSummary(scorecard)).toBeNull();
    scorecard.shared.output = true;
    expect(profileScorecardSummary(scorecard)).toBe("View shared details");
    scorecard.showRate = { value: 0.9, formula: "worked / scheduled", numerator: null, denominator: null, evidence: "Counts not shared" };
    scorecard.shared.reliability = true;
    expect(profileScorecardSummary(scorecard)).toBe("90% show rate");
    expect(profileScorecardSummary(scorecard)).not.toMatch(/0 verified|0 doors|no work|shifts/i);
  });
});
