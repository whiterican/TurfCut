import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rule 4 and C1-Q14, enforced: nothing social (campaign profiles, posts,
 * pins, and in S2 follows, likes, reposts, replies) is ever read by
 * matching, scorecards, political fit or ranking. Deny by default: only the
 * files listed here may touch the social modules or the social tables.
 */
const ALLOWED = [
  /^src\/lib\/campaign-social(-data)?(\.test)?\.ts$/,
  /^src\/lib\/(social-isolation|migration-grants)\.test\.ts$/, // the guards themselves
  /^src\/lib\/job-brief-data\.ts$/, // the shift brief's talking points (verbatim pinned posts)
  /^src\/app\/(c|campaigns|api\/campaigns|api\/campaign)\//,
  /^src\/app\/shifts\/\[shiftId\]\//, // shows the brief
  /^src\/app\/zz-preview\//,
  /^src\/components\/campaign\//,
];
// The social modules, the Prisma accessors and the model names (not the access-map area names, which only gate pages).
const SOCIAL = /campaign-social|\.(campaignPost|campaignProfile|campaignPostRevision|campaignPosts|campaignProfiles)\b|\bCampaign(Post|Profile|PostRevision)\b|campaignProfileId/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe("social isolation", () => {
  const root = process.cwd();
  const all = files(join(root, "src")).map((p) => relative(root, p).replace(/\\/g, "/"));
  it("only the social layer's own files mention its modules or tables", () => {
    const offenders = all.filter((f) => SOCIAL.test(readFileSync(join(root, f), "utf8")) && !ALLOWED.some((re) => re.test(f)));
    expect(offenders).toEqual([]);
  });
  it("matching, scorecards and political fit never do", () => {
    const guarded = all.filter((f) => /(match|scorecard|political-fit|ranking|priority)/.test(f));
    expect(guarded.length).toBeGreaterThan(0);
    for (const f of guarded) expect({ f, social: SOCIAL.test(readFileSync(join(root, f), "utf8")) }).toEqual({ f, social: false });
  });
});
