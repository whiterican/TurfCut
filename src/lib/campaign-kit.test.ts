import { describe, expect, it } from "vitest";
import { FACT_MAX, groupByKind, MAX_FACTS, nextPosition, RESOURCE_MAX, sourceUrlProblem, TITLE_MAX, validateFact, validateResource } from "./campaign-kit";

describe("supporting facts", () => {
  it("take a short claim and an optional web source", () => {
    const v = validateFact({ body: "  1,240 signatures were collected on Saturday.\n", sourceUrl: " https://yeson7.org/updates " });
    expect(v).toEqual({ ok: true, value: { body: "1,240 signatures were collected on Saturday.", sourceUrl: "https://yeson7.org/updates" } });
    expect(validateFact({ body: "Plain claim", sourceUrl: "" })).toEqual({ ok: true, value: { body: "Plain claim", sourceUrl: null } });
  });
  it("refuse blanks, overlong claims and links that aren't web links", () => {
    expect(validateFact({ body: "   ", sourceUrl: "" })).toMatchObject({ ok: false, errors: { body: expect.stringContaining("Write") } });
    expect(validateFact({ body: "x".repeat(FACT_MAX + 1), sourceUrl: "" })).toMatchObject({ ok: false, errors: { body: expect.stringContaining(String(FACT_MAX)) } });
    expect(sourceUrlProblem("javascript:alert(1)")).toMatch(/http/);
    expect(sourceUrlProblem("https://turfcut.com@evil.example/x")).toMatch(/login/);
    expect(sourceUrlProblem("not a url")).toMatch(/spaces|address/);
    expect(sourceUrlProblem(`https://x.example/${"a".repeat(600)}`)).toMatch(/characters/);
    expect(sourceUrlProblem("http://city.example/report.pdf")).toBeNull();
  });
});

describe("resources", () => {
  it("take a kind, an audience, a title and a body", () => {
    const v = validateResource({ kind: "SCRIPT", audience: "WORKERS", title: "  Door   script ", body: "Hi, I'm with Yes on 7…" });
    expect(v).toEqual({ ok: true, value: { kind: "SCRIPT", audience: "WORKERS", title: "Door script", body: "Hi, I'm with Yes on 7…" } });
  });
  it("refuse unknown kinds and audiences, blanks and overlong text, naming each field", () => {
    const v = validateResource({ kind: "MEMO", audience: "EVERYONE", title: "", body: "" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errors).sort()).toEqual(["audience", "body", "kind", "title"]);
    expect(validateResource({ kind: "FAQ", audience: "PUBLIC", title: "t".repeat(TITLE_MAX + 1), body: "b" })).toMatchObject({ ok: false, errors: { title: expect.stringContaining(String(TITLE_MAX)) } });
    expect(validateResource({ kind: "GUIDE", audience: "PUBLIC", title: "t", body: "b".repeat(RESOURCE_MAX + 1) })).toMatchObject({ ok: false, errors: { body: expect.stringContaining("8,000") } });
  });
  it("group by kind in a fixed order, each in position order, leaving empty kinds out", () => {
    const g = groupByKind([
      { kind: "GUIDE" as const, position: 2, id: "g2" },
      { kind: "SCRIPT" as const, position: 3, id: "s3" },
      { kind: "GUIDE" as const, position: 1, id: "g1" },
      { kind: "SCRIPT" as const, position: 1, id: "s1" },
    ]);
    expect(g.map((x) => [x.kind, x.items.map((i) => i.id)])).toEqual([["SCRIPT", ["s1", "s3"]], ["GUIDE", ["g1", "g2"]]]);
  });
});

describe("positions", () => {
  it("fill the first free slot and stop at the cap", () => {
    expect(nextPosition([], MAX_FACTS)).toBe(1);
    expect(nextPosition([1, 3], MAX_FACTS)).toBe(2);
    expect(nextPosition([1, 2, 3, 4, 5], MAX_FACTS)).toBeNull();
  });
});
