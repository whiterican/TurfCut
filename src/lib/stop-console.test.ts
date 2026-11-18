import { describe, expect, it } from "vitest";
import { consoleHref, exportCsv, parseConsoleQuery, type ConsoleQuery } from "@/lib/stop-console";

const ID = "9f1c2b4e-1111-4222-8333-444455556666";

describe("parseConsoleQuery", () => {
  it("reads known filters, in any case, and the first of a repeated key", () => {
    const q = parseConsoleQuery({ outcome: "COME_BACK", book: ID.toUpperCase(), worker: [ID, "x"], stop: ID, page: "3" });
    expect(q).toEqual({ outcome: "COME_BACK", bookId: ID, holderId: ID, stopId: ID, page: 3 });
    expect(parseConsoleQuery({ outcome: "todo" }).outcome).toBe("todo");
    expect(parseConsoleQuery({ worker: "none" }).holderId).toBe("none");
  });
  it("ignores anything it doesn't know instead of passing it on", () => {
    const q = parseConsoleQuery({ outcome: "SUPPORTER", book: "1; drop table", worker: "nope", stop: "", page: "-2" });
    expect(q).toEqual({ outcome: null, bookId: null, holderId: null, stopId: null, page: 1 });
    expect(parseConsoleQuery({ page: "0" }).page).toBe(1);
    expect(parseConsoleQuery({ page: "99999999999" }).page).toBe(1);
  });
});

describe("consoleHref", () => {
  const q: ConsoleQuery = { outcome: "DONE", bookId: ID, holderId: null, stopId: ID, page: 4 };
  it("keeps the page and inspector when only the inspector moves", () => {
    expect(consoleHref("/c", q, { stop: null })).toBe(`/c?outcome=DONE&book=${ID}&page=4`);
  });
  it("starts again at page 1 with no inspector when a filter changes", () => {
    expect(consoleHref("/c", q, { outcome: "NOT_HOME" })).toBe(`/c?outcome=NOT_HOME&book=${ID}`);
    expect(consoleHref("/c", q, { outcome: null, book: null })).toBe("/c");
  });
});

describe("exportCsv", () => {
  const base = { bookNumber: 1, stopNumber: 2, line1: "12 Elm St", unit: null, city: "Denver", state: "CO", zip: "80202", sourceRecordId: null, outcome: null, talkedTo: null, leftLiterature: null, signatures: null, recordedAt: null, holder: null };
  it("writes a header and one line per stop, with To do for a stop with no outcome", () => {
    const csv = exportCsv([base, { ...base, stopNumber: 3, sourceRecordId: "V123", outcome: "DONE", talkedTo: true, leftLiterature: false, signatures: 4, recordedAt: new Date("2026-11-17T08:05:09.123Z"), holder: "Alex Rivera" }]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('"Walkbook","Stop","Address","Unit","City","State","ZIP","Source record ID","Outcome","Talked with someone","Left literature","Signatures","Recorded at (UTC)","Held by"');
    expect(lines[1]).toBe('"1","2","12 Elm St","","Denver","CO","80202","","To do","","","","",""');
    expect(lines[2]).toBe('"1","3","12 Elm St","","Denver","CO","80202","V123","Done","yes","no","4","2026-11-17 08:05:09","Alex Rivera"');
  });
  it("adds a column per poll question, with the answer in words, and an empty cell where there is none", () => {
    const cols = [{ id: "q1", prompt: "Measure 3?" }, { id: "q2", prompt: "Top issue?" }];
    const csv = exportCsv([{ ...base, outcome: "DONE", poll: { q1: "Support", q2: "Declined" } }, { ...base, stopNumber: 3 }], cols);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0].endsWith('"Signatures","Poll 1: Measure 3?","Poll 2: Top issue?"')).toBe(true);
    expect(lines[1].endsWith('"Support","Declined"')).toBe(true);
    expect(lines[2].endsWith('"",""')).toBe(true);
    // No worker name and no time beside the opinions (rule 5): a pivot of this file can't break answers down by person.
    expect(lines[0]).not.toMatch(/Held by|Recorded at/);
    expect(csv).not.toContain("Alex Rivera");
    const named = exportCsv([{ ...base, holder: "Alex Rivera", outcome: "DONE", poll: { q1: "Support" } }], cols);
    expect(named).not.toContain("Alex Rivera");
    // Without a poll the file is exactly what it was.
    expect(exportCsv([base]).split("\r\n")[0].endsWith('"Held by"')).toBe(true);
  });
  it("never lets a value be read as a formula, and doubles quotes", () => {
    const csv = exportCsv([{ ...base, line1: '=HYPERLINK("http://x")', unit: "@SUM(A1)", holder: '+1 "Bob"' }]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain(`"'@SUM(A1)"`);
    expect(csv).toContain(`"'+1 ""Bob"""`);
    // The header starts with the word Poll, so a prompt can't make it a formula; an answer is guarded like any cell.
    const poll = exportCsv([{ ...base, poll: { q: "=1+1" } }], [{ id: "q", prompt: "@x" }]);
    expect(poll).toContain('"Poll 1: @x"');
    expect(poll).toContain(`"'=1+1"`);
  });
});
