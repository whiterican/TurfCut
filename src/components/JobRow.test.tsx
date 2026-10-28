import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JobRow } from "./JobRow";
import type { FeedJob } from "./JobFeedCard";

const job: FeedJob = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Denver Ballot Initiative - Signature Drive",
  type: "PETITION",
  startsAt: new Date("2026-10-24T00:00:00Z"),
  endsAt: new Date("2026-10-25T00:00:00Z"),
  compensationMethod: "HOURLY",
  payRateCents: 2500,
  geography: { city: "Denver", state: "CO" },
  campaignDisclosure: { campaignType: "ballot", affiliation: "nonpartisan", message: "Yes on 1" },
  org: { name: "Front Range Circulators", approved: true },
};

describe("JobRow (F02)", () => {
  it("shows the feed card's facts in the card's order: organization and place with the approval mark, title, dates and type, pay", () => {
    const html = renderToStaticMarkup(<JobRow j={job} />);
    const text = html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
    const order = ["Front Range Circulators · Denver, CO", "Approved org", "Denver Ballot Initiative", "Oct 24 – Oct 25", "Petition circulation", "$25/hr"].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain(`href="/jobs/${job.id}"`);
    expect(html).toContain('class="job-row"');
  });

  it("names the affiliation in words beside the type, and carries a status chip only when given one", () => {
    const html = renderToStaticMarkup(<JobRow j={job} status={{ label: "Applied", state: "pending" }} />);
    expect(html).toContain("Petition circulation · Nonpartisan");
    expect(html).toContain('data-state="pending"');
    expect(html).toMatch(/class="status status-pending"[^>]*>.*Applied</);
    expect(renderToStaticMarkup(<JobRow j={{ ...job, startsAt: null, endsAt: null }} />)).toContain("Dates to be set");
    expect(renderToStaticMarkup(<JobRow j={{ ...job, org: { name: "New Org", approved: false } }} />)).not.toContain("Approved org");
    const canvass = renderToStaticMarkup(<JobRow j={{ ...job, type: "CANVASS", campaignDisclosure: { campaignType: "candidate", campaignName: "Jo Ortiz for Council", affiliation: "democratic", message: "Vote Jo" } }} />);
    expect(canvass).toContain("Candidate: Jo Ortiz for Council");
    expect(canvass.indexOf("Candidate: Jo Ortiz")).toBeLessThan(canvass.indexOf("Candidate campaign canvassing · Democratic party"));
  });

  it("says when a category is still in development on its own line (the meta line truncates on phones), and nothing for a built one", () => {
    const canvass = renderToStaticMarkup(<JobRow j={{ ...job, type: "CANVASS", campaignDisclosure: { campaignType: "candidate", campaignName: "Jo Ortiz for Council", affiliation: "democratic", message: "Vote Jo" } }} />);
    expect(canvass).toMatch(/Candidate campaign canvassing · Democratic party<\/span><span class="block[^"]*">In development<\/span>/);
    expect(renderToStaticMarkup(<JobRow j={job} />)).not.toContain("In development");
  });
});
