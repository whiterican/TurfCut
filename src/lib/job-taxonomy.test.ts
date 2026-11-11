import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTIVITIES, SECTORS, activityForType, activityOf, checkTaxonomy, type Sector, type WorkActivity, type WorkMode } from "./job-taxonomy";
import { JOB_CATEGORIES } from "./job-categories";

const sql = readFileSync(join(process.cwd(), "prisma/p3-sectors.sql"), "utf8");
const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const enumOf = (name: string) => schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`))![1].split("\n").map((l) => l.trim().split(/\s/)[0]).filter((v) => /^[A-Z_]+$/.test(v));

describe("sector, activity and place of work", () => {
  it("the table, the schema and the migration name the same sectors, activities and places", () => {
    expect(enumOf("Sector")).toEqual(SECTORS.map((s) => s.id));
    expect(enumOf("WorkActivity")).toEqual(ACTIVITIES.map((a) => a.id));
    expect(enumOf("WorkMode")).toEqual(["FIELD", "REMOTE", "ONSITE"]);
    for (const v of [...enumOf("Sector"), ...enumOf("WorkActivity"), ...enumOf("WorkMode")]) expect(sql).toContain(`'${v}'`);
  });

  it("only petition circulation and door-to-door canvassing are live, both political and in the field", () => {
    expect(ACTIVITIES.filter((a) => a.live).map((a) => [a.id, a.live])).toEqual([
      ["PETITION_CIRCULATION", { sector: "POLITICAL", mode: "FIELD", type: "PETITION" }],
      ["DOOR_CANVASSING", { sector: "POLITICAL", mode: "FIELD", type: "CANVASS" }],
    ]);
  });

  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const CHECK = /ADD CONSTRAINT "Job_activity_live" CHECK \(([\s\S]*?)\)\);/g;

  it("the database's hard stop is, word for word, what the table says is live", () => {
    const check = [...sql.matchAll(CHECK)].map((m) => m[1]);
    expect(check).toHaveLength(1);
    // Built from the table: any change to the check, or to what is live, has to change both.
    const expected = `"sector"::text = 'POLITICAL' AND "workMode"::text = 'FIELD' AND ( ${ACTIVITIES.filter((a) => a.live).map((a) => `("activity"::text = '${a.id}' AND "type"::text = '${a.live!.type}')`).join(" OR ")}`;
    expect(norm(check[0])).toBe(norm(expected));
    // Named twice in the statements: dropped if present, then added. Nothing drops it afterwards.
    expect(sql.replace(/--[^\n]*/g, "").match(/CONSTRAINT (IF EXISTS )?"Job_activity_live"/g)).toHaveLength(2);
  });

  it("the check and the trigger function have one definition: this file and its copy in the setup file, nowhere else", () => {
    const files = readdirSync(join(process.cwd(), "prisma")).filter((f) => f.endsWith(".sql"));
    const withCheck = files.filter((f) => readFileSync(join(process.cwd(), "prisma", f), "utf8").includes('ADD CONSTRAINT "Job_activity_live"'));
    const withFn = files.filter((f) => readFileSync(join(process.cwd(), "prisma", f), "utf8").includes('FUNCTION "turfcut_private"."job_activity_from_type"() RETURNS'));
    expect(withCheck.sort()).toEqual(["p3-sectors.sql", "supabase-manual-setup.sql"]);
    expect(withFn.sort()).toEqual(["p3-sectors.sql", "supabase-manual-setup.sql"]);
  });

  it("the setup file carries the migration word for word", () => {
    const setup = readFileSync(join(process.cwd(), "prisma/supabase-manual-setup.sql"), "utf8");
    expect(setup).toContain(sql.slice(sql.indexOf("BEGIN;")));
  });

  it("every combination is refused except the live ones, with a sentence", () => {
    const sectors: Sector[] = ["POLITICAL", "NONPROFIT", "PRIVATE"];
    const modes: WorkMode[] = ["FIELD", "REMOTE", "ONSITE"];
    let allowed = 0;
    for (const a of ACTIVITIES) for (const sector of sectors) for (const workMode of modes) for (const type of ["PETITION", "CANVASS"] as const) {
      const r = checkTaxonomy({ sector, activity: a.id, workMode, type });
      const live = !!a.live && a.live.sector === sector && a.live.mode === workMode && a.live.type === type;
      expect({ a: a.id, sector, workMode, type, ok: r.ok }).toEqual({ a: a.id, sector, workMode, type, ok: live });
      if (r.ok) allowed++;
      else expect(r.reason.length).toBeGreaterThan(10);
    }
    expect(allowed).toBe(2);
  });

  it("a sales job is never canvassing: sales cannot be stored, and canvassing cannot be private", () => {
    expect(checkTaxonomy({ sector: "PRIVATE", activity: "DOOR_SALES", workMode: "FIELD", type: "CANVASS" })).toEqual({ ok: false, reason: "Door-to-door sales isn't available yet." });
    expect(checkTaxonomy({ sector: "PRIVATE", activity: "DOOR_CANVASSING", workMode: "FIELD", type: "CANVASS" })).toEqual({ ok: false, reason: "Door-to-door canvassing isn't private work." });
    expect(checkTaxonomy({ sector: "NONPROFIT", activity: "DOOR_CANVASSING", workMode: "FIELD", type: "CANVASS" })).toEqual({ ok: false, reason: "Door-to-door canvassing isn't available for nonprofit work yet." });
    expect(checkTaxonomy({ sector: "POLITICAL", activity: "PETITION_CIRCULATION", workMode: "FIELD", type: "CANVASS" })).toEqual({ ok: false, reason: "Petition circulation is counted as signatures." });
    expect(checkTaxonomy({ sector: "POLITICAL", activity: "DOOR_CANVASSING", workMode: "REMOTE", type: "CANVASS" })).toEqual({ ok: false, reason: "Door-to-door canvassing is done in the field." });
    expect(checkTaxonomy({ sector: "POLITICAL", activity: "NOPE" as WorkActivity, workMode: "FIELD", type: "CANVASS" }).ok).toBe(false);
  });

  it("phone work is remote or on site, door work is in the field, and sales is private only", () => {
    for (const a of ACTIVITIES) expect({ id: a.id, field: a.modes.includes("FIELD") }).toEqual({ id: a.id, field: !a.id.startsWith("PHONE_") });
    expect(ACTIVITIES.filter((a) => a.id.endsWith("_SALES")).every((a) => a.sectors.length === 1 && a.sectors[0] === "PRIVATE")).toBe(true);
    expect(ACTIVITIES.find((a) => a.id === "DOOR_FUNDRAISING")!.sectors).toEqual(["NONPROFIT"]);
  });

  it("a job written without an activity gets the one its type means, here and in the database", () => {
    expect(activityForType("PETITION")).toBe("PETITION_CIRCULATION");
    expect(activityForType("CANVASS")).toBe("DOOR_CANVASSING");
    expect(activityOf({ type: "CANVASS", activity: null })).toBe("DOOR_CANVASSING");
    expect(activityOf({ type: "PETITION" })).toBe("PETITION_CIRCULATION");
    expect(sql).toMatch(/WHEN 'PETITION' THEN 'PETITION_CIRCULATION' ELSE 'DOOR_CANVASSING' END/);
  });

  it("the category list people read covers every activity, and marks as built only what is live", () => {
    const labels = new Set(JOB_CATEGORIES.map((c) => c.label));
    for (const a of ACTIVITIES) expect({ label: a.label, listed: labels.has(a.label) }).toEqual({ label: a.label, listed: true });
    for (const c of JOB_CATEGORIES.filter((c) => c.status === "planned")) expect(ACTIVITIES.find((a) => a.label === c.label)?.live).toBeUndefined();
  });
});
