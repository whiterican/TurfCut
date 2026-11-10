import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clearProfilePhoto, ownPhoto, ownPhotoUrl, ownsKey, photoTag, setProfilePhoto, type PhotoRecords, type PhotoStore } from "./profile-photo";

// A real 64x64 PNG (the smallest side checkImage takes), built by hand: signature, IHDR, IDAT, IEND.
import { deflateSync, crc32 } from "node:zlib";
function png(side = 64): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = Buffer.alloc(side * (1 + side * 3), 0x80);
  for (let y = 0; y < side; y++) raw[y * (1 + side * 3)] = 0;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

function fakes(start: Record<string, string | null> = {}) {
  const keys: Record<string, string | null> = { ...start };
  const files = new Map<string, Uint8Array>();
  const log: string[] = [];
  const fail = { setKey: false, remove: false };
  const db: PhotoRecords = {
    keyOf: async (id) => keys[id] ?? null,
    setKey: async (id, key) => {
      if (fail.setKey) throw new Error("db down");
      log.push(`set ${key}`);
      keys[id] = key;
    },
  };
  const store: PhotoStore = {
    put: async (key, bytes) => {
      log.push(`put ${key}`);
      files.set(key, bytes);
    },
    get: async (key) => files.get(key) ?? null,
    remove: async (key) => {
      if (fail.remove) throw new Error("storage down");
      log.push(`remove ${key}`);
      files.delete(key);
    },
  };
  return { keys, files, log, fail, db, store };
}

describe("profile photos", () => {
  it("a key belongs to the one person whose id it sits under", () => {
    expect(ownsKey("p1", "p1/abc.jpg")).toBe(true);
    expect(ownsKey("p1", "p12/abc.jpg")).toBe(false);
    expect(ownsKey("p1", "p2/abc.jpg")).toBe(false);
    expect(ownsKey("p1", "p1/../p2/abc.jpg")).toBe(false);
    expect(ownsKey("p1", "p1/x/abc.jpg")).toBe(false);
  });

  it("the photo's address carries no id, only a tag that changes with each upload", () => {
    expect(ownPhotoUrl(null)).toBeNull();
    expect(ownPhotoUrl("p1/9f2c.png")).toBe("/api/profile-photo?v=9f2c");
    expect(photoTag("p1/9f2c.png")).toBe("9f2c");
    expect(ownPhotoUrl("p1/9f2c.png")).not.toContain("p1");
  });

  it("stores a first photo under the person's own id and points the record at it", async () => {
    const f = fakes();
    const r = await setProfilePhoto("p1", png(), f.db, f.store);
    expect(r.ok).toBe(true);
    const key = f.keys.p1!;
    expect(ownsKey("p1", key)).toBe(true);
    expect(key.endsWith(".png")).toBe(true);
    expect(f.files.has(key)).toBe(true);
  });

  it("replacing stores the new file and repoints the record before the old file goes", async () => {
    const f = fakes({ p1: "p1/old.jpg" });
    f.files.set("p1/old.jpg", new Uint8Array([1]));
    await setProfilePhoto("p1", png(), f.db, f.store);
    expect(f.log.map((l) => l.split(" ")[0])).toEqual(["put", "set", "remove"]);
    expect(f.log[2]).toBe("remove p1/old.jpg");
    expect(f.files.has("p1/old.jpg")).toBe(false);
    expect(f.files.size).toBe(1);
  });

  it("refuses what is not a PNG or JPEG, and stores nothing", async () => {
    const f = fakes({ p1: "p1/old.jpg" });
    const r = await setProfilePhoto("p1", new TextEncoder().encode("<svg onload=alert(1)>"), f.db, f.store);
    expect(r.ok).toBe(false);
    expect(f.log).toEqual([]);
    expect(f.keys.p1).toBe("p1/old.jpg");
  });

  it("a record that could not be saved leaves no stray file and keeps the old photo", async () => {
    const f = fakes({ p1: "p1/old.jpg" });
    f.files.set("p1/old.jpg", new Uint8Array([1]));
    f.fail.setKey = true;
    await expect(setProfilePhoto("p1", png(), f.db, f.store)).rejects.toThrow("db down");
    expect([...f.files.keys()]).toEqual(["p1/old.jpg"]);
    expect(f.keys.p1).toBe("p1/old.jpg");
  });

  it("an old file that will not go does not fail the new photo", async () => {
    const f = fakes({ p1: "p1/old.jpg" });
    f.fail.remove = true;
    const r = await setProfilePhoto("p1", png(), f.db, f.store);
    expect(r.ok).toBe(true);
    expect(f.keys.p1).not.toBe("p1/old.jpg");
  });

  it("removing deletes the file, then clears the record; a file that will not go stays on record to retry", async () => {
    const f = fakes({ p1: "p1/a.jpg" });
    f.files.set("p1/a.jpg", new Uint8Array([1]));
    f.fail.remove = true;
    await expect(clearProfilePhoto("p1", f.db, f.store)).rejects.toThrow("storage down");
    expect(f.keys.p1).toBe("p1/a.jpg");
    f.fail.remove = false;
    await clearProfilePhoto("p1", f.db, f.store);
    expect(f.keys.p1).toBeNull();
    expect(f.files.size).toBe(0);
    await clearProfilePhoto("p1", f.db, f.store); // nothing left: no error
  });

  it("serves a person only their own photo, and never reads a key that sits under someone else", async () => {
    const f = fakes({ p1: "p1/a.png", p2: "p1/a.png", p3: null });
    f.files.set("p1/a.png", new Uint8Array([7]));
    const mine = await ownPhoto("p1", f.db, f.store);
    expect(mine && !mine.unchanged && [...mine.bytes]).toEqual([7]);
    expect(mine && !mine.unchanged && mine.type).toBe("image/png");
    expect(await ownPhoto("p2", f.db, f.store)).toBeNull(); // a record pointing at another person's file
    expect(await ownPhoto("p3", f.db, f.store)).toBeNull();
    expect(await ownPhoto("nobody", f.db, f.store)).toBeNull();
  });

  it("answers 'unchanged' without touching storage when the browser already holds the current photo", async () => {
    const f = fakes({ p1: "p1/a.png" });
    const r = await ownPhoto("p1", f.db, { ...f.store, get: async () => { throw new Error("should not read"); } }, "a");
    expect(r).toEqual({ tag: "a", unchanged: true });
  });
});

