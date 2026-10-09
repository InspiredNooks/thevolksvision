// Regenerates static/img/bay-map.svg (only needed to change the map area or style).
// Data (not in the repo): Natural Earth 10m geojson (land, admin_2_counties, roads, lakes) from
// github.com/nvkelso/natural-earth-vector in ../ne/, and the OpenStreetMap-derived @geo-maps/earth-lands-100m
// package unpacked in ../gm/. Map data © OpenStreetMap contributors (ODbL) and Natural Earth (public domain).
// Usage: npm i @turf/bbox-clip@7 && node --max-old-space-size=6000 make-bay-map.mjs
import fs from "fs";
import bboxClip from "@turf/bbox-clip";
const W = -83.02, E = -81.86, S = 27.26, N = 28.40, LAT0 = (S + N) / 2, K = 900;
const C = Math.cos(LAT0 * Math.PI / 180);
const px = ([lon, lat]) => [(lon - W) * C * K, (N - lat) * K];
const WIDTH = Math.round((E - W) * C * K), HEIGHT = Math.round((N - S) * K);
const box = [W - 0.02, S - 0.02, E + 0.02, N + 0.02];
const load = f => JSON.parse(fs.readFileSync(`../ne/${f}.geojson`));
const r = n => Math.round(n * 10) / 10;
function ringPath(ring, close) {
  let d = "", last = "";
  ring.forEach((pt, i) => { const [x, y] = px(pt).map(r); const s = `${x} ${y}`; if (s === last) return; d += (i ? "L" : "M") + s; last = s; });
  return d + (close ? "Z" : "");
}
function dp(pts, tol) { if (pts.length < 3) return pts; let max = 0, idx = 0; const [a, b] = [pts[0], pts[pts.length - 1]];
  for (let i = 1; i < pts.length - 1; i++) { const [x, y] = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
    const d = Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / L; if (d > max) { max = d; idx = i; } }
  return max > tol ? [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)] : [a, b]; }
function despike(p, maxLen = 40, minDeg = 35) {
  for (let pass = 0; pass < 6; pass++) {
    const out = []; let changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = out.length ? out[out.length - 1] : p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]], l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
      if (l1 && l2 && Math.min(l1, l2) < maxLen) { const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))) * 180 / Math.PI; if (ang < minDeg) { changed = true; continue; } }
      out.push(b);
    }
    p = out; if (!changed || p.length < 4) break;
  }
  return p;
}
const area = p => Math.abs(p.reduce((s, q, i) => { const n = p[(i + 1) % p.length]; return s + q[0] * n[1] - n[0] * q[1]; }, 0) / 2);
function landPath(g, minArea = 40, tol = 1.3) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.map(p => p[0]).map(rg => rg.map(px)).filter(p => area(p) >= minArea).map(p => { const h = p.length >> 1; return [...dp(p.slice(0, h + 1), tol).slice(0, -1), ...dp(p.slice(h, -1), tol)]; }).map(p => despike(p)).filter(p => area(p) >= minArea).filter(p => p.length > 3)
    .map(p => p.map(([x, y], i) => `${i ? "L" : "M"}${r(x)} ${r(y)}`).join("") + "Z").join("");
}
function geomPath(g, close) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : g.type === "LineString" ? [[g.coordinates]] : g.type === "MultiLineString" ? [g.coordinates] : [];
  return polys.flatMap(p => p.filter(rg => rg.length > 1).map(rg => ringPath(rg, close))).join("");
}
const near = f => { try { const [x0, y0, x1, y1] = bbox(f.geometry); return !(x1 < box[0] || x0 > box[2] || y1 < box[1] || y0 > box[3]); } catch { return false; } };
function bbox(g) { let a = [180, 90, -180, -90]; const walk = c => typeof c[0] === "number" ? (a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]) : c.forEach(walk); walk(g.coordinates); return a; }
const clipped = (f, close) => { if (!near(f)) return ""; const c = bboxClip(f, box); return c.geometry ? geomPath(c.geometry, close) : ""; };
const OSM = JSON.parse(fs.readFileSync("../gm/package/map.geo.json")); const landFeats = (OSM.geometries || OSM.features.map(f => f.geometry)).map(g => ({ type: "Feature", properties: {}, geometry: g })).flatMap(f => f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.map(c => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: c } })) : [f]);
const nearL = landFeats.filter(near); const clips = nearL.map(f => bboxClip(f, box)).filter(c => c.geometry && c.geometry.coordinates.length);
const land = clips.map(c => landPath(c.geometry)).join("");
const counties = load("ne_10m_admin_2_counties").features.filter(f => f.properties.ADM0_A3 === "USA" && /FL/.test(f.properties.ISO_3166_2 || f.properties.REGION || "")).map(f => clipped(f, true)).join("");
const lakes = load("ne_10m_lakes").features.filter(near).map(f => { const c = bboxClip(f, box); return c.geometry ? landPath(c.geometry, 60) : ""; }).join("");
const roadsAll = load("ne_10m_roads").features.filter(f => f.properties.sov_a3 === "USA" && near(f));
const roads = roadsAll.filter(f => f.properties.expressway === 1 || /Interstate|Federal/.test(f.properties.type || "")).map(f => clipped(f, false)).join("");
console.error("roads", roadsAll.length, [...new Set(roadsAll.map(f => f.properties.type))]);
const CITIES = [["St. Petersburg", 27.7676, -82.6403, "s"], ["Tampa", 27.9506, -82.4572, "n"], ["Clearwater", 27.9659, -82.8001, "w"], ["Bradenton", 27.4989, -82.5748, "s"], ["Sarasota", 27.3364, -82.5307, "s"],
  ["Lakeland", 28.0395, -81.9498, "w"], ["Brandon", 27.9378, -82.2859, "s"], ["New Port Richey", 28.2442, -82.7193, "e"], ["Wesley Chapel", 28.2397, -82.3279, "s"], ["Largo", 27.9095, -82.7873, "w"], ["Plant City", 28.0186, -82.1129, "s"]];
