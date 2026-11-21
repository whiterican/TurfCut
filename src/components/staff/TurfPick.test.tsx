import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { AssignThisTurfButton, TurfPickProvider } from "./TurfPick";
import { turfCards } from "@/lib/field-turf";
import { zoneId } from "@/lib/field-live";
import type { FieldRow } from "@/lib/field-view";

const turf = { type: "Polygon" as const, coordinates: [[[-104.99, 39.73], [-104.98, 39.73], [-104.98, 39.74], [-104.99, 39.73]]] as [number, number][][] };

describe("picking a turf that is already on the map", () => {
  it("offers the card's button only where turf may be assigned (inside the provider)", () => {
    expect(renderToStaticMarkup(<AssignThisTurfButton id="z" name="Turf 1" turf={turf} />)).toBe("");
    const html = renderToStaticMarkup(<TurfPickProvider><AssignThisTurfButton id="z" name="Turf 1" turf={turf} /></TurfPickProvider>);
    expect(html).toContain("Assign this turf");
    expect(html).toContain('aria-label="Assign Turf 1 to shifts"');
  });
  it("a card carries its own polygon, under the same id the map's zone has", () => {
    const state = { cancelled: false, checkedInAt: null, checkedOutAt: null, paused: false, packetsOut: [], packetsReturned: [], packetsHeld: [], signatures: 0, doors: 0, contacts: 0, batchCounted: false, appCounts: null, closeout: null, atStaging: null };
    const row = { shiftId: "s", jobId: "j", jobTitle: "Job", staging: null, worker: "W", startsAt: new Date("2026-11-21T15:00:00Z"), endsAt: new Date("2026-11-21T18:00:00Z"), state, turf } as unknown as FieldRow;
    const [card] = turfCards([row]);
    expect(card.turf).toEqual(turf);
    expect(card.id).toBe(zoneId(turf));
  });
  it("a zone looks tappable only on a map marked pickable", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.coverage-map:not\(\[data-pickable\]\) \.coverage-zone \{\s*cursor: inherit;\s*\}/);
    expect(readFileSync("src/components/staff/CoverageMap.tsx", "utf8")).toContain('data-pickable={turfPick ? "" : undefined}');
  });
});
