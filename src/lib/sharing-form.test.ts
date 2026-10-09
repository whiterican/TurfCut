import { describe, expect, it } from "vitest";
import { sharingFromForm } from "./sharing-form";
import { validateSharing } from "./sharing";

const form = (entries: Array<[string, string]>) => {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
};
const audiences: Array<[string, string]> = [
  ["audience.output", "RELATIONSHIP"],
  ["audience.quality", "NOBODY"],
  ["audience.reliability", "RELATIONSHIP"],
  ["audience.history", "ANY_APPROVED_ORG"],
  ["audience.availability", "RELATIONSHIP"],
  ["audience.credentials", "NOBODY"],
];

describe("Who sees what form", () => {
  it("reads every audience, findability and the typed area into a valid save", () => {
    const raw = sharingFromForm(form([...audiences, ["findable", "on"], ["workTypes", "CANVASS"], ["homeArea", " 80202 "], ["travelMiles", "15"]]));
    expect(validateSharing(raw)).toEqual({
      ok: true,
      value: {
        audiences: { output: "RELATIONSHIP", quality: "NOBODY", reliability: "RELATIONSHIP", history: "ANY_APPROVED_ORG", availability: "RELATIONSHIP", credentials: "NOBODY" },
        readReceipts: false,
        findable: true,
        workTypes: ["CANVASS"],
        homeArea: "80202",
        travelMiles: 15,
      },
    });
  });

  it("an unticked switch is off, empty fields are blank, and read receipts are left to the saved value", () => {
    const raw = sharingFromForm(form([...audiences, ["homeArea", ""], ["travelMiles", ""]]));
    expect("readReceipts" in raw).toBe(false);
    const v = validateSharing(raw);
    expect(v.ok && v.value).toMatchObject({ findable: false, workTypes: [], homeArea: null, travelMiles: null });
  });

  it("a missing audience is reported for that part", () => {
    const v = validateSharing(sharingFromForm(form(audiences.slice(1))));
    expect(!v.ok && Object.keys(v.errors)).toEqual(["output"]);
  });

  it("findable without the details is refused with a message per field", () => {
    const v = validateSharing(sharingFromForm(form([...audiences, ["findable", "on"]])));
    expect(!v.ok && Object.keys(v.errors).sort()).toEqual(["homeArea", "travelMiles", "workTypes"]);
  });
});
