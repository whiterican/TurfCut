import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { AssignThisTurfButton, TurfPickContext, TurfPickProvider, pickReducer, type PickState } from "./TurfPick";
import { AssignTurfPanel, type AssignableShift } from "./AssignTurfPanel";
import { CoverageMap } from "./CoverageMap";
import { turfCards } from "@/lib/field-turf";
import { zoneId } from "@/lib/field-live";
import type { FieldRow } from "@/lib/field-view";

vi.mock("@/app/field/actions", () => ({ assignTurfAction: async () => ({ ok: true, message: "" }) }));
vi.mock("@/components/TurfMap", () => ({ TurfMap: ({ turf }: { turf: unknown }) => <div data-map={turf ? "preset" : "blank"} /> }));

const turf = { type: "Polygon" as const, coordinates: [[[-104.99, 39.73], [-104.98, 39.73], [-104.98, 39.74], [-104.99, 39.73]]] as [number, number][][] };

describe("picking a turf that is already on the map", () => {
  it("offers the card's button only where turf may be assigned (inside the provider)", () => {
    expect(renderToStaticMarkup(<AssignThisTurfButton id="z" name="Turf 1" turf={turf} />)).toBe("");
    const html = renderToStaticMarkup(<TurfPickProvider><AssignThisTurfButton id="z" name="Turf 1" turf={turf} /></TurfPickProvider>);
    expect(html).toContain("Assign this turf");
    // The spoken name starts with the visible words (voice control: "click Assign this turf").
    expect(html).toContain('aria-label="Assign this turf: Turf 1"');
  });
  it("the button's spoken name is left to its words when the turf has no name", () => {
    const bare = renderToStaticMarkup(<TurfPickProvider><AssignThisTurfButton id="z" name="" turf={turf} /></TurfPickProvider>);
    expect(bare).toContain("Assign this turf");
    expect(bare).not.toContain("aria-label");
  });
  it("the button is ready to press, and held while a save is on its way", () => {
    expect(renderToStaticMarkup(<TurfPickProvider><AssignThisTurfButton id="z" name="Turf 1" turf={turf} /></TurfPickProvider>)).not.toContain("disabled");
    const ctx = { picked: null, pick: () => {}, clear: () => {}, setSaving: () => {} };
    const button = <AssignThisTurfButton id="z" name="Turf 1" turf={turf} />;
    expect(renderToStaticMarkup(<TurfPickContext.Provider value={{ ...ctx, saving: true }}>{button}</TurfPickContext.Provider>)).toContain('disabled=""');
    expect(renderToStaticMarkup(<TurfPickContext.Provider value={{ ...ctx, saving: false }}>{button}</TurfPickContext.Provider>)).not.toContain("disabled");
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
    const zones = [{ id: zoneId(turf), turf, total: 2, onGround: 1 }];
    const plain = renderToStaticMarkup(<CoverageMap initial={zones} />);
    expect(plain).not.toContain("data-pickable");
    expect(plain).not.toContain("Tap a turf");
    const pickable = renderToStaticMarkup(<TurfPickProvider><CoverageMap initial={zones} /></TurfPickProvider>);
    expect(pickable).toContain("data-pickable");
    // Nothing is chosen until a zone is tapped: the line under the map says how, and offers no button yet.
    expect(pickable).toContain("Tap a turf on the map to assign it to more shifts.");
    expect(pickable).not.toContain("Assign this turf");
  });
});

describe("the pick's number", () => {
  const zone = { id: "a", turf };
  const start: PickState = { picked: null, count: 0 };
  it("goes up on every pick, the same turf again too", () => {
    const one = pickReducer(start, { type: "pick", zone });
    const two = pickReducer(one, { type: "pick", zone });
    expect([one.picked?.nonce, two.picked?.nonce]).toEqual([1, 2]);
  });
  it("is not reused after a clear: pick, Close, pick must open the panel again", () => {
    const one = pickReducer(start, { type: "pick", zone });
    const cleared = pickReducer(one, { type: "clear" });
    expect(cleared.picked).toBeNull();
    const again = pickReducer(cleared, { type: "pick", zone });
    expect(again.picked?.nonce).not.toBe(one.picked?.nonce);
    expect(again.picked?.nonce).toBe(2);
  });
  it("clearing nothing changes nothing", () => {
    expect(pickReducer(start, { type: "clear" })).toBe(start);
  });
});

describe("the Assign panel starting from a picked turf", () => {
  const id = zoneId(turf);
  const shift = (over: Partial<AssignableShift>): AssignableShift => ({ id: "s1", worker: "Fixture Worker", jobTitle: "Fixture job", startsAt: "2026-11-21T15:00:00Z", endsAt: "2026-11-21T18:00:00Z", hasTurf: false, zoneId: null, ...over });
  const shifts = [shift({ id: "s1", worker: "Has It", hasTurf: true, zoneId: id }), shift({ id: "s2", worker: "Has Another", hasTurf: true, zoneId: "other" }), shift({ id: "s3", worker: "Has None" })];
  const html = renderToStaticMarkup(
    <TurfPickProvider initial={{ id, turf }}>
      <AssignTurfPanel shifts={shifts} center={null} names={{ [id]: "Turf 1", other: "Turf 2" }} />
    </TurfPickProvider>,
  );
  it("is open, named for the turf, with the turf on its map and a way back to a blank one", () => {
    expect(html).toContain("Assign Turf 1");
    expect(html).toContain('data-map="preset"');
    expect(html).toContain("Draw a new turf");
    expect(html).toContain("Only the shifts you tick change.");
  });
  it("says which shifts already have that turf, and which have another that would be replaced", () => {
    expect(html).toMatch(/Has It<\/span>.*?already has Turf 1/);
    expect(html).toMatch(/Has Another<\/span>.*?has turf \(it will be replaced\)/);
    expect(html.match(/already has Turf 1/g)).toHaveLength(1);
    expect(html.match(/it will be replaced/g)).toHaveLength(1);
  });
  it("calls the turf what its card calls it now, and nothing kept from when it was picked", () => {
    // Unnamed turfs are numbered by position: once a save removes "Turf 1", the turf picked as "Turf 2" is the card "Turf 1".
    const renamed = renderToStaticMarkup(
      <TurfPickProvider initial={{ id, turf }}>
        <AssignTurfPanel shifts={shifts} center={null} names={{ [id]: "Turf 9" }} />
      </TurfPickProvider>,
    );
    expect(renamed).toContain("Assign Turf 9");
    expect(renamed).toContain("already has Turf 9");
    // A picked turf no card shows (not named yet, or its last shift was given other turf, when another card may have
    // taken its old number) is "this turf", never a name that now belongs to another card.
    const gone = renderToStaticMarkup(
      <TurfPickProvider initial={{ id, turf }}>
        <AssignTurfPanel shifts={shifts} center={null} names={{ other: "Turf 1" }} />
      </TurfPickProvider>,
    );
    expect(gone).toContain("Assign this turf");
    expect(gone).toContain("already has this turf");
    expect(gone).not.toContain("Turf 1");
  });
  it("ticks nobody for the organizer", () => {
    expect(html).not.toContain("checked=");
  });
  it("without a pick it stays the plain panel: closed", () => {
    const plain = renderToStaticMarkup(<TurfPickProvider><AssignTurfPanel shifts={shifts} center={null} /></TurfPickProvider>);
    expect(plain).not.toContain("Has It");
    expect(plain).not.toContain("Draw a new turf");
  });
});
