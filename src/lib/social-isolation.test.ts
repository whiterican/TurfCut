import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rule 4 and C1-Q14, enforced: nothing social (campaign profiles, posts,
 * pins, follows and likes; later reposts and replies) is ever read by
 * matching, scorecards, political fit, the job feed or any ranking.
 *
 * 1. Deny by default: only the files listed in ALLOWED may name the social
 *    modules, the social models or their Prisma accessors.
 * 2. Nothing the guarded files import, however indirectly, is a social file.
 */
const ALLOWED = [
  /^src\/lib\/campaign-(social|media|api|follow)(-data)?(\.test)?\.ts$/,
  /^src\/lib\/(social-isolation|migration-grants)\.test\.ts$/, // the guards themselves
  /^src\/lib\/job-brief-data\.ts$/, // the shift brief's talking points: the pinned posts, verbatim
  /^src\/app\/(c|campaigns|feed|api\/campaigns|api\/campaign|api\/feed)\//,
  /^src\/app\/shifts\/\[shiftId\]\/page\.tsx$/, // shows the brief's talking points (nothing it reads goes anywhere else)
  /^src\/app\/jobs\/\[jobId\]\/page\.tsx$/, // the campaign a job works for, with Follow (S2); the page ranks nothing
  /^src\/app\/dashboard\/page\.tsx$/, // Today's "Campaigns you're on" strip (S2.3); the page ranks nothing
  /^src\/app\/feed\//, // the worker's home feed (S2)
  /^src\/app\/zz-preview\//,
  /^src\/components\/campaign\//,
];
/** The social layer's names: modules, models, Prisma accessors and relation fields. */
const SOCIAL = /\b(campaign-(social|follow)(-data)?|campaign-media|campaign-api|job-brief-data|components\/campaign|campaignProfiles?|campaignPosts?|campaignPostRevisions?|deletedCampaignPosts|embeddedInPosts|campaignProfileId|campaignFollows?|postLikes?|Campaign(Post|Profile|PostRevision|Follow)|PostLike)\b/;
/** Code that ranks, matches, scores or explains: it must never reach the social layer. */
const GUARDED = /^src\/(lib\/(.*match.*|scorecard.*|political-fit.*|priority|metrics|jobs-data|jobs|hiring|desk.*|experience.*)\.ts|components\/(FitSignals|ScorecardPanel|JobFeedCard|JobCard)\.tsx)$/;

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

/** The project files a file imports (static and dynamic, "@/..." and relative). */
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

const isSocialFile = (f: string) => ALLOWED.slice(0, 1).concat(ALLOWED.slice(2)).some((re) => re.test(f));

describe("social isolation", () => {
  it("only the social layer's own files name its modules, models or accessors", () => {
    const offenders = all.filter((f) => SOCIAL.test(source(f)) && !ALLOWED.some((re) => re.test(f)));
    expect(offenders).toEqual([]);
  });

  it("the campaign side never reads who follows or who liked (S2): no follower or like rows, no counts of followers", () => {
    // Prisma's back-relations (CampaignProfile.followers, CampaignPost.likes) exist for the foreign keys only: nothing
    // outside the worker-side module reads them, and the organization's own pages get like totals through likeCounts
    // and nothing else. The worker's own state (followState, likedPostIds) is fine on the public pages: it answers for
    // the signed-in worker's rows only.
    const social = all.filter((f) => ALLOWED.some((re) => re.test(f)) && !/campaign-follow(-data)?\.ts$|\.test\.ts$/.test(f));
    const rows = /\b(followers|likes)\s*:|["'](followers|likes)["']\s*:|_count[\s\S]{0,80}?\b(followers|likes)\b|\.(campaignFollow|postLike)\b/;
    const orgSide = all.filter((f) => /^src\/(app\/(campaigns|api\/campaign)\/|lib\/campaign-(social|media|api)(-data)?\.ts$)/.test(f));
    const workerOnly = /\b(openFollows|followState|feedCampaigns|loadHomeFeed|likedPostIds|campaignsOn|setFollow|setLike)\b/;
    expect(social.filter((f) => rows.test(source(f)))).toEqual([]);
    expect(orgSide.filter((f) => workerOnly.test(source(f)))).toEqual([]);
  });

  it("matching, scorecards, political fit, the feed and hiring never reach it, directly or through imports", () => {
    const guarded = all.filter((f) => GUARDED.test(f));
    expect(guarded).toEqual(expect.arrayContaining(["src/lib/jobs-data.ts", "src/lib/political-fit.ts", "src/lib/scorecard.ts", "src/lib/priority.ts"]));
    for (const start of guarded) {
      const seen = new Set<string>([start]);
      const queue = [start];
      while (queue.length) {
        const f = queue.shift()!;
        expect({ start, reaches: f, social: isSocialFile(f) || (f !== start && SOCIAL.test(source(f)) && !ALLOWED[1].test(f)) }).toEqual({ start, reaches: f, social: false });
        for (const next of imports(f)) {
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
    }
  });

  it("would catch the ways a leak would look", () => {
    for (const s of [
      'include: { campaignProfile: { include: { posts: true } } }',
      "select: { campaignPosts: true }",
      'prisma["campaignPost"]',
      'import { x } from "@/lib/job-brief-data"',
      "deletedCampaignPosts: true",
    ]) expect({ s, caught: SOCIAL.test(s) }).toEqual({ s, caught: true });
  });
});
