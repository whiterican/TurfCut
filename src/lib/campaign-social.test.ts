import { describe, expect, it } from "vitest";
import { charCount, decodeCursor, embedProblem, embedState, encodeCursor, handleProblem, linkParts, normalizeHandle, POST_MAX, validatePostBody, validateProfile } from "./campaign-social";

describe("campaign profiles", () => {
  it("normalizes and checks handles", () => {
    expect(normalizeHandle(" @Yes_On_7 ")).toBe("yes_on_7");
    expect(handleProblem("yes_on_7")).toBeNull();
    expect(handleProblem("ab")).toMatch(/3 to 30/);
    expect(handleProblem("has space")).toMatch(/3 to 30/);
    expect(handleProblem("x".repeat(31))).toMatch(/3 to 30/);
    expect(handleProblem("admin")).toMatch(/reserved/);
    expect(handleProblem("turfcut_news")).toMatch(/reserved/);
  });

  it("validates the editor's fields and keeps the bio's words as written", () => {
    const ok = validateProfile({ handle: "@Yes_On_7", displayName: "  Yes on  7 ", bio: "Line one  \r\n\r\n\r\n\r\nLine two\n" });
    expect(ok).toEqual({ ok: true, value: { handle: "yes_on_7", displayName: "Yes on 7", bio: "Line one\n\nLine two" } });
    expect(validateProfile({ handle: "ok_handle", displayName: "", bio: "" })).toMatchObject({ ok: false, errors: { displayName: expect.any(String) } });
    expect(validateProfile({ handle: "ok_handle", displayName: "x", bio: "y".repeat(4001) })).toMatchObject({ ok: false, errors: { bio: expect.any(String) } });
  });
});

describe("posts", () => {
  it("counts characters as the database does (an emoji is one)", () => {
    expect(charCount("✊🏽")).toBe(2);
    expect(validatePostBody("🗳️".repeat(250)).ok).toBe(true);
    expect(validatePostBody("x".repeat(POST_MAX)).ok).toBe(true);
    expect(validatePostBody("x".repeat(POST_MAX + 1))).toMatchObject({ ok: false, error: expect.stringMatching(/501/) });
    expect(validatePostBody("   \n ")).toMatchObject({ ok: false });
    expect(validatePostBody(42)).toMatchObject({ ok: false });
  });

  it("turns only web links into links and keeps everything else as text", () => {
    expect(linkParts("Sign up: https://yeson7.org/vol. Thanks!")).toEqual([
      { kind: "text", text: "Sign up: " },
      { kind: "link", text: "https://yeson7.org/vol", href: "https://yeson7.org/vol" },
      { kind: "text", text: ". Thanks!" },
    ]);
    expect(linkParts("javascript:alert(1) <b>hi</b>")).toEqual([{ kind: "text", text: "javascript:alert(1) <b>hi</b>" }]);
  });

  it("round-trips feed cursors and refuses junk", () => {
    const p = { createdAt: new Date("2026-10-11T12:00:00.000Z"), id: "40000000-0000-0000-0000-000000000001" };
    expect(decodeCursor(encodeCursor(p))).toEqual(p);
    expect(decodeCursor("nope")).toBeNull();
    expect(decodeCursor(Buffer.from("2026-10-11|not-a-uuid").toString("base64url"))).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });

  it("embeds only the organization's own published jobs, and shows them as they are now", () => {
    expect(embedProblem({ orgId: "o1", status: "PUBLISHED" }, "o1")).toBeNull();
    expect(embedProblem({ orgId: "o2", status: "PUBLISHED" }, "o1")).toMatch(/your organization/);
    expect(embedProblem({ orgId: "o1", status: "DRAFT" }, "o1")).toMatch(/published/);
    expect(embedProblem(null, "o1")).toMatch(/your organization/);
    const now = new Date("2026-10-11T12:00:00Z");
    expect(embedState({ status: "PUBLISHED", endsAt: null }, now)).toBe("open");
    expect(embedState({ status: "PUBLISHED", endsAt: new Date("2026-10-01") }, now)).toBe("closed");
    expect(embedState({ status: "PAUSED", endsAt: null }, now)).toBe("paused");
    expect(embedState({ status: "CLOSED", endsAt: null }, now)).toBe("closed");
  });
});
