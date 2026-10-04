import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DashboardError from "./error";
import { ViewerKindProvider, type ViewerKind } from "@/components/ViewerKind";

const render = (kind: ViewerKind) =>
  renderToStaticMarkup(
    <ViewerKindProvider kind={kind}>
      <DashboardError error={Object.assign(new Error("relation \"PayoutEvent\" does not exist"), { digest: "123" })} retry={vi.fn()} />
    </ViewerKindProvider>
  );

describe("dashboard error boundary", () => {
  it("is a recoverable alert with a retry, never the raw error", () => {
    for (const kind of ["worker", "org", "none"] as const) {
      const html = render(kind);
      expect(html).toContain('role="alert"');
      expect(html).toContain("Try again");
      expect(html).not.toContain("PayoutEvent");
    }
  });
  it("speaks to a worker about their day, with a way to their shifts", () => {
    const html = render("worker");
    expect(html).toContain("Today didn&#x27;t load");
    expect(html).toContain('href="/shifts"');
  });
  it("speaks to an organization about its overview, with a way to its jobs", () => {
    const html = render("org");
    expect(html).toContain("Operations didn&#x27;t load");
    expect(html).toContain('href="/jobs"');
    expect(html).not.toContain('href="/shifts"');
  });
});
