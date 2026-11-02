import { describe, expect, it } from "vitest";
import { AUDIENCE_OPTIONS, MAX_TRAVEL_MILES, PART_DETAILS, RELATIONSHIP_PHRASE, SETUP_COPY, SHARE_PARTS, SHARING_COPY, SHARING_TEXT_VERSION } from "./sharing";
import { SETUP_STEPS } from "./setup-flow";

/**
 * The words a worker agrees to on Who sees what, pinned to the version they
 * were agreed under. A failure here means the wording changed: that is a
 * consent change, not a copy edit. Bump SHARING_TEXT_VERSION (every worker is
 * asked again) and update these strings in the same change, or put the old
 * words back. Layout work never needs to touch this file.
 */
describe(`Who sees what wording (version ${SHARING_TEXT_VERSION})`, () => {
  it("is the wording version these strings were written for", () => {
    expect(SHARING_TEXT_VERSION).toBe("c3-2026-10-09");
  });

  it("names the relationship and the three audiences the same way", () => {
    expect(RELATIONSHIP_PHRASE).toBe("apply to, claim a spot with or accept an invite from");
    expect(AUDIENCE_OPTIONS).toEqual([
      { value: "RELATIONSHIP", label: "Organizations I apply to, claim a spot with or accept an invite from" },
      { value: "ANY_APPROVED_ORG", label: "Any organization Turfcut has approved" },
      { value: "NOBODY", label: "Nobody" },
    ]);
  });

  it("describes each part of the profile the same way, in the same order", () => {
    expect(SHARE_PARTS).toEqual(["output", "quality", "reliability", "history", "availability", "credentials"]);
    expect(PART_DETAILS).toEqual({
      output: { label: "Output rates", covers: "Doors per hour, doors per shift, signatures per hour" },
      quality: { label: "Quality", covers: "Signature acceptance rate, contact rate" },
      reliability: { label: "Reliability", covers: "Show rate" },
      history: { label: "Hours and history", covers: "Verified shifts, active hours, campaigns, states and dates worked, totals, and the experience you list" },
      availability: { label: "Availability", covers: "Your usual week, date exceptions and note" },
      credentials: { label: "Credentials", covers: "Name, verification level and expiry of each credential" },
    });
  });

  it("keeps the page's own explanations word for word", () => {
    expect(SHARING_COPY.lead).toBe('Choose who sees each part of your profile. Anything you don\'t share shows as "not shared" to organizations, never as a zero, and is never used to rank you.');
    expect(SHARING_COPY.lastChanged("Nov 2, 2026")).toBe("You last changed these on Nov 2, 2026. Earlier choices are kept on record, never overwritten.");
    expect(SHARING_COPY.notChanged).toBe("You haven't changed anything yet: organizations you apply to, claim a spot with or accept an invite from see your profile, nobody else does, and nobody can find you.");
    expect(SHARING_COPY.politicalFitHint).toBe("Your political-fit answers have their own settings, under Political fit on your profile.");
    expect(SHARING_COPY.approvedHint).toBe(
      "“Any organization Turfcut has approved” matters when you let organizations find you (below): an approved organization you haven't applied to then sees those parts when you come up as a match for one of its jobs. Otherwise an organization sees your profile only after you apply, claim a spot or accept its invitation."
    );
    expect(SHARING_COPY.findableLabel).toBe("Let organizations find me");
    expect(SHARING_COPY.workTypesLabel).toBe("Work I want to be found for");
    expect(SHARING_COPY.workTypeLabels).toEqual({ PETITION: "Petition", CANVASS: "Canvass" });
    expect(SHARING_COPY.homeAreaLabel).toBe("City or ZIP you'd travel from");
    // The limit is part of the terms: a new limit is a new wording.
    expect(MAX_TRAVEL_MILES).toBe(500);
    expect(SHARING_COPY.travelMilesLabel(MAX_TRAVEL_MILES)).toBe("How far you'd travel (miles, up to 500)");
    expect(SHARING_COPY.findableHelp).toBe(
      "Off by default. When it's on, organizations Turfcut has approved can find you for the work you pick, on published jobs within the distance you set of the place you type, and invite you. They see your name, the distance rounded to 5 miles, the distance you'd travel, and the parts above you share with any approved organization. They never see the place you type. Turfcut never uses your phone's location. Turning it off clears the place and distance."
    );
  });

  it("keeps the first-run setup's words too (Done records the choices under the same version)", () => {
    expect(SETUP_STEPS).toEqual(["Who sees your scorecard", "Availability", "Credentials", "Being found"]);
    expect(SETUP_COPY.audienceShort).toEqual({
      RELATIONSHIP: "Organizations you apply to, claim a spot with or accept an invite from",
      ANY_APPROVED_ORG: "Any organization Turfcut has approved",
      NOBODY: "Nobody",
    });
    expect(SETUP_COPY.workWords).toEqual({ PETITION: "petition", CANVASS: "canvass" });
    expect(SETUP_COPY.scorecardIntro).toBe('Each part of your scorecard has its own audience. Anything not shared shows as "not shared", never a zero.');
    expect(SETUP_COPY.availabilityIntro(PART_DETAILS.availability.covers)).toBe("When you're usually free, for schedulers. Never scored. It covers: your usual week, date exceptions and note.");
    expect(SETUP_COPY.credentialsIntro(PART_DETAILS.credentials.covers)).toBe("Registrations, notary status and training. Organizations see the name, verification level and expiry of each credential, never the number.");
    expect(SETUP_COPY.seenBy("Nobody")).toBe("Seen by: Nobody.");
    expect(SETUP_COPY.findableIntro).toBe(
      "Whether approved organizations can find you for work near you, and for which kind. They'd see your name, a rounded distance, how far you'd travel and what you share with any approved organization, never the place itself. Off unless you turn it on; it uses only a city or ZIP you type, never your phone's location."
    );
    expect(SETUP_COPY.findableOn("petition and canvass", 25, "Aurora, CO")).toBe("On: petition and canvass work, within 25 miles of Aurora, CO.");
    expect(SETUP_COPY.findableOff).toBe("Off.");
    expect(SETUP_COPY.skipKeepsDefaults).toBe("Skipping keeps the defaults: organizations you apply to, claim a spot with or accept an invite from see your profile, and nobody can find you.");
    expect(SETUP_COPY.skipKeepsCurrent).toBe("Skipping keeps your current choices.");
    expect(SETUP_COPY.confirmLabel).toBe("Done, keep these choices");
  });
});
