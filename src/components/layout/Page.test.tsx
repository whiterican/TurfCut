import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldPage, HeroPage, ListDetailPage, ListPage, ReadingPage, RecordPage, TEMPLATES, WorkspacePage } from "./Page";
import { PageSkeleton } from "@/components/PageSkeleton";

const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("page templates (redesign §4.2.2)", () => {
  it("each draws one main with its name, the heading slot first, and the content", () => {
    const pages = [
      ["reading", <ReadingPage key="r" head={<h1>T</h1>}>body</ReadingPage>],
      ["list", <ListPage key="l" head={<h1>T</h1>}>body</ListPage>],
      ["listDetail", <ListDetailPage key="ld" head={<h1>T</h1>}>body</ListDetailPage>],
      ["record", <RecordPage key="rc" head={<h1>T</h1>}>body</RecordPage>],
      ["workspace", <WorkspacePage key="w" head={<h1>T</h1>}>body</WorkspacePage>],
      ["field", <FieldPage key="f" head={<h1>T</h1>}>body</FieldPage>],
    ] as const;
    for (const [name, el] of pages) {
      const out = html(el);
      expect(out).toMatch(new RegExp(`^<main class="tpl" data-template="${name}"`));
      expect(out.indexOf('class="tpl-head"')).toBeLessThan(out.indexOf('class="tpl-main"'));
      expect(out.match(/<main/g)).toHaveLength(1);
    }
    expect(html(<HeroPage>x</HeroPage>)).toMatch(/^<main class="tpl" data-template="hero">x<\/main>$/);
    expect(TEMPLATES).toHaveLength(7);
  });

  it("an aside is an <aside> after the main column; an inspector is a labelled region, from 1280 on organization pages", () => {
    const aside = html(<RecordPage aside={<p>facts</p>}>body</RecordPage>);
    expect(aside).toContain('data-panel="aside"');
    expect(aside).toMatch(/class="tpl-main">body<\/div><aside class="tpl-panel"><p>facts<\/p><\/aside>/);
    const insp = html(<ListDetailPage org inspector={<p>row</p>}>list</ListDetailPage>);
    expect(insp).toContain('data-panel="inspector"');
    expect(insp).toContain('data-org="true"');
    expect(insp).toContain('<section class="tpl-panel" aria-label="Details">');
    expect(html(<WorkspacePage inspector={<p>row</p>}>t</WorkspacePage>)).toContain('data-org="true"');
    // No panel, no panel markup.
    expect(html(<ListPage>body</ListPage>)).not.toContain("tpl-panel");
  });

  it("a tail follows the panel in the markup (a phone shows it after the Apply panel), and panels carry their names", () => {
    const out = html(<RecordPage aside={<p>apply</p>} panelLabel="Your place on this job" tail={<p>full card</p>}>job</RecordPage>);
    expect(out).toMatch(/<div class="tpl-main">job<\/div><aside class="tpl-panel" aria-label="Your place on this job"><p>apply<\/p><\/aside><div class="tpl-tail"><p>full card<\/p><\/div>/);
    expect(html(<RecordPage org aside={<p>facts</p>}>x</RecordPage>)).toContain('data-org="true"');
    // Wide screens put the tail back under the main column, the panel spanning both.
    expect(css).toMatch(/> \.tpl-body:has\(> \.tpl-tail\) > \.tpl-panel \{\s*grid-row: 1 \/ span 2;/);
  });

  it("a foot is the page's last child, so it can stay at the foot of the screen while the page scrolls", () => {
    // A job's Apply button was sticky inside its own short section, where a sticky box has nowhere to go: it never stuck.
    const out = html(<RecordPage aside={<p>panel</p>} tail={<p>full card</p>} foot={<button>Apply</button>}>job</RecordPage>);
    expect(out).toMatch(/<div class="tpl-tail"><p>full card<\/p><\/div><\/div><div class="tpl-foot"><button>Apply<\/button><\/div><\/main>$/);
    expect(html(<RecordPage>job</RecordPage>)).not.toContain("tpl-foot");
    // Sticky above the dock; on the screen's edge from 768 (no dock); gone from 1280. Not 1024: a worker page is
    // one column until 1280 (the aside waits for it), so hiding the foot at 1024 would leave 1024 to 1279 with no bar.
    expect(css).toMatch(/\n  \.tpl-foot \{\s*@apply sticky z-10 xl:hidden;\s*bottom: var\(--dock-clearance\);/);
    expect(css).toMatch(/@media \(width >= 80rem\) \{\s*(?:\/\*[^*]*\*\/\s*)?\.tpl\[data-panel="aside"\]:not\(\[data-org\]\) \{/);
    // What Tab moves to is scrolled clear of the bar.
    expect(css).toMatch(/@media \(width < 80rem\) \{\s*html:has\(\.tpl > \.tpl-foot\):has\(\.tpl\):not\(:has\(\.thread-top\)\) \{\s*scroll-padding-bottom: calc\(var\(--dock-clearance\) \+ 8rem\);/);
    // The dock's own rule comes later in the file and is one class weaker: three :has/:not against two.
    const dockRule = "html:has(.tabbar):not(:has(.thread-top)) {";
    expect(css.split(dockRule)).toHaveLength(2);
    expect(css.slice(css.indexOf(dockRule), css.indexOf(dockRule) + 120)).toContain("scroll-padding-bottom: var(--dock-clearance);");
    expect(css).toMatch(/\.tpl-foot \{[^}]*@media \(width >= 48rem\) \{\s*bottom: 0;\s*padding-bottom: calc\(0\.5rem \+ env\(safe-area-inset-bottom\)\);/);
    // It bleeds to the page's gutters, whatever they are at this width.
    expect(css).toMatch(/\.tpl-foot \{[^}]*margin-inline: calc\(-1 \* var\(--tpl-gutter\)\);\s*padding: 0\.5rem var\(--tpl-gutter\);/);
    // The job page uses it for a worker with no place on the job, and keeps the aside's copy for 1280 and up.
    const job = readFileSync(join(__dirname, "../../app/jobs/[jobId]/page.tsx"), "utf8");
    expect(job).toContain("foot={joinFoot}");
    expect(job).toContain("const joinFoot = !engagement && canJoin(modes) && ownExclusions(pref, job).length === 0 ? (");
    expect(job).toContain('<div className="job-cta-bar hidden xl:block">');
    // The worker's own preferences are read once and decide both.
    expect(job.match(/loadLatestPreference\(/g)).toHaveLength(1);
  });

  it("a sticky panel is never taller than the window (a focused control inside stays reachable)", () => {
    const sticky = [...css.matchAll(/\{\s*(?:display: flex;\s*)?position: sticky;\s*top: calc\(var\(--site-header-h\) \+ 1rem\);([^}]*)\}/g)];
    expect(sticky.length).toBeGreaterThanOrEqual(3);
    for (const m of sticky) expect(m[1]).toMatch(/max-height: calc\(100dvh - var\(--site-header-h\) - 2rem\);\s*overflow-y: auto;/);
    // Beside the organization rail an aside waits for 1280, like the inspector.
    expect(css).toMatch(/@media \(width >= 80rem\) \{\s*\.tpl\[data-panel="aside"\]\[data-org\] \{/);
  });

  it("the stylesheet owns gutters, dock clearance and the inspector breakpoints", () => {
    expect(css).toMatch(/\.tpl \{[^}]*padding-bottom: calc\(var\(--dock-clearance\) \+ 2rem\);/);
    expect(css).toMatch(/\.tpl\[data-panel="inspector"\] > \.tpl-body > \.tpl-panel \{\s*display: none;/);
    // Worker inspector from 64rem; organization inspector only from 80rem.
    expect(css).toMatch(/@media \(width >= 64rem\) \{[\s\S]*?\.tpl\[data-panel="inspector"\]:not\(\[data-org\]\) > \.tpl-body > \.tpl-panel \{\s*display: flex;/);
    expect(css).toMatch(/@media \(width >= 80rem\) \{[^@]*?\.tpl\[data-panel="inspector"\]\[data-org\] > \.tpl-body \{/);
    expect(css).toMatch(/\.tpl\[data-template="reading"\] \{\s*--tpl-measure: var\(--measure-reading\);/);
  });

  it("a skeleton draws the same frame as its template, panel and all", () => {
    const sk = html(<PageSkeleton shape="detail" template="record" panel label="Loading job" />);
    expect(sk).toMatch(/^<main class="tpl" data-template="record" data-panel="aside"/);
    expect(sk).toContain('aria-busy="true"');
    expect(sk).toContain('aria-label="Loading job"');
    expect(html(<PageSkeleton shape="table" template="listDetail" panel org />)).toMatch(/data-panel="inspector" data-org="true"/);
    // Unframed (inside the staff console) stays a plain block.
    expect(html(<PageSkeleton shape="list" template="workspace" framed={false} />)).not.toContain("<main");
  });
});