describe("profile photos: who sees them", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("the route takes no id: it can only ever serve the signed-in person's own photo, and is never cached for anyone else", () => {
    const route = read("src/app/api/profile-photo/route.ts");
    expect(route).toMatch(/ownPhoto\(session\.userId,/);
    expect(route).not.toMatch(/searchParams|params\b/);
    expect(route).toContain('"private, no-cache"');
    expect(route).toContain("nosniff");
  });

  it("the bucket is private, and both setup files create it that way", () => {
    for (const p of ["prisma/profile-photo.sql", "prisma/supabase-manual-setup.sql"]) {
      const sql = read(p);
      expect(sql).toMatch(/'profile-photos', 'profile-photos', false/);
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "avatarKey"/);
    }
  });

  it("nothing an organization sees while hiring reads a person's photo (it shows race, age and gender)", () => {
    // Only these files touch the photo code at all: the session's own navigation, Settings, the route, closing an account and its daily retry.
    const hits = execSync("grep -rlE 'lib/profile-photo|photo-actions' src --include=*.ts --include=*.tsx", { encoding: "utf8" }).trim().split("\n").filter((p) => !p.endsWith(".test.ts") && !p.includes("zz-preview")).sort();
    expect(hits).toEqual([
      "src/app/api/cron/purge-proofs/route.ts",
      "src/app/api/profile-photo/route.ts",
      "src/app/settings/page.tsx",
      "src/app/settings/photo-actions.ts",
      "src/components/PhotoSettings.tsx",
      "src/lib/account-data.ts",
      "src/lib/nav.ts",
      "src/lib/profile-photo-data.ts",
      "src/lib/profile-photo.ts",
    ]);
  });
});
