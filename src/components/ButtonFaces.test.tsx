import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ButtonFaces, type ButtonPhase } from "./ButtonFaces";
import { EMPTY_ART_KINDS, EmptyArt, EmptyState } from "./EmptyState";

/** The faces a screen reader and a sighted person get, for each phase. */
function faces(phase: ButtonPhase) {
  const html = renderToStaticMarkup(<ButtonFaces phase={phase} label="Apply" pendingLabel="Applying…" doneLabel="Applied" />);
  const spans = [...html.matchAll(/<span class="btn-face"([^>]*)>(.*?)<\/span>(?=<span class="btn-face"|<\/span>$)/g)];
  return spans.map(([, attrs, body]) => ({ shown: attrs.includes("data-on"), hidden: attrs.includes('aria-hidden="true"'), text: body.replace(/<[^>]+>/g, "") }));
}

describe("button faces (P1.2)", () => {
  it("shows exactly one face per phase, and hides the others from screen readers", () => {
    const want: Record<ButtonPhase, string> = { idle: "Apply", pending: "Applying…", done: "Applied" };
    for (const phase of ["idle", "pending", "done"] as const) {
      const f = faces(phase);
      expect(f).toHaveLength(3);
      const shown = f.filter((x) => x.shown);
      expect(shown.map((x) => x.text)).toEqual([want[phase]]);
      expect(shown[0].hidden).toBe(false);
      expect(f.filter((x) => !x.shown).every((x) => x.hidden)).toBe(true);
    }
  });

  it("keeps the spinner and check decorative", () => {
    const html = renderToStaticMarkup(<ButtonFaces phase="pending" label="Save" pendingLabel="Saving…" />);
    expect(html).toMatch(/<span class="btn-spinner" aria-hidden="true">/);
    expect(html).toMatch(/<svg class="btn-check"[^>]*aria-hidden="true"/);
  });
});

describe("empty states (P1.2)", () => {
  it("draws all eight, decorative, in theme colours only", () => {
    expect(EMPTY_ART_KINDS).toHaveLength(8);
    for (const kind of EMPTY_ART_KINDS) {
      const html = renderToStaticMarkup(<EmptyArt kind={kind} />);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain(`data-art="${kind}"`);
      expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|fill="(?!none)/i); // colours come from the stylesheet's tokens
      expect(html).toMatch(/class="(lime|ink|dim)/);
    }
  });

  it("keeps the words as the meaning: a title, a sentence, next steps", () => {
    const html = renderToStaticMarkup(
      <EmptyState art="shifts" title="No shifts scheduled" actions={<a href="/jobs">Find work</a>}>
        Once you&apos;re hired, shifts show up here.
      </EmptyState>,
    );
    expect(html).toContain('<p class="empty-state-title">No shifts scheduled</p>');
    expect(html).toContain('<p class="empty-state-body">');
    expect(html).toContain('href="/jobs"');
  });
});
