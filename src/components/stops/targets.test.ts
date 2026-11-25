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
  // Shared, but its confirm step is the button that acts on Take back and Delete now.
  "src/components/ActionButton.tsx",
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

describe("the worker's links are 44px targets too", () => {
  it("the job link above each book, and each book on the shift page", () => {
    const books = readFileSync("src/app/walkbooks/page.tsx", "utf8");
    expect(books).toMatch(/<Link href=\{`\/jobs\/\$\{b\.job\.id\}`\} className="[^"]*min-h-11/);
    const shift = readFileSync("src/app/shifts/[shiftId]/page.tsx", "utf8");
    expect(shift).toMatch(/<Link href=\{`\/walkbooks#book-\$\{b\.id\}`\} className="[^"]*min-h-11/);
  });
});

describe("the import's acknowledgements", () => {
  it("each checkbox sits in a label at least 44px tall, so the whole line is the target", () => {
    const text = readFileSync("src/components/staff/WalkbookImport.tsx", "utf8");
    for (const name of ["authorized", "ackAZ"]) {
      const at = text.indexOf(`name="${name}"`);
      const label = text.slice(text.lastIndexOf("<label", at), at);
      expect(label, name).toMatch(/min-h-11/);
    }
  });
});

describe("disclosures on the poll screens", () => {
  it("every summary (Earlier wording, History) is a 44px target", () => {
    for (const f of ["src/components/staff/PollSetup.tsx", "src/components/stops/PollConsole.tsx"]) {
      for (const m of readFileSync(f, "utf8").matchAll(/<summary className="([^"]*)"/g)) {
        expect(m[1], f).toMatch(/min-h-11/);
        // flex (or grid) turns off the summary's list-item display and with it the triangle that says it opens.
        expect(m[1], f).not.toMatch(/(^|\s)(flex|inline-flex|grid|block|list-none)(\s|$)/);
      }
    }
  });
});

describe("the poll forms keep focus on Save while it saves", () => {
  it("Save is aria-disabled, never disabled, in the worker's and the staff's poll form", () => {
    for (const f of ["src/components/stops/WorkerPollForm.tsx", "src/components/stops/StaffPollForm.tsx"]) {
      const text = readFileSync(f, "utf8");
      const save = text.slice(text.indexOf('<button className="btn-primary'), text.indexOf("Saving…"));
      expect(save, f).not.toMatch(/\sdisabled=\{/);
      expect(save, f).toMatch(/aria-disabled=\{pending\}/);
    }
  });
});
