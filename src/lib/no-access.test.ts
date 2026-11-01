import { describe, expect, it } from "vitest";
import { withNoAccess } from "./no-access";

describe("withNoAccess", () => {
  it("adds the flag to a bare path", () => expect(withNoAccess("/dashboard")).toBe("/dashboard?noaccess=1"));
  it("keeps an existing query", () => expect(withNoAccess("/field?job=1")).toBe("/field?job=1&noaccess=1"));
  it("keeps a hash after the query", () => expect(withNoAccess("/desk#today")).toBe("/desk?noaccess=1#today"));
});
