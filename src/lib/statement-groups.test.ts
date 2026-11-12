import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { groupLinesByJob, jobAnchor, type JobTotal } from "./statement-groups";

const line = (id: string, jobId: string | null, title: string | null = null) => ({ id, jobId, title });
const titleOf = (l: { title: string | null }) => l.title ?? "Other pay";

describe("a statement's lines under their jobs", () => {
  const totals: JobTotal[] = [
    { jobId: "b", title: "Bigger job", grossCents: 50000, feeCents: 5000, lineCount: 2 },
    { jobId: null, title: "Other pay", grossCents: 2000, feeCents: 0, lineCount: 1 },
    { jobId: "a", title: "A job", grossCents: 1000, feeCents: 100, lineCount: 1 },
  ];
  const lines = [line("1", "a"), line("2", "b"), line("3", null), line("4", "b"), line("5", "b")];

  it("follows the order of the statement's own per-job totals, and keeps each job's lines in recorded order", () => {
    const g = groupLinesByJob(lines, totals, titleOf);
    expect(g.map((x) => x.title)).toEqual(["Bigger job", "Other pay", "A job"]);
    expect(g.map((x) => x.lines.map((l) => l.id))).toEqual([["2", "4", "5"], ["3"], ["1"]]);
  });

  it("carries the statement's totals untouched: a withdrawn line is listed but the figures are not re-added", () => {
    const [bigger] = groupLinesByJob(lines, totals, titleOf);
    expect(bigger.lines).toHaveLength(3); // three listed, one of them withdrawn in the month
    expect({ gross: bigger.grossCents, fee: bigger.feeCents, count: bigger.lineCount }).toEqual({ gross: 50000, fee: 5000, count: 2 });
  });

  it("lists every line exactly once", () => {
    const g = groupLinesByJob(lines, totals, titleOf);
    expect(g.flatMap((x) => x.lines.map((l) => l.id)).sort()).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("puts a job with no total of its own (every line withdrawn in the month) last, with zeros and its own title", () => {
    const g = groupLinesByJob([...lines, line("6", "z", "Withdrawn job")], totals, titleOf);
    expect(g.at(-1)).toMatchObject({ jobId: "z", title: "Withdrawn job", grossCents: 0, feeCents: 0, lineCount: 0, anchor: "lines-z" });
    expect(g.at(-1)!.lines.map((l) => l.id)).toEqual(["6"]);
  });

  it("drops a total that has no line to show, and gives nothing for no lines", () => {
    expect(groupLinesByJob([line("1", "a")], totals, titleOf).map((x) => x.jobId)).toEqual(["a"]);
    expect(groupLinesByJob([], totals, titleOf)).toEqual([]);
  });

  it("names the anchor after the job, or 'other' for pay outside any job", () => {
    expect(jobAnchor("abc")).toBe("lines-abc");
    expect(jobAnchor(null)).toBe("lines-other");
    expect(groupLinesByJob(lines, totals, titleOf).map((x) => x.anchor)).toEqual(["lines-b", "lines-other", "lines-a"]);
  });
});

describe("the statement page uses the groups", () => {
  const view = readFileSync(join(__dirname, "../components/StatementView.tsx"), "utf8");
  it("groups only when the month has more than one job, and still shows the month's Recorded total once", () => {
    expect(view).toMatch(/groups\.length > 1/);
    expect(view.match(/label: "Recorded"/g)).toHaveLength(1);
    expect(view).toMatch(/Recorded, all jobs/);
  });
  it("links each By campaign row to its lines when they are grouped", () => {
    expect(view).toMatch(/href=\{`#\$\{jobAnchor\(c\.jobId\)\}`\}/);
  });
  it("gives each group the anchor the link points at, and the statement's own figures as its subtotal", () => {
    expect(view).toMatch(/\{groups\.map\(\(g\) => \(\s*<div key=\{g\.anchor\} id=\{g\.anchor\}/);
    expect(view).toMatch(/<LinesTable lines=\{g\.lines\}[^>]*total=\{\{ label: "Subtotal", grossCents: g\.grossCents, feeCents: g\.feeCents \}\}/);
    expect(view).toMatch(/grouped \? \(\s*<>\s*\{groups\.map/);
  });
  it("counts a job's lines by the same rule as the month's totals", () => {
    const data = readFileSync(join(__dirname, "statements-data.ts"), "utf8");
    expect(data).toMatch(/const countedAt = closedAt \?\? now;\s*lines\.forEach\(\(l, i\) => \{\s*const v = voidedAt\(f\.recorded\[i\]\);\s*if \(v && v <= countedAt\) return;/);
    expect(data).toMatch(/const live = f\.recorded\.filter\(\(l\) => \{\s*const v = voidedAt\(l\);\s*return !v \|\| v > at;/);
  });
});
