import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApplicantRecord } from "./ApplicantRecord";
import type { ApplicantPage } from "@/lib/applicant-view-data";
import { applicantJob } from "@/lib/applicants";
import { computeScorecard } from "@/lib/scorecard";
import { shareScorecard, ALL_SHARED } from "@/lib/shared-scorecard";
import { employerFitView } from "@/lib/political-fit";
vi.mock("@/components/HiringActions", () => ({ HiringActions: () => <button>Existing hiring action</button> }));
vi.mock("@/app/messages/actions", () => ({ startDirect: async () => {} }));

function fixture(): ApplicantPage {
  const scorecard = shareScorecard(computeScorecard([]), ALL_SHARED);
  const job = { id: "job", title: "Fixture job", type: "CANVASS" as const, status: "PUBLISHED" as const,
    startsAt: null, endsAt: null, requirements: {}, campaignDisclosure: null,
    jurisdiction: { state: "CO", rules: {} }, org: { approved: true } };
  return {
    engagement: { id: "engagement", status: "APPLIED", createdAt: new Date("2026-11-01"), inviteExpiresAt: null,
      worker: { id: "worker", displayName: "Fixture candidate", closedAt: null }, job },
    facts: { events: [{ id: "event", engagementId: "engagement", type: "APPLIED", reasonCode: null, note: null, createdAt: new Date("2026-11-01") }], inReview: false, offerExpiresAt: null },
    access: null, open: true, appJob: applicantJob(job), free: null, creds: [], snapshot: null, hired: false,
    profile: { displayName: "Fixture candidate", today: "2026-11-08", scorecard: { lifetime: scorecard, "12m": scorecard, "90d": scorecard }, availability: null, credentials: [], experience: [], fit: employerFitView(null, { orgHasRelationship: true }) },
  };
}
const render = (a: ApplicantPage) => renderToStaticMarkup(<ApplicantRecord applicant={a} now={new Date("2026-11-08")} invitation={<p>Existing invitation composer</p>} />);

describe("candidate record structure", () => {
  it("places the existing actions near the name, history before profile, and invitation after profile", () => {
    const html = render(fixture());
    expect(html.indexOf("Fixture candidate")).toBeLessThan(html.indexOf("Existing hiring action"));
    expect(html.indexOf("Existing hiring action")).toBeLessThan(html.indexOf('aria-label="History"'));
    expect(html.indexOf('aria-label="History"')).toBeLessThan(html.indexOf("What they share with you now"));
    expect(html.indexOf("What they share with you now")).toBeLessThan(html.indexOf("Existing invitation composer"));
    expect(html).not.toContain("For this job");
  });
  it("keeps the retained history and snapshot refusal while hiding unavailable live data and invitations", () => {
    const a = fixture(); a.open = false; a.profile = null; a.engagement.worker.closedAt = new Date("2026-11-07");
    const html = render(a);
    expect(html).toContain("This worker closed their account.");
    expect(html).toContain('aria-label="History"');
    expect(html).toContain("No copy was kept for this engagement.");
    expect(html).not.toContain("What they share with you now");
    expect(html).not.toContain("Existing invitation composer");
  });
  it("does not create an empty history section for older engagements without events", () => {
    const a = fixture(); a.facts = { ...a.facts, events: [] };
    expect(render(a)).not.toContain('class="section-title">History</h2>');
  });
  it("shows the comparison section only when dates or required credentials exist", () => {
    const a = fixture(); a.appJob.requirements.training = "Fixture training";
    expect(render(a)).toContain("For this job");
    expect(render(a)).toContain("Required credentials");
  });
  it("keeps a dated snapshot under a native, initially closed disclosure", () => {
    const a = fixture();
    a.snapshot = { kind: "application", capturedAt: "2026-11-01T12:00:00Z" } as ApplicantPage["snapshot"];
    const html = render(a);
    expect(html).toContain("When they applied · Nov 1, 2026</summary>");
    expect(html).not.toContain('<details open');
    expect(html).toContain("Exactly what you could see then. It never changes, even if they share less later.");
  });
});
