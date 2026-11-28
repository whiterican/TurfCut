import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/jobs/actions", () => ({ offerApplication: async () => {}, reviewApplication: async () => {}, withdrawInvitation: async () => {} }));
vi.mock("@/components/ActionButton", () => ({ ActionButton: ({ label }: { label: string }) => <button>{label}</button> }));
vi.mock("@/components/NotSelectedForm", () => ({ NotSelectedForm: ({ label = "Not selected" }: { label?: string }) => <button>{label}</button> }));

const { HiringActions } = await import("./HiringActions");

const REASON = "Counsel approval for Denver, CO (rules v1) expired on 2026-10-19.";
const base = { jobId: "job", jobStatus: "PUBLISHED" as const, engagementId: "e1", inReview: false, offerExpiresAt: null };
const lapsedOffer = new Date("2020-01-01T00:00:00Z");

describe("an organization's next steps while hiring is paused on the job", () => {
  it("an application: offer, review and not selected while hiring is open", () => {
    const html = renderToStaticMarkup(<HiringActions {...base} status="APPLIED" />);
    expect(html).toContain("Send offer");
    expect(html).toContain("Mark in review");
    expect(html).toContain("Not selected");
    expect(html).not.toContain("Hiring is paused");
  });

  it("an application: no offer while paused, with the reason; review and not selected stay", () => {
    const html = renderToStaticMarkup(<HiringActions {...base} status="APPLIED" hiringPaused={[REASON]} />);
    expect(html).not.toContain("Send offer");
    expect(html).toContain(`Hiring is paused on this job: ${REASON}`);
    expect(html).toContain("Mark in review");
    expect(html).toContain("Not selected");
  });

  it("a lapsed offer: no new offer while paused, and it can still be closed", () => {
    const open = renderToStaticMarkup(<HiringActions {...base} status="OFFERED" offerExpiresAt={lapsedOffer} />);
    expect(open).toContain("Send a new offer");
    const paused = renderToStaticMarkup(<HiringActions {...base} status="OFFERED" offerExpiresAt={lapsedOffer} hiringPaused={[REASON]} />);
    expect(paused).not.toContain("Send a new offer");
    expect(paused).toContain("Hiring is paused on this job");
    expect(paused).toContain("Close as not selected");
  });

  it("an offer still out: says the worker can't accept until the pause clears", () => {
    const soon = new Date(Date.now() + 5 * 3_600_000);
    const paused = renderToStaticMarkup(<HiringActions {...base} status="OFFERED" offerExpiresAt={soon} hiringPaused={[REASON]} />);
    expect(paused).toContain("Offer sent, waiting on the worker");
    expect(paused).toContain(`Hiring is paused on this job: ${REASON} The worker can accept once`);
    expect(paused).toContain("Withdraw the offer");
    expect(renderToStaticMarkup(<HiringActions {...base} status="OFFERED" offerExpiresAt={soon} />)).not.toContain("Hiring is paused");
  });

  it("a closed job says nothing about a pause: only the close-out remains", () => {
    const html = renderToStaticMarkup(<HiringActions {...base} jobStatus="CLOSED" status="APPLIED" hiringPaused={[REASON]} />);
    expect(html).not.toContain("Hiring is paused");
    expect(html).not.toContain("Send offer");
    expect(html).toContain("Not selected");
  });
});
