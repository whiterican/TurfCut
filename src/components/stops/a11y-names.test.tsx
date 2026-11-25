import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionButton } from "@/components/ActionButton";
import { TurfMap } from "@/components/TurfMap";

vi.mock("react-dom", async (orig) => ({ ...(await orig<typeof import("react-dom")>()), useFormStatus: () => ({ pending: false }) }));

describe("walkbook screens: names a screen reader can tell apart", () => {
  it("a confirmed action (Take back, Delete now) carries its fuller name, not the same word down the list", () => {
    const html = renderToStaticMarkup(
      <ActionButton action={async () => ({ ok: true, message: "" })} fields={{}} label="Take back" ariaLabel="Take back Book 3 · Elm St" confirm={{ text: "Sure?", label: "Take it back" }} />
    );
    expect(html).toMatch(/<summary[^>]*aria-label="Take back Book 3 · Elm St"/);
  });
  it("a walkbook's map is named for what it shows", () => {
    expect(renderToStaticMarkup(<TurfMap pins={[]} label="Map of these stops (every stop is also in the list)" />)).toContain('aria-label="Map of these stops');
    expect(renderToStaticMarkup(<TurfMap pins={[]} />)).toContain('aria-label="Map of the assigned turf"');
  });
  it("the job page's figures are a valid list: each term before its figure, so it reads 'Walkbooks, 25'", () => {
    const text = readFileSync("src/app/jobs/[jobId]/walkbooks/page.tsx", "utf8");
    const tile = text.slice(text.indexOf('className="card !p-3'), text.indexOf("</dl>"));
    expect(tile.indexOf("<dt")).toBeGreaterThan(-1);
    expect(tile.indexOf("<dt")).toBeLessThan(tile.indexOf("<dd"));
  });
});
