import { describe, expect, it } from "vitest";
import { nextSort, sortRows, type TableRow } from "./table";

const row = (id: string, name: string, count: number | null): TableRow => ({
  id,
  cells: { name: { text: name }, count: { text: count === null ? "—" : String(count), sort: count } },
});
const rows = [row("a", "Sam Torres", 12), row("b", "alex Rivera", null), row("c", "Jordan Blake", 3), row("d", "Item 10", 3)];
const ids = (r: TableRow[]) => r.map((x) => x.id);

describe("staff table sorting", () => {
  it("leaves the order alone with no sort column", () => {
    expect(ids(sortRows(rows, null, "asc"))).toEqual(["a", "b", "c", "d"]);
  });
  it("sorts numbers by value, not text, and keeps ties stable", () => {
    expect(ids(sortRows(rows, "count", "asc"))).toEqual(["c", "d", "a", "b"]);
    expect(ids(sortRows(rows, "count", "desc"))).toEqual(["a", "c", "d", "b"]);
  });
  it("puts empty values last in both directions", () => {
    expect(sortRows(rows, "count", "asc").at(-1)!.id).toBe("b");
    expect(sortRows(rows, "count", "desc").at(-1)!.id).toBe("b");
  });
  it("sorts text case-insensitively and with natural numbers", () => {
    expect(ids(sortRows(rows, "name", "asc"))).toEqual(["b", "d", "c", "a"]);
    const items = [row("x", "Item 10", 0), row("y", "Item 9", 0)];
    expect(ids(sortRows(items, "name", "asc"))).toEqual(["y", "x"]);
  });
  it("a new column starts ascending; pressing it again flips", () => {
    expect(nextSort({ key: null, dir: "asc" }, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "desc" }, "count")).toEqual({ key: "count", dir: "asc" });
  });
});
