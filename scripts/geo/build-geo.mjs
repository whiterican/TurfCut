// Builds the bundled US location tables used for Matches distances (C3.4)
// from the Census Bureau's public-domain files:
//   2023 Gazetteer ZCTA file   (2023_Gaz_zcta_national.txt)
//   2023 Gazetteer Places file (2023_Gaz_place_national.txt)
//   2020 ZCTA-to-county relationship file (tab20_zcta520_county20_natl.txt), for each ZIP's state
// https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html
//
// Usage: node scripts/geo/build-geo.mjs <zcta.txt> <places.txt> <zcta-county.txt> <out dir>
// Writes zcta.json ({ "80202": [lat, lon, "CO"] }) and places.json
// ({ "CO": { "denver": [lat, lon] } }), coordinates to 3 decimals (~100 m).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { placeKey } from "./place-key.mjs";

const [zctaFile, placeFile, relFile, outDir] = process.argv.slice(2);
if (!outDir) {
  console.error("usage: build-geo.mjs <zcta.txt> <places.txt> <zcta-county.txt> <out dir>");
  process.exit(2);
}
const rows = (file, sep) =>
  readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map((l) => l.split(sep).map((c) => c.trim()));
const r3 = (n) => Math.round(Number(n) * 1000) / 1000;

// State FIPS → USPS code, from the places file.
const places = rows(placeFile, "\t");
const ph = places[0];
const P = Object.fromEntries(ph.map((h, i) => [h, i]));
const fipsToState = {};
const byState = {};
const area = {};
for (const p of places.slice(1)) {
  const st = p[P.USPS];
  fipsToState[p[P.GEOID].slice(0, 2)] = st;
  const key = placeKey(p[P.NAME]);
  if (!key) continue;
  const land = Number(p[P.ALAND]);
  byState[st] ??= {};
  // Two places with one name in a state (a city and a CDP): keep the larger.
  if (byState[st][key] && area[`${st}|${key}`] >= land) continue;
  byState[st][key] = [r3(p[P.INTPTLAT]), r3(p[P.INTPTLONG])];
  area[`${st}|${key}`] = land;
}

// Each ZIP's state: the county holding most of its land.
const rel = rows(relFile, "|");
const R = Object.fromEntries(rel[0].map((h, i) => [h, i]));
const best = {};
for (const r of rel.slice(1)) {
  const z = r[R.GEOID_ZCTA5_20];
  const county = r[R.GEOID_COUNTY_20];
  if (!z || !county) continue;
  const land = Number(r[R.AREALAND_PART]);
  if (!best[z] || land > best[z].land) best[z] = { land, st: fipsToState[county.slice(0, 2)] ?? "" };
}

const zctas = rows(zctaFile, "\t");
const Z = Object.fromEntries(zctas[0].map((h, i) => [h, i]));
const zcta = {};
for (const z of zctas.slice(1)) zcta[z[Z.GEOID]] = [r3(z[Z.INTPTLAT]), r3(z[Z.INTPTLONG]), best[z[Z.GEOID]]?.st ?? ""];

writeFileSync(join(outDir, "zcta.json"), JSON.stringify(zcta));
writeFileSync(join(outDir, "places.json"), JSON.stringify(byState));
console.log(`zcta: ${Object.keys(zcta).length}, places: ${Object.values(byState).reduce((n, s) => n + Object.keys(s).length, 0)} in ${Object.keys(byState).length} states`);
