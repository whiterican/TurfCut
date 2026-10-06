import { describe, expect, it } from "vitest";
import { hasHiddenChars } from "./text-guard";

describe("hidden characters", () => {
  it("refuses invisible and direction-changing characters, including tag characters", () => {
    for (const s of [
      "a\u202eb",
      "a\u200bb", "a\u200eb",
      "a\u2028b",
      "a\u2029b",
      "a\u00adb",
      "a\u034fb",
      "a\u180eb",
      "a\u3164b",
      "a\ufeffb",
      "a\u{e0041}b",
      "a\u0007b",
    ]) expect({ s: JSON.stringify(s), hidden: hasHiddenChars(s) }).toEqual({ s: JSON.stringify(s), hidden: true });
  });
  it("allows ordinary text, accents, emoji and (unless one-line) line breaks", () => {
    for (const s of ["Denver, CO 80202", "Peña Blvd", "José — weekends 🙂", "I \u2764\ufe0f weekends", "\u{1f469}\u200d\u{1f467}", "1\ufe0f\u20e3", "\u0645\u06cc\u200c\u062e", "line one\nline two"]) expect(hasHiddenChars(s)).toBe(false);
    expect(hasHiddenChars("a\nb", true)).toBe(true);
    expect(hasHiddenChars("a\tb", true)).toBe(true);
  });
});
