import { describe, expect, it } from "vitest";
import { pipeline } from "./hiring";

const d = (s: string) => new Date(s);

describe("hiring pipeline", () => {
  const jobs = [
    { id: "a", title: "Drive A", status: "PUBLISHED" as const, headcount: 5, startsAt: d("2026-10-10") },
    { id: "b", title: "Drive B", status: "PAUSED" as const, headcount: null, startsAt: d("2026-10-06") },
    { id: "c", title: "Drive C", status: "PUBLISHED" as const, headcount: 2, startsAt: null },
  ];
  it("counts each stage from today's statuses; cancelled counts nowhere", () => {
    const rows = pipeline(jobs, [
      { jobId: "a", status: "APPLIED" }, { jobId: "a", status: "APPLIED" }, { jobId: "a", status: "INVITED" },
      { jobId: "a", status: "CLAIMED" }, { jobId: "a", status: "ACTIVE" }, { jobId: "a", status: "COMPLETED" },
      { jobId: "a", status: "CANCELLED" }, { jobId: "zzz", status: "APPLIED" },
    ]);
    expect(rows.find((r) => r.jobId === "a")).toMatchObject({ applied: 2, invited: 1, engaged: 2, completed: 1 });
    expect(rows.find((r) => r.jobId === "b")).toMatchObject({ applied: 0, offered: 0, invited: 0, engaged: 0, completed: 0, headcount: null });
  });
  it("puts jobs with applications waiting first, then the soonest start (undated last)", () => {
    const rows = pipeline(jobs, [{ jobId: "c", status: "APPLIED" }]);
    // A lapsed invitation counts nowhere; a live one counts as invited.
    const inv = pipeline(jobs, [
      { jobId: "c", status: "INVITED", inviteExpiresAt: new Date("2026-10-01T00:00:00Z") },
      { jobId: "c", status: "INVITED", inviteExpiresAt: new Date("2026-10-20T00:00:00Z") },
    ], new Date("2026-10-09T00:00:00Z"));
    expect(inv.find((r) => r.jobId === "c")!.invited).toBe(1);
    expect(rows.map((r) => r.jobId)).toEqual(["c", "b", "a"]);
  });
});
