import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AssignTurfPanel } from "./AssignTurfPanel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock("@/components/TurfMap", () => ({ TurfMap: () => <div>map</div> }));

describe("AssignTurfPanel", () => {
  it("starts closed: one button, no shifts listed until asked", () => {
    const html = renderToStaticMarkup(<AssignTurfPanel shifts={[{ id: "s", worker: "Fixture Worker", jobTitle: "Fixture job", startsAt: "2026-11-17T15:00:00Z", endsAt: "2026-11-17T18:00:00Z", hasTurf: false, zoneId: null }]} center={null} />);
    expect(html).toContain("Assign turf");
    expect(html).not.toContain("Fixture Worker");
  });
});
