import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "not-found.tsx"), "utf8");
const header = readFileSync(join(__dirname, "../components/SiteHeader.tsx"), "utf8");

describe("the not-found page", () => {
  it("is the app's own page: a main landmark with a heading and a way on", () => {
    // Without it Next.js draws a bare "404" with no main landmark inside the shell (axe: landmark-one-main, region).
    expect(src).toMatch(/<ReadingPage head=\{<h1 className="page-title">Page not found<\/h1>\}>/);
    expect(src).toMatch(/<Link href=\{home\} className="btn-primary">Go to Home<\/Link>/);
    expect(src).toContain('title: "Page not found · Turfcut"');
  });

  it("never says whether the thing exists: a guard's 404 and a wrong address read the same", () => {
    // notFound() is how the app refuses a job, shift or conversation that is not this person's.
    const words = src.slice(src.indexOf("<p className=\"lead\">"), src.indexOf("</p>"));
    expect(words).toMatch(/may be wrong, or it may lead to something that was removed or that your account cannot see/);
    expect(words).not.toMatch(/permission|not allowed|forbidden|denied|private/i);
  });

  it("a conversation's own not-found page has a heading too", () => {
    const thread = readFileSync(join(__dirname, "messages/[conversationId]/not-found.tsx"), "utf8");
    expect(thread).toContain('<h1 className="empty-state-title">Conversation not found</h1>');
    expect(thread).toMatch(/<ReadingPage>/);
  });

  it("sends Home where the site's mark goes: landing signed out, Desk for an organization, Today for a worker", () => {
    expect(src).toContain('const home = !session ? "/" : isOrg ? "/desk" : "/dashboard";');
    expect(header).toContain('href={at(!signedIn ? "/" : isOrg ? "/desk" : "/dashboard")}');
    // A session that cannot be read (no database configured) is signed out, not a crash.
    expect(src).toContain("await getSessionProfile().catch(() => null)");
  });
});
