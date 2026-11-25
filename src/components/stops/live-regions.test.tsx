import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The forms' server actions and hooks, stubbed: what matters is the markup before anything has been said.
vi.mock("@/app/jobs/[jobId]/walkbooks/actions", () => ({ cutWalkbooksAction: async () => ({}), importAddressesAction: async () => ({}) }));
vi.mock("@/app/jobs/[jobId]/walkbooks/poll-actions", () => ({ addPollQuestionAction: async () => ({}), changePollQuestionAction: async () => ({}), staffRecordPollAction: async () => ({}) }));

/**
 * A screen reader announces a live region whose text changes; one added to the page already holding its message is
 * often not announced. So each form's status region is on the page from the start, empty (WCAG 4.1.3).
 */
describe("walkbook forms: the status region is there before anything is said", () => {
  it("cutting walkbooks", async () => {
    const { WalkbookCut } = await import("@/components/staff/WalkbookCut");
    expect(renderToStaticMarkup(<WalkbookCut jobId="j" imports={[{ id: "i", label: "file.csv", unassigned: 10 }]} />)).toMatch(/role="status"/);
    expect(renderToStaticMarkup(<WalkbookCut jobId="j" imports={[]} />)).toMatch(/role="status"/);
  });
  it("importing a file", async () => {
    const { WalkbookImport } = await import("@/components/staff/WalkbookImport");
    expect(renderToStaticMarkup(<WalkbookImport jobId="j" />)).toMatch(/role="status"/);
  });
});
