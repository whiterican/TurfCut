import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ getSiteUrl: () => "https://turfcut.example" }));
vi.mock("@/lib/campaign-media", () => ({ mediaUrl: (k: string | null) => (k ? `https://cdn.example/${k}` : null) }));
const { campaignPreview, directoryJson, profileJson } = await import("./campaign-api");

const base = { handle: "frontrange", displayName: "Front Range Circulators", bio: "Petition circulators in Denver.", avatarKey: null, headerKey: null };

describe("the Verified mark in what the public reads (M10.5)", () => {
  it("says so in the profile and directory JSON, and says nothing extra when unverified", () => {
    const row = { id: "i", orgId: "o", ...base, publishedAt: new Date("2026-10-01T00:00:00Z"), createdAt: new Date(), updatedAt: new Date() };
    expect(profileJson({ ...row, verifiedAt: new Date("2026-10-20T00:00:00Z") }).verified).toBe(true);
    expect(profileJson({ ...row, verifiedAt: null }).verified).toBe(false);
    const dir = { id: "i", ...base, lastPostAt: null, activeAt: new Date(), hiring: 0 };
    expect(directoryJson({ ...dir, verified: true }).verified).toBe(true);
    expect(directoryJson({ ...dir, verified: false }).verified).toBe(false);
  });

  it("puts it after the handle in a profile's shared-link title, where the campaign's own words can't reach, and never in a post's preview", () => {
    expect(campaignPreview({ ...base, verified: true }).title).toBe("Front Range Circulators (@frontrange) · Verified on Turfcut");
    expect(campaignPreview({ ...base, verified: true }).openGraph.title).toBe("Front Range Circulators (@frontrange) · Verified on Turfcut");
    expect(campaignPreview({ ...base, verified: true }).description).toBe("Petition circulators in Denver.");
    expect(campaignPreview({ ...base, verified: false }).title).toBe("Front Range Circulators (@frontrange)");
    expect(campaignPreview({ ...base }).title).toBe("Front Range Circulators (@frontrange)");
    // A bio (or a name) that says "Verified" is only ever its own words.
    expect(campaignPreview({ ...base, bio: "Verified campaign account. Hi.", verified: false }).title).not.toMatch(/Verified on Turfcut/);
    expect(campaignPreview({ ...base, verified: true }, { id: "p", body: "Sign here." }).title).toBe("Front Range Circulators (@frontrange) on Turfcut");
  });
});
