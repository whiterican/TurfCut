import { describe, expect, it } from "vitest";
import { URGENCY, applicationsByJob, byUrgency, deskParts, seatsWhenLabel, shortOfHeadcount, weekAhead } from "./desk";

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
      { jobId: "j1", workerId: "w1", startsAt: d("2026-10-05T15:00:00Z"), endsAt: d("2026-10-05T19:00:00Z") },
      { jobId: "j1", workerId: "w1", startsAt: d("2026-10-06T15:00:00Z"), endsAt: d("2026-10-06T19:00:00Z") }, // same worker twice
      { jobId: "j1", workerId: "w2", startsAt: d("2026-10-04T10:00:00Z"), endsAt: d("2026-10-04T14:00:00Z") }, // under way now
      { jobId: "j1", workerId: "w3", startsAt: d("2026-10-12T15:00:00Z"), endsAt: d("2026-10-12T19:00:00Z") }, // past the week
      { jobId: "j2", workerId: "w4", startsAt: d("2026-10-03T15:00:00Z"), endsAt: d("2026-10-03T19:00:00Z") }, // already over
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

describe("Needs you order and times", () => {
  it("puts what is going wrong now first, gaps to fill last, and keeps each kind's own order", () => {
    expect(Object.entries(URGENCY).sort((a, b) => a[1] - b[1]).map(([k]) => k)).toEqual(["late", "overdue", "review", "dueToday", "payApprove", "applications", "dispute", "short"]);
    const rows = [
      { key: "short-a", rank: URGENCY.short },
      { key: "apps-a", rank: URGENCY.applications },
      { key: "late-a", rank: URGENCY.late },
      { key: "short-b", rank: URGENCY.short },
      { key: "overdue", rank: URGENCY.overdue },
      { key: "late-b", rank: URGENCY.late },
    ];
    expect(byUrgency(rows).map((r) => r.key)).toEqual(["late-a", "late-b", "overdue", "apps-a", "short-a", "short-b"]);
    expect(rows[0].key).toBe("short-a"); // not sorted in place
  });
  it("says Starts for a job ahead and Started for one under way", () => {
    const now = d("2026-10-27T12:00:00Z");
    expect(seatsWhenLabel(d("2026-10-28T12:00:00Z"), now)).toBe("Starts");
    expect(seatsWhenLabel(d("2026-10-26T12:00:00Z"), now)).toBe("Started");
  });
});
