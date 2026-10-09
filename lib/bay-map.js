// The /next/ map: static/img/bay-map.svg (made by scripts/make-bay-map.mjs from
// OpenStreetMap coastline data and Natural Earth counties/roads) and the projection that places pins on it.
export const BAY = { W: -82.95, E: -82.2, S: 27.45, N: 28.26, LAT0: 27.855, WIDTH: 829, HEIGHT: 1013 };
const C = Math.cos(BAY.LAT0 * Math.PI / 180), K = 1250;
// Pin position as % of the map's width/height, or null when it's off the map.
export function pinXY(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const x = (lng - BAY.W) * C * K / BAY.WIDTH * 100, y = (BAY.N - lat) * K / BAY.HEIGHT * 100;
  return x < 1 || x > 99 || y < 1 || y > 99 ? null : { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}
// Map % back to lat/lng (the Studio's tap-to-place pin).
export const fromXY = (x, y) => ({ lat: Math.round((BAY.N - y / 100 * BAY.HEIGHT / K) * 1e5) / 1e5, lng: Math.round((BAY.W + x / 100 * BAY.WIDTH / (C * K)) * 1e5) / 1e5 });
