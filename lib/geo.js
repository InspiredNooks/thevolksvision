// Turns an address or venue into map coordinates.
// 1) US Census geocoder (free, no key, best for street addresses)
// 2) OpenStreetMap Nominatim (finds venue names; 1 request at a time, identified per their policy)
// 3) The town's center, so the pin still lands in the right place. RJ can drag it in the Studio.
const TOWNS = {
  "st. petersburg": [27.7676, -82.6403], "st petersburg": [27.7676, -82.6403], "saint petersburg": [27.7676, -82.6403], "tampa": [27.9506, -82.4572],
  "clearwater": [27.9659, -82.8001], "clearwater beach": [27.9779, -82.8270], "largo": [27.9095, -82.7873], "pinellas park": [27.8428, -82.6995],
  "kenneth city": [27.8156, -82.7201], "seminole": [27.8398, -82.7912], "dunedin": [28.0197, -82.7718], "palm harbor": [28.0780, -82.7637],
  "tarpon springs": [28.1461, -82.7568], "safety harbor": [27.9909, -82.6932], "oldsmar": [28.0342, -82.6651], "gulfport": [27.7484, -82.7034],
  "st. pete beach": [27.7253, -82.7412], "treasure island": [27.7692, -82.7690], "madeira beach": [27.7975, -82.7973], "brandon": [27.9378, -82.2859],
  "riverview": [27.8661, -82.3265], "plant city": [28.0186, -82.1129], "lakeland": [28.0395, -81.9498], "wesley chapel": [28.2397, -82.3279],
  "new port richey": [28.2442, -82.7193], "port richey": [28.2717, -82.7195], "holiday": [28.1878, -82.7396], "land o' lakes": [28.2189, -82.4573],
  "lutz": [28.1511, -82.4615], "bradenton": [27.4989, -82.5748], "palmetto": [27.5214, -82.5723], "ellenton": [27.5217, -82.5276],
  "sarasota": [27.3364, -82.5307], "apollo beach": [27.7731, -82.4076], "ruskin": [27.7209, -82.4332], "zephyrhills": [28.2336, -82.1812]
};
const UA = "VolksVision/1.0 (garage@thevolksvision.com)";
const near = (lat, lng) => lat > 26.5 && lat < 29.2 && lng > -83.6 && lng < -81.2;   // wider Bay area; ignores look-alike towns elsewhere
const get = (url, ms = 6000) => fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(ms) }).then(r => r.ok ? r.json() : null).catch(() => null);

export function townCenter(city) {
  const k = String(city || "").toLowerCase().replace(/,?\s*(fl|florida)\.?$/, "").replace(/\s+/g, " ").trim();
  const hit = TOWNS[k]; return hit ? { lat: hit[0], lng: hit[1], exact: false } : null;
}

export async function geocode({ venue, address, city }) {
  const cityFL = city ? (/\b(fl|florida)\b/i.test(city) ? city : `${city}, FL`) : "FL";
  if (address && /\d/.test(address)) {
    const q = /\bfl\b|florida/i.test(address) ? address : `${address}, ${cityFL}`;
    const r = await get(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${new URLSearchParams({ address: q, benchmark: "Public_AR_Current", format: "json" })}`);
    const m = r?.result?.addressMatches?.[0]?.coordinates;
    if (m && near(m.y, m.x)) return { lat: m.y, lng: m.x, exact: true };
  }
  for (const q of [address && `${address}, ${cityFL}`, venue && `${venue}, ${cityFL}`].filter(Boolean)) {
    const r = await get(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: "jsonv2", limit: "1", countrycodes: "us" })}`);
    const m = r?.[0];
    if (m && near(+m.lat, +m.lon)) return { lat: +m.lat, lng: +m.lon, exact: true };
  }
  return townCenter(city);
}
