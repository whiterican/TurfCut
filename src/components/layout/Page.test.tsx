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
    expect(css).toMatch(/> \.tpl-body > \.tpl-panel \{\s*grid-column: 2;\s*grid-row: 1 \/ span 2;/);
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
