// How a place name is matched (shared by the build script and src/lib/geo.ts):
// lower case, accents dropped, "Saint" → "st", no punctuation, without up to
// `strips` Census kind suffixes ("Denver city" → "denver", "Highlands Ranch
// CDP" → "highlands ranch"). A place's own key strips one; stripping more
// gives an alias ("Boise City city" → "boise city", alias "boise").
const SUFFIX = /\s+(city and borough|consolidated government|metropolitan government|unified government|urban county|municipality|comunidad|zona urbana|plantation|borough|village|city|town|township|cdp|corporation)$/;
export function placeKey(name, strips = 3) {
  let s = String(name).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[.'’]/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < strips; i++) s = s.replace(SUFFIX, "").trim();
  s = s.replace(/\bsaint\b/g, "st").replace(/\bfort\b/g, "ft").replace(/\bmount\b/g, "mt").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  return s;
}
