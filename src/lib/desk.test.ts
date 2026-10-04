import { describe, expect, it } from "vitest";
import { applicationsByJob, deskParts, shortOfHeadcount, weekAhead } from "./desk";

const d = (iso: string) => new Date(iso);

describe("the Desk", () => {
  it("shows each role only the queues its access reaches", () => {
    expect(deskParts("OWNER")).toEqual({ hiring: true, field: true, today: true, week: true, pay: true, readOnly: false });
    // Recruiters schedule (week ahead) but only read the field, so no field strip or field queue.
    expect(deskParts("RECRUITER")).toEqual({ hiring: true, field: false, today: false, week: true, pay: false, readOnly: false });
    expect(deskParts("SUPERVISOR")).toEqual({ hiring: false, field: true, today: true, week: true, pay: false, readOnly: false });
    expect(deskParts("FINANCE")).toEqual({ hiring: false, field: false, today: false, week: false, pay: true, readOnly: false });
    expect(deskParts("PUBLISHER")).toEqual({ hiring: false, field: false, today: false, week: false, pay: false, readOnly: true });
    expect(deskParts("COMPLIANCE").readOnly).toBe(true);
  });

  it("lists jobs short of headcount, soonest first", () => {
    const jobs = [
      { id: "a", title: "Later", headcount: 5, hired: 2, startsAt: d("2026-10-10") },
      { id: "b", title: "Full", headcount: 3, hired: 3, startsAt: d("2026-10-05") },
      { id: "c", title: "Sooner", headcount: 4, hired: 0, startsAt: d("2026-10-06") },
      { id: "e", title: "Overfilled", headcount: 2, hired: 3, startsAt: d("2026-10-06") },
      { id: "u", title: "Undated", headcount: 2, hired: 0, startsAt: null },
      { id: "n", title: "No headcount", headcount: null, hired: 0, startsAt: d("2026-10-05") },
    ];
    expect(shortOfHeadcount(jobs).map((j) => [j.id, j.short])).toEqual([["c", 4], ["a", 3], ["u", 2]]);
  });

  it("counts distinct workers scheduled this week against headcount", () => {
    const now = d("2026-10-04T12:00:00Z");
    const jobs = [{ id: "j1", title: "Drive", headcount: 3 }, { id: "j2", title: "Canvass", headcount: 2 }, { id: "j3", title: "Open-ended", headcount: null }];
    const shifts = [
      { jobId: "j1", workerId: "w1", startsAt: d("2026-10-05T15:00:00Z") },
      { jobId: "j1", workerId: "w1", startsAt: d("2026-10-06T15:00:00Z") }, // same worker twice
      { jobId: "j1", workerId: "w2", startsAt: d("2026-10-07T15:00:00Z") },
      { jobId: "j1", workerId: "w3", startsAt: d("2026-10-12T15:00:00Z") }, // past the week
      { jobId: "j2", workerId: "w4", startsAt: d("2026-10-03T15:00:00Z") }, // already past
    ];
    expect(weekAhead(jobs, shifts, now)).toEqual([
      { jobId: "j2", title: "Canvass", headcount: 2, scheduled: 0, shifts: 0, gap: 2 },
      { jobId: "j1", title: "Drive", headcount: 3, scheduled: 2, shifts: 3, gap: 1 },
      { jobId: "j3", title: "Open-ended", headcount: null, scheduled: 0, shifts: 0, gap: null },
    ]);
  });

  it("groups waiting applications by job, longest-waiting job first", () => {
    const g = applicationsByJob([
      { jobId: "j1", title: "Drive", appliedAt: d("2026-10-03") },
      { jobId: "j2", title: "Canvass", appliedAt: d("2026-10-01") },
      { jobId: "j1", title: "Drive", appliedAt: d("2026-09-30") },
    ]);
    expect(g).toEqual([
      { jobId: "j1", title: "Drive", count: 2, oldest: d("2026-09-30") },
      { jobId: "j2", title: "Canvass", count: 1, oldest: d("2026-10-01") },
    ]);
  });
});
