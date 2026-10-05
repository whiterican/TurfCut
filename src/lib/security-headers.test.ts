import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

async function rules() {
  return (await nextConfig.headers!()) as { source: string; headers: { key: string; value: string }[] }[];
}

describe("security headers", () => {
  it("go on every response: no framing, no type sniffing, location for the app only", async () => {
    const all = (await rules()).find((r) => r.source === "/:path*");
    const h = Object.fromEntries(all!.headers.map((x) => [x.key, x.value]));
    expect(h["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Permissions-Policy"]).toContain("geolocation=(self)");
    expect(h["Permissions-Policy"]).toContain("camera=()");
  });

  it("leave the service worker's own policy last, so it wins where both match", async () => {
    const r = await rules();
    const sw = r.findIndex((x) => x.source === "/sw.js");
    expect(sw).toBeGreaterThan(r.findIndex((x) => x.source === "/:path*"));
    expect(r[sw].headers.find((x) => x.key === "Content-Security-Policy")?.value).toContain("script-src 'self'");
  });
});
