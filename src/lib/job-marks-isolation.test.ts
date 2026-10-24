import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * P1.6, enforced: a worker's saved and hidden jobs are theirs alone. Nothing
 * that matches, ranks, scores or explains ever reads them, and nothing an
 * organization sees does either. Same shape as social-isolation.test.ts.
 */
const ALLOWED = [
  /^src\/lib\/job-marks(-data|-isolation\.test|\.test)?\.ts$/,
  /^src\/lib\/migration-grants\.test\.ts$/,
  /^src\/app\/jobs\/(page\.tsx|mark-actions\.ts)$/, // the worker's own feed and its mark action (its own file: the shared actions file is imported everywhere)
  /^src\/components\/(JobFeedCard|SwipeCard)\.tsx$/, // the card's Save and Hide
  /^src\/app\/zz-preview\//,
];
/** The marks' names: modules, models, Prisma accessors and relation fields. */
const MARKS = /\b(job-marks(-data)?|savedJobs?|dismissedJobs?|savedBy|dismissedBy|SavedJob|DismissedJob|loadMarks|markJob(Action)?|applyMarks|swipeOutcome)\b/;
/** Code that ranks, matches, scores or explains, and everything an organization is served. */
const GUARDED = /^src\/(lib\/(.*match.*|scorecard.*|political-fit.*|priority|metrics|jobs-data|jobs|hiring.*|desk.*|experience.*|applicants.*|invitations.*|engagements.*|org-profile.*)\.ts|components\/(FitSignals|ScorecardPanel|JobCard|OrgProfileSections)\.tsx|app\/(hiring|desk|workers|org|admin|api)\/.*\.tsx?)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}
const root = process.cwd();
const rel = (p: string) => relative(root, p).replace(/\\/g, "/");
const all = files(join(root, "src")).map(rel);
const source = (f: string) => readFileSync(join(root, f), "utf8");
function imports(f: string): string[] {
  const out: string[] = [];
  for (const m of source(f).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) {
    const spec = m[1];
    const base = spec.startsWith("@/") ? join(root, "src", spec.slice(2)) : spec.startsWith(".") ? join(root, dirname(f), spec) : null;
    if (!base) continue;
    for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
      if (existsSync(cand) && statSync(cand).isFile()) {
        out.push(rel(cand));
        break;
      }
    }
  }
  return out;
}
const isMarksFile = (f: string) => /^src\/lib\/job-marks(-data)?\.ts$/.test(f);

describe("job marks isolation (P1.6)", () => {
  it("only the feed, its card and its actions name the marks, their models or accessors", () => {
    const offenders = all.filter((f) => MARKS.test(source(f)) && !ALLOWED.some((re) => re.test(f)));
    expect(offenders).toEqual([]);
  });

  it("matching, scorecards, political fit, the feed's data layer, hiring and every organization view never reach them, directly or through imports", () => {
    const guarded = all.filter((f) => GUARDED.test(f));
    expect(guarded).toEqual(expect.arrayContaining(["src/lib/jobs-data.ts", "src/lib/scorecard.ts", "src/lib/priority.ts", "src/lib/applicants.ts", "src/components/OrgProfileSections.tsx"]));
    for (const start of guarded) {
      const seen = new Set<string>([start]);
      const queue = [start];
      while (queue.length) {
        const f = queue.shift()!;
        expect({ start, reaches: f, marks: isMarksFile(f) || (f !== start && MARKS.test(source(f))) }).toEqual({ start, reaches: f, marks: false });
        for (const next of imports(f)) {
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
    }
  });

  it("the feed's data layer takes no mark: order comes from the job, never from a save", () => {
    expect(source("src/lib/jobs-data.ts")).not.toMatch(/savedJob|dismissedJob|SavedJob|DismissedJob|loadMarks|applyMarks/);
  });

  it("would catch the ways a leak would look", () => {
    for (const s of ["include: { savedBy: true }", 'prisma["dismissedJob"]', 'import { loadMarks } from "@/lib/job-marks-data"', "worker.savedJobs"]) {
      expect({ s, caught: MARKS.test(s) }).toEqual({ s, caught: true });
    }
  });
});
