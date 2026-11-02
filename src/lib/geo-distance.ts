/** A point on the map; the state is optional here (distances only). */
export type LatLon = { lat: number; lon: number };

/** Great-circle distance in miles. Kept apart from lib/geo so client code can measure without the place tables. */
export function milesBetween(a: LatLon, b: LatLon): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
