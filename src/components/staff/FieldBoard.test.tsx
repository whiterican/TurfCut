import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ShiftState } from "@/lib/field-day";
import type { FieldRow } from "@/lib/field-view";
import { FieldBoard } from "./FieldBoard";

vi.mock("@/components/staff/FieldLive", () => ({ LiveGroupFigure: ({ fallback }: { fallback: number }) => <>{fallback}</> }));

const now = Date.now();
const state = (o: Partial<ShiftState> = {}): ShiftState => ({
  cancelled: false, checkedInAt: new Date(now - 3_600_000), checkedOutAt: null, paused: false, packetsOut: [], packetsReturned: [], packetsHeld: [],
  signatures: 3, doors: 0, contacts: 0, batchCounted: false, appCounts: null, closeout: null, atStaging: null,
  sharingArea: true, area: { lat: 39.735, lng: -104.995, at: new Date(now - 600_000) }, ...o,
});
const row = (o: Partial<ShiftState> = {}, endsAt = new Date(now + 3_600_000)): FieldRow => ({
  shiftId: "s1", jobId: "j1", jobTitle: "Fixture drive", staging: null, worker: "Fixture Worker", startsAt: new Date(now - 3_600_000), endsAt, state: state(o), turf: null,
});

describe("FieldBoard: a worker's shared area (F2)", () => {
  it("says when the area was shared, only to field staff with full access", () => {
    expect(renderToStaticMarkup(<FieldBoard rows={[row()]} empty="" showArea />)).toContain("area shared");
    // Read-only field access (a recruiter): no area, like pins.
    expect(renderToStaticMarkup(<FieldBoard rows={[row()]} empty="" />)).not.toContain("area shared");
  });
  it("never once sharing is off, the worker checked out, or the shift ended hours ago, and never a position", () => {
    for (const r of [row({ sharingArea: false }), row({ checkedOutAt: new Date(now - 60_000) }), row({}, new Date(now - 3 * 3_600_000))]) {
      expect(renderToStaticMarkup(<FieldBoard rows={[r]} empty="" showArea />)).not.toContain("area shared");
    }
    expect(renderToStaticMarkup(<FieldBoard rows={[row()]} empty="" showArea />)).not.toMatch(/39\.735|104\.995/);
  });
});
