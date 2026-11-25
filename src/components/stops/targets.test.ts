import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Walkbook screens are used on a phone at the door, and by staff on any screen: every control is at least 44px
 * (CLAUDE.md design rules). .btn-sm is 36px and min-h-9 / min-h-10 are 36 and 40, so none of them belongs here.
 */
const FILES = [
  "src/app/walkbooks/page.tsx",
  "src/app/jobs/[jobId]/walkbooks/page.tsx",
  "src/app/jobs/[jobId]/walkbooks/[walkbookId]/page.tsx",
  "src/app/jobs/[jobId]/walkbooks/console/page.tsx",
  "src/components/stops/ConsoleParts.tsx",
  "src/components/stops/RecordableStop.tsx",
  "src/components/stops/StaffPollForm.tsx",
  "src/components/stops/WorkerPollForm.tsx",
  "src/components/stops/PollConsole.tsx",
  "src/components/staff/PollSetup.tsx",
  "src/components/staff/WalkbookCut.tsx",
  "src/components/staff/WalkbookImport.tsx",
];

describe("walkbook screens: every control at least 44px", () => {
  for (const f of FILES) {
    it(f, () => {
      const text = readFileSync(f, "utf8");
      expect(text.match(/\bbtn-sm\b/g) ?? [], "btn-sm is 36px").toEqual([]);
      expect(text.match(/\bmin-h-(?:[0-9]|10)\b/g) ?? [], "a min height under 44px").toEqual([]);
    });
  }
});

describe("the worker's recording panel keeps focus where it was", () => {
  it("Save and the signature − / + stay focusable when they can't be used (aria-disabled, never disabled)", () => {
    const text = readFileSync("src/components/stops/RecordableStop.tsx", "utf8");
    // A focused button that becomes disabled sends focus to the page body: the worker loses their place.
    for (const name of ["One fewer signature", "One more signature"]) {
      const tag = text.slice(text.lastIndexOf("<button", text.indexOf(`aria-label="${name}"`)), text.indexOf(`aria-label="${name}"`));
      expect(tag, name).not.toMatch(/\sdisabled=\{/);
      expect(tag, name).toMatch(/aria-disabled=\{/);
    }
    const save = text.slice(text.indexOf('<button className="btn-primary min-h-12 flex-1'), text.indexOf("Saving…"));
    expect(save).not.toMatch(/\sdisabled=\{/);
  });
});