const label = ([n, lat, lon, side]) => { const [x, y] = px([lon, lat]); const t = side === "w" ? [x - 9, y + 4, "end"] : side === "e" ? [x + 9, y + 4, "start"] : side === "n" ? [x, y - 9, "middle"] : [x, y + 18, "middle"];
  return `<circle cx="${r(x)}" cy="${r(y)}" r="2.6" class="c"/><text x="${r(t[0])}" y="${r(t[1])}" text-anchor="${t[2]}">${n}</text>`; };
const water = (n, lat, lon, cls = "w") => { const [x, y] = px([lon, lat]); return `<text x="${r(x)}" y="${r(y)}" class="${cls}" text-anchor="middle">${n}</text>`; };
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Map of the Tampa Bay area">
<style>.l{fill:#171b19}.k{fill:none;stroke:#2a302d;stroke-width:.8}.s{fill:none;stroke:#646c68;stroke-width:1.3;stroke-linejoin:round}.q{fill:#0b0d0c;stroke:#3a413e;stroke-width:.8}.r{fill:none;stroke:#2f3532;stroke-width:1.1;stroke-dasharray:1 0}.c{fill:#8a918d}text{font:600 13px system-ui,-apple-system,Segoe UI,sans-serif;fill:#8a918d;letter-spacing:.04em}.w{font:italic 500 14px Georgia,serif;fill:#3c4440;letter-spacing:.3em;text-transform:uppercase}.wb{font:italic 500 22px Georgia,serif;fill:#333a37;letter-spacing:.45em}</style>
<rect width="100%" height="100%" fill="#0b0d0c"/>
<defs><clipPath id="land"><path d="${land}"/></clipPath></defs><path class="l" d="${land}"/><g clip-path="url(#land)"><path class="k" d="${counties}"/><path class="q" d="${lakes}"/><path class="r" d="${roads}"/></g><path class="s" d="${land}"/>
${water("TAMPA BAY", 27.71, -82.555)}${water("THE GULF", 27.62, -82.86, "wb")}
${CITIES.map(label).join("")}
</svg>`;
fs.writeFileSync("bay-map.svg", svg);
fs.writeFileSync("bounds.json", JSON.stringify({ W, E, S, N, LAT0, WIDTH, HEIGHT }));
console.log(WIDTH, HEIGHT, svg.length);
