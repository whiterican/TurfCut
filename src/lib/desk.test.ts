import { describe, expect, it } from "vitest";
import { URGENCY, applicationsByJob, byUrgency, deskParts, noCheckoutVisibility, seatsWhenLabel, setupRank, setupSteps, shortOfHeadcount, weekAhead } from "./desk";

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
    expect(Object.entries(URGENCY).sort((a, b) => a[1] - b[1]).map(([k]) => k)).toEqual(["paused", "late", "noCheckout", "overdue", "review", "dueToday", "payApprove", "applications", "dispute", "short", "setup"]);
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

describe("no check-out received on the Desk (P0 state truth)", () => {
  it("names for full field access, a count for read field access and the read-only Desk, nothing for finance", () => {
    expect(noCheckoutVisibility("OWNER")).toBe("names");
    expect(noCheckoutVisibility("SUPERVISOR")).toBe("names");
    // Recruiters read the field: a count, never names, on the Desk.
    expect(noCheckoutVisibility("RECRUITER")).toBe("count");
    expect(noCheckoutVisibility("COMPLIANCE")).toBe("count");
    expect(noCheckoutVisibility("PUBLISHER")).toBe("count");
    expect(noCheckoutVisibility("FINANCE")).toBeNull();
    // A custom role follows its grants: read field access is a count whatever else it holds.
    expect(noCheckoutVisibility({ role: "CUSTOM", grants: { desk: "full", field: "full" } })).toBe("names");
    expect(noCheckoutVisibility({ role: "CUSTOM", grants: { desk: "full", field: "read" } })).toBe("count");
    expect(noCheckoutVisibility({ role: "CUSTOM", grants: { desk: "full", field: "read", pay: "full" } })).toBe("count");
    expect(noCheckoutVisibility({ role: "CUSTOM", grants: { desk: "full", pay: "full" } })).toBeNull();
  });
});


describe("setupSteps: what's left before the first published job", () => {
  const fresh = { approved: false, approvedAt: null, contractorTermsSignedAt: null, classificationReviewedAt: null };
  const done = { approved: true, approvedAt: new Date("2026-10-01"), contractorTermsSignedAt: new Date("2026-10-01"), classificationReviewedAt: new Date("2026-10-01") };
  const keys = (...a: Parameters<typeof setupSteps>) => setupSteps(...a).map((s) => s.key);

  it("an owner of a new organization: approval, terms, review and a first job, in that order", () => {
    expect(keys(fresh, 0, "OWNER")).toEqual(["setup-approval", "setup-terms", "setup-review", "setup-first-job"]);
    expect(setupSteps(fresh, 0, "OWNER")[3]).toMatchObject({ href: "/jobs/new", action: "Start a job" });
  });

  it("each step only for a role that can act on it or read its page", () => {
    // Compliance records the review; it can't sign terms or create jobs.
    expect(keys(fresh, 0, "COMPLIANCE")).toEqual(expect.arrayContaining(["setup-review"]));
    expect(keys(fresh, 0, "COMPLIANCE")).not.toContain("setup-terms");
    // Finance acts on none of them.
    expect(keys(fresh, 0, "FINANCE").filter((k) => k !== "setup-approval")).toEqual([]);
    // A recruiter can start the first job; a publisher (publishes, doesn't create) can't.
    expect(keys(fresh, 0, "RECRUITER")).toContain("setup-first-job");
    expect(keys(fresh, 0, "PUBLISHER")).not.toContain("setup-first-job");
  });

  it("a recruiter, who publishes but can't clear the gate, is told why, with a link only to a page they can read", () => {
    const r = setupSteps(fresh, 3, "RECRUITER");
    expect(r.map((x) => x.key)).toEqual(["setup-approval", "setup-terms", "setup-review"]);
    for (const x of r.slice(1)) expect(x).toMatchObject({ state: "blocked", tag: "Blocked", href: "/org/settings" });
    expect(r[1].title).toBe("Jobs can't publish yet: contractor terms not signed");
    // A custom role that publishes but can't read settings is sent to its jobs, which list each job's blockers.
    const noSettings = setupSteps(fresh, 3, { role: "CUSTOM", grants: { jobsEdit: "full", jobs: "full" } });
    expect(noSettings.map((x) => [x.key, x.href])).toEqual([["setup-approval", "/jobs"], ["setup-terms", "/jobs"], ["setup-review", "/jobs"]]);
    expect(noSettings[0]).toMatchObject({ title: "Jobs can't publish yet: waiting for Turfcut approval", state: "blocked" });
    // A withdrawn approval still comes first for them: a pause.
    const paused = setupSteps({ ...done, approved: false }, 3, { role: "CUSTOM", grants: { jobsEdit: "full", jobs: "full" } });
    expect(paused).toEqual([expect.objectContaining({ key: "setup-approval", title: "Turfcut withdrew the approval", href: "/jobs" })]);
    expect(setupRank(paused[0])).toBe(URGENCY.paused);
    // …and one that can read neither gets no row it couldn't follow.
    expect(setupSteps(fresh, 3, { role: "CUSTOM", grants: { jobsEdit: "full" } })).toEqual([]);
    // Owners and compliance still get their own "To do" rows, not Blocked ones.
    expect(setupSteps(fresh, 3, "OWNER").filter((x) => x.key !== "setup-approval").every((x) => x.state === "pending")).toBe(true);
    expect(setupSteps(fresh, 3, "COMPLIANCE").find((x) => x.key === "setup-review")).toMatchObject({ state: "pending", tag: "To do" });
    // Roles that don't publish aren't told about the gate at all.
    expect(setupSteps(fresh, 3, "FINANCE").map((x) => x.key)).toEqual(["setup-approval"]);
  });

  it("the first-job row says publishing is a separate step", () => {
    expect(setupSteps(done, 0, "OWNER")[0].sub).toBe("Start a draft. You can publish it after the checks pass.");
  });

  it("nothing once the gate is complete and a job exists (a draft counts)", () => {
    expect(keys(done, 1, "OWNER")).toEqual([]);
    expect(keys(done, 0, "OWNER")).toEqual(["setup-first-job"]);
  });

  it("a withdrawn approval reads as paused, not as waiting", () => {
    const s = setupSteps({ ...done, approved: false }, 3, "OWNER");
    expect(s).toEqual([expect.objectContaining({ key: "setup-approval", title: "Turfcut withdrew the approval", state: "blocked" })]);
  });

  it("setup ranks after every kind of live work; a withdrawn approval before all of it", () => {
    expect(Math.max(...Object.entries(URGENCY).filter(([k]) => k !== "setup").map(([, v]) => v))).toBeLessThan(URGENCY.setup);
    const [withdrawn] = setupSteps({ ...done, approved: false }, 3, "OWNER");
    expect(setupRank(withdrawn)).toBeLessThan(URGENCY.late);
    expect(setupSteps(fresh, 0, "OWNER").map(setupRank)).toEqual([URGENCY.setup, URGENCY.setup, URGENCY.setup, URGENCY.setup]);
  });

  it("the review step needs the settings page too: a custom role with compliance alone isn't sent where it can't go", () => {
    const complianceOnly = { role: "CUSTOM" as const, grants: { compliance: "full" as const } };
    expect(keys(fresh, 0, complianceOnly)).not.toContain("setup-review");
    expect(keys(fresh, 0, { role: "CUSTOM" as const, grants: { compliance: "full" as const, orgSettings: "read" as const } })).toContain("setup-review");
  });
});
