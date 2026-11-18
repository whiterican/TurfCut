import { describe, expect, it } from "vitest";
import { scrub } from "./instrumentation";

describe("Sentry scrub", () => {
  it("drops the user, request data, cookies, headers and query strings, and console breadcrumbs", () => {
    const e = scrub<Parameters<typeof scrub>[0]>({
      user: { ip_address: "203.0.113.9", id: "u1" },
      request: { url: "https://app/auth/confirm?code=abc&next=/x", query_string: "code=abc", data: { password: "p" }, cookies: { sb: "t" }, headers: { cookie: "x" } },
      contexts: { nextjs: { request_path: "/auth/confirm?code=abc" } },
      breadcrumbs: [{ category: "console", message: "user {email}" }, { category: "fetch", data: { url: "https://x/api?token=1" } }],
    } as unknown as Parameters<typeof scrub>[0]);
    expect(e.user).toBeUndefined();
    expect(e.request).toEqual({ url: "https://app/auth/confirm" });
    expect((e.contexts as { nextjs: { request_path: string } }).nextjs.request_path).toBe("/auth/confirm");
    expect(e.breadcrumbs).toEqual([{ category: "fetch", data: { url: "https://x/api" } }]);
  });

  it("keeps a database error's type but never its text, which can quote the row it refused", () => {
    const e = scrub<Parameters<typeof scrub>[0]>({
      exception: { values: [{ type: "PrismaClientKnownRequestError", value: 'new row violates check constraint "x"\nDETAIL:  Failing row contains (Ada Lovelace, 555-0100, DEM).' }, { type: "Error", value: "plain failure" }] },
      message: "Key (sourceRecordId)=(V1) already exists",
    } as unknown as Parameters<typeof scrub>[0]);
    expect(e.exception?.values?.[0].type).toBe("PrismaClientKnownRequestError");
    expect(JSON.stringify(e)).not.toMatch(/Lovelace|555-0100|DEM|V1/);
    expect(e.exception?.values?.[1].value).toBe("plain failure");
  });
});
