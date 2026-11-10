import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clearProfilePhoto, ownPhoto, ownPhotoUrl, ownsKey, photoTag, purgeProfilePhotos, setProfilePhoto, SWEEP_GRACE_MS, type PhotoRecords, type PhotoStore } from "./profile-photo";

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
  /** Stored files, with how long ago each was stored. */
  const files = new Map<string, { bytes: Uint8Array; ageMs: number }>();
  const log: string[] = [];
  const fail = { swap: false, remove: false, sweep: false };
  /** Runs just before a swap, to stand in for another request landing in between. */
  const hook: { beforeSwap?: () => void } = {};
  const db: PhotoRecords = {
    keyOf: async (id) => keys[id] ?? null,
    swapKey: async (id, from, to) => {
      hook.beforeSwap?.();
      if (fail.swap) throw new Error("db down");
      if ((keys[id] ?? null) !== from) return false;
      log.push(`set ${to}`);
      keys[id] = to;
      return true;
    },
  };
  const store: PhotoStore = {
    put: async (key, bytes) => {
      log.push(`put ${key}`);
      files.set(key, { bytes, ageMs: 0 });
    },
    get: async (key) => files.get(key)?.bytes ?? null,
    remove: async (key) => {
      if (fail.remove) throw new Error("storage down");
      log.push(`remove ${key}`);
      files.delete(key);
    },
    sweep: async (id, opts = {}) => {
      if (fail.sweep) throw new Error("storage down");
      for (const [k, f] of files) if (k.startsWith(`${id}/`) && k !== opts.keep && (!opts.olderThanMs || f.ageMs >= opts.olderThanMs)) files.delete(k);
    },
  };
  const file = (key: string, ageMs = 0) => files.set(key, { bytes: new Uint8Array([1]), ageMs });
  return { keys, files, log, fail, hook, db, store, file };
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
    f.file("p1/old.jpg");
    await setProfilePhoto("p1", png(), f.db, f.store);
    expect(f.log.map((l) => l.split(" ")[0])).toEqual(["put", "set", "remove"]);
    expect(f.log[2]).toBe("remove p1/old.jpg");
    expect([...f.files.keys()]).toEqual([f.keys.p1]);
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
    f.file("p1/old.jpg");
    f.fail.swap = true;
    await expect(setProfilePhoto("p1", png(), f.db, f.store)).rejects.toThrow("db down");
    expect([...f.files.keys()]).toEqual(["p1/old.jpg"]);
    expect(f.keys.p1).toBe("p1/old.jpg");
  });

  it("two uploads at once: one wins, the other's file is removed and it is told to try again", async () => {
    const f = fakes({ p1: "p1/old.jpg" });
    f.file("p1/old.jpg");
    // Another upload lands between this one reading the record and changing it.
    f.hook.beforeSwap = () => {
      f.hook.beforeSwap = undefined;
      f.file("p1/other.jpg");
      f.keys.p1 = "p1/other.jpg";
    };
    const r = await setProfilePhoto("p1", png(), f.db, f.store);
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/try again/i) });
    expect(f.keys.p1).toBe("p1/other.jpg");
    expect(f.files.has("p1/other.jpg")).toBe(true);
    expect([...f.files.keys()].filter((k) => k.endsWith(".png"))).toEqual([]); // the loser's file is gone
  });

  it("an upload sweeps up old strays, but never a file another upload stored a moment ago", async () => {
    const f = fakes({ p1: "p1/old.jpg" });
    f.file("p1/old.jpg", SWEEP_GRACE_MS * 2);
    f.file("p1/stray.jpg", SWEEP_GRACE_MS * 2);
    f.file("p1/in-flight.jpg", 1000);
    f.file("p2/theirs.jpg", SWEEP_GRACE_MS * 2);
    await setProfilePhoto("p1", png(), f.db, f.store);
    expect([...f.files.keys()].sort()).toEqual([f.keys.p1!, "p1/in-flight.jpg", "p2/theirs.jpg"].sort());
  });

  it("an old file that will not go does not fail the new photo", async () => {
    const f = fakes({ p1: "p1/old.jpg" });
    f.fail.remove = true;
    f.fail.sweep = true;
    const r = await setProfilePhoto("p1", png(), f.db, f.store);
    expect(r.ok).toBe(true);
    expect(f.keys.p1).not.toBe("p1/old.jpg");
  });

  it("removing clears the record, then the file; nothing left is no error", async () => {
    const f = fakes({ p1: "p1/a.jpg" });
    f.file("p1/a.jpg");
    await clearProfilePhoto("p1", f.db, f.store);
    expect(f.keys.p1).toBeNull();
    expect(f.files.size).toBe(0);
    await clearProfilePhoto("p1", f.db, f.store);
  });

  it("removing while a new photo lands leaves the new photo whole", async () => {
    const f = fakes({ p1: "p1/a.jpg" });
    f.file("p1/a.jpg");
    f.hook.beforeSwap = () => {
      f.hook.beforeSwap = undefined;
      f.file("p1/new.jpg");
      f.keys.p1 = "p1/new.jpg";
    };
    await clearProfilePhoto("p1", f.db, f.store);
    expect(f.keys.p1).toBe("p1/new.jpg");
    expect(f.files.has("p1/new.jpg")).toBe(true);
  });

  it("closing an account removes every file under the person, on record or not, and keeps the record if storage fails", async () => {
    const f = fakes({ p1: "p1/a.jpg", p2: null });
    f.file("p1/a.jpg");
    f.file("p1/stray.jpg", 5);
    f.file("p2/stray.jpg", 5); // off the record entirely
    f.file("p3/theirs.jpg");
    f.fail.sweep = true;
    await expect(purgeProfilePhotos("p1", f.db, f.store)).rejects.toThrow("storage down");
    expect(f.keys.p1).toBe("p1/a.jpg"); // still on record: the daily job finds it
    f.fail.sweep = false;
    await purgeProfilePhotos("p1", f.db, f.store);
    await purgeProfilePhotos("p2", f.db, f.store);
    expect(f.keys.p1).toBeNull();
    expect([...f.files.keys()]).toEqual(["p3/theirs.jpg"]);
  });

  it("serves a person only their own photo, and never reads a key that sits under someone else", async () => {
    const f = fakes({ p1: "p1/a.png", p2: "p1/a.png", p3: null });
    f.files.set("p1/a.png", { bytes: new Uint8Array([7]), ageMs: 0 });
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
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : []; });
  const sources = walk("src").filter((p) => !p.endsWith(".test.ts") && !p.includes("zz-preview"));

  it("the bucket is private, and both setup files create it that way", () => {
    for (const p of ["prisma/profile-photo.sql", "prisma/supabase-manual-setup.sql"]) {
      const sql = read(p);
      expect(sql).toMatch(/'profile-photos', 'profile-photos', false/);
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "avatarKey"/);
    }
  });

  it("nothing an organization sees while hiring reads a person's photo (it shows race, age and gender)", () => {
    // Only these files touch the photo code at all: the person's own navigation and Settings, the route, the data export, closing an account and its daily retry.
    expect(sources.filter((p) => /lib\/profile-photo|photo-actions|api\/profile-photo/.test(read(p))).sort()).toEqual([
      "src/app/api/cron/purge-proofs/route.ts",
      "src/app/api/profile-photo/route.ts",
      "src/app/settings/page.tsx",
      "src/app/settings/photo-actions.ts",
      "src/components/PhotoSettings.tsx",
      "src/lib/account-data.ts",
      "src/lib/nav.ts",
      "src/lib/profile-photo-data.ts",
      "src/lib/profile-photo-key.ts",
      "src/lib/profile-photo.ts",
    ]);
    // And the column itself is read from "Profile" in two places only: the person's own session, and the photo records.
    // (Campaign pages have an avatarKey of their own, on the campaign.)
    const reads = sources.filter((p) => /profile\.(findUnique|findMany|findFirst|update|updateMany)[\s\S]{0,400}avatarKey/.test(read(p)) || /avatarKey: profile\.avatarKey/.test(read(p)));
    expect(reads.sort()).toEqual(["src/lib/auth.ts", "src/lib/profile-photo-data.ts"]);
  });
});
