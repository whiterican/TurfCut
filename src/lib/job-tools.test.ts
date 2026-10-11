import { describe, expect, it } from "vitest";
import { hasToolsFields, NO_TOOLS, readTools, toolsText, toolsToForm, validateTools } from "./job-tools";

describe("job tools", () => {
  it("reads what's stored and drops details without an app", () => {
    expect(readTools(null)).toEqual(NO_TOOLS);
    expect(readTools({ canvassApp: "MINIVAN", list: "Turf 12", notes: "Code 4411" })).toEqual({ canvassApp: "MINIVAN", list: "Turf 12", notes: "Code 4411" });
    expect(readTools({ canvassApp: "OTHERAPP", list: "x" })).toEqual(NO_TOOLS);
    expect(readTools({ list: "orphan" })).toEqual(NO_TOOLS);
  });

  it("validates the builder's fields", () => {
    expect(validateTools({ canvassApp: "PDI", toolList: " Walk  A ", toolNotes: "Ask Sam for the tablet" })).toEqual({ ok: true, value: { canvassApp: "PDI", list: "Walk A", notes: "Ask Sam for the tablet" } });
    expect(validateTools({ canvassApp: "" })).toEqual({ ok: true, value: NO_TOOLS });
    expect(validateTools({})).toEqual({ ok: true, value: NO_TOOLS });
    expect(validateTools({ canvassApp: "nope" })).toMatchObject({ ok: false, errors: { canvassApp: expect.any(String) } });
    expect(validateTools({ canvassApp: "", toolList: "Turf 12" })).toMatchObject({ ok: false, errors: { canvassApp: expect.stringMatching(/Pick the app/) } });
    expect(validateTools({ canvassApp: "MINIVAN", toolNotes: "x".repeat(501) })).toMatchObject({ ok: false, errors: { toolNotes: expect.any(String) } });
    expect(hasToolsFields({ title: "x" })).toBe(false);
    expect(hasToolsFields({ canvassApp: "" })).toBe(true);
  });

  it("round-trips and describes itself", () => {
    const v = validateTools({ canvassApp: "ECANVASSER", toolList: "Precinct 9", toolNotes: "" });
    if (!v.ok) throw new Error("bad");
    expect(validateTools(toolsToForm(v.value))).toEqual(v);
    expect(toolsText(v.value)).toBe("Ecanvasser: Precinct 9");
    expect(toolsText(NO_TOOLS)).toBeNull();
    expect(toolsText({ canvassApp: "MINIVAN", list: null, notes: null })).toBe("MiniVAN (NGP VAN)");
  });
});
