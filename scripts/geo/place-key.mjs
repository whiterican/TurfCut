// How a place name is matched (shared by the build script and src/lib/geo.ts):
// lower case, "Saint" → "st", no punctuation, without the Census kind
// suffix ("Denver city" → "denver", "Highlands Ranch CDP" → "highlands ranch").
const SUFFIX = /\s+(city and borough|consolidated government|metropolitan government|unified government|urban county|municipality|comunidad|zona urbana|plantation|borough|village|city|town|township|cdp|corporation)$/;
export function placeKey(name) {
  let s = String(name).toLowerCase().replace(/\(.*?\)/g, " ").replace(/[.'’]/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) s = s.replace(SUFFIX, "").trim();
  s = s.replace(/\bsaint\b/g, "st").replace(/\bfort\b/g, "ft").replace(/\bmount\b/g, "mt").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  return s;
}
