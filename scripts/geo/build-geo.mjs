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
const miles = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(h)));
};
/** How close a same-name CDP must be to the one town for the name to mean that town (effectively one place). */
const SAME_PLACE_MILES = 10;

// State FIPS → USPS code, from the places file.
const places = rows(placeFile, "\t");
const ph = places[0];
const P = Object.fromEntries(ph.map((h, i) => [h, i]));
const need = (cols, names, file) => {
  for (const n of names) if (!(n in cols)) throw new Error(`${file}: no ${n} column (has the Census format changed?)`);
};
need(P, ["USPS", "GEOID", "NAME", "INTPTLAT", "INTPTLONG"], placeFile);
const fipsToState = {};
// Per state: key -> list of [lat, lon] for the places whose own name gives that key, and
// key -> [lat, lon] for other names a place goes by (used only when no place's own name is the key).
const own = {};
const alias = {};
const add = (bag, st, key, pt) => {
  if (!key) return;
  bag[st] ??= {};
  (bag[st][key] ??= []).push(pt);
};
for (const p of places.slice(1)) {
  const st = p[P.USPS];
  fipsToState[p[P.GEOID].slice(0, 2)] = st;
  const name = p[P.NAME];
  const pt = [r3(p[P.INTPTLAT]), r3(p[P.INTPTLONG])];
  // Its own key strips only the Census kind ("Goodyear city" → "goodyear"); stripping further
  // ("Goodyear Village CDP" → "goodyear") is an alias, which a place's own name always beats.
  const ownKey = placeKey(name, 1);
  // A census-designated place (CDP, or a Puerto Rico comunidad) is a statistical area, not a town.
  add(own, st, ownKey, [...pt, /\s(cdp|comunidad)$/i.test(name) ? 0 : 1]);
  const loose = placeKey(name, 3);
  if (loose !== ownKey) add(alias, st, loose, pt);
  // "San Buenaventura (Ventura) city" also answers to "Ventura".
  const paren = /\(([^)]+)\)/.exec(name);
  if (paren && !/balance/i.test(paren[1])) add(alias, st, placeKey(paren[1]), pt);
  // Consolidated city-counties: "Nashville-Davidson metropolitan government (balance)" is "Nashville",
  // "Louisville/Jefferson County metro government (balance)" is "Louisville".
  // "Macon-Bibb County" is "Macon"; "Lynchburg, Moore County metropolitan government" is "Lynchburg".
  if (/(government|urban county|\(balance\)|county$)/i.test(name)) add(alias, st, placeKey(name.split(/[-/,]/)[0]), pt);
  // "Urban Honolulu CDP" is "Honolulu".
  if (/^urban /i.test(name)) add(alias, st, placeKey(name.replace(/^urban /i, "")), pt);
}
// One answer per name, or none: two different places with one name in a state are never guessed between.
const byState = {};
let ambiguous = 0;
for (const st of new Set([...Object.keys(own), ...Object.keys(alias)])) {
  byState[st] = {};
  for (const [key, pts] of Object.entries(alias[st] ?? {})) if (pts.length === 1) byState[st][key] = pts[0];
  for (const [key, pts] of Object.entries(own[st] ?? {})) {
    // One place; or one town whose same-name CDPs all sit within a few miles of it (Chevy Chase town
    // and CDP, effectively one place). Otherwise the name is left out, never guessed between: an El
    // Cerrito CDP 389 miles from El Cerrito city is a different place.
    const towns = pts.filter((p) => p[2] === 1);
    const pick =
      pts.length === 1 ? pts[0] : towns.length === 1 && pts.every((p) => p === towns[0] || miles(p, towns[0]) <= SAME_PLACE_MILES) ? towns[0] : null;
    if (pick) byState[st][key] = [pick[0], pick[1]];
    else {
      delete byState[st][key];
      ambiguous++;
    }
  }
}

// Each ZIP's state: the county holding most of its land.
const rel = rows(relFile, "|");
const R = Object.fromEntries(rel[0].map((h, i) => [h, i]));
need(R, ["GEOID_ZCTA5_20", "GEOID_COUNTY_20", "AREALAND_PART"], relFile);
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
need(Z, ["GEOID", "INTPTLAT", "INTPTLONG"], zctaFile);
const zcta = {};
for (const z of zctas.slice(1)) zcta[z[Z.GEOID]] = [r3(z[Z.INTPTLAT]), r3(z[Z.INTPTLONG]), best[z[Z.GEOID]]?.st ?? ""];

writeFileSync(join(outDir, "zcta.json"), JSON.stringify(zcta));
writeFileSync(join(outDir, "places.json"), JSON.stringify(byState));
console.log(`zcta: ${Object.keys(zcta).length}, places: ${Object.values(byState).reduce((n, s) => n + Object.keys(s).length, 0)} in ${Object.keys(byState).length} states; ${ambiguous} names left out as ambiguous within a state`);
