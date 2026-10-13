import { describe, expect, it, vi } from "vitest";

const { getSessionProfile } = vi.hoisted(() => ({ getSessionProfile: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionProfile }));
vi.mock("@/lib/db", () => ({ db: () => ({}) }));

const { apiWorker } = await import("./api-session");
const { ServiceUnavailableError } = await import("./outage");

describe("API guards during an outage", () => {
  it("fail (a 500) instead of answering 401, so the phone's sync retries rather than asking to sign in", async () => {
    getSessionProfile.mockRejectedValue(new ServiceUnavailableError("auth"));
    await expect(apiWorker()).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it("still answer 401 for a signed-out caller", async () => {
    getSessionProfile.mockResolvedValue(null);
    const r = await apiWorker();
    expect("error" in r && r.error.status).toBe(401);
  });
});
